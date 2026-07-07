"""generate_image Lambda — Bedrock Stability SD3.5 → S3 drafts in us-west-2.

Invoked synchronously by the Django Celery worker. Generates
`variants_count` images by calling Bedrock Stability SD3.5 in parallel
(asyncio.gather), uploads each PNG to drafts/<user>/<job>/<i>.png in
the drafts bucket, and returns image_keys + seeds. Presigned GET URLs
are minted on the Django side, not here — that way the lambda doesn't
need to know the API's TTL convention.

Region is us-west-2 because that's where Bedrock Stability SD3.5 lives; the drafts
bucket is co-located so put_object is a same-region write.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import secrets
import time
from typing import Any

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Module-scope clients: instantiated once per container at cold start
# (and frozen into the SnapStart snapshot), reused across invocations.
_BEDROCK = boto3.client("bedrock-runtime")
_S3 = boto3.client("s3")

MAX_VARIANTS = 4
ALLOWED_ASPECT_RATIOS = {"1:1", "4:5", "16:9"}
THROTTLING_RETRIES = 3
THROTTLING_BACKOFF_SECONDS = (1.0, 2.0, 4.0)


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _build_payload(*, prompt: str, aspect_ratio: str, seed: int) -> dict[str, Any]:
    # Bedrock Stability SD3.5 ignores width/height — image size is derived from
    # aspect_ratio (1:1 -> 1024x1024). We also intentionally don't
    # forward negative_prompt: the public endpoint hardcodes it to "".
    return {
        "prompt": prompt,
        "mode": "text-to-image",
        "aspect_ratio": aspect_ratio,
        "output_format": "png",
        "seed": seed,
    }


def _invoke_with_retry(model_id: str, body: bytes) -> dict[str, Any]:
    """Synchronous invoke_model wrapped in fixed-backoff retry on Throttling."""
    last_exc: ClientError | None = None
    for attempt in range(THROTTLING_RETRIES):
        try:
            resp = _BEDROCK.invoke_model(
                modelId=model_id,
                contentType="application/json",
                accept="application/json",
                body=body,
            )
            return json.loads(resp["body"].read())
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code != "ThrottlingException" or attempt == THROTTLING_RETRIES - 1:
                raise
            sleep_for = THROTTLING_BACKOFF_SECONDS[attempt]
            logger.warning(
                "ThrottlingException attempt %d/%d, sleeping %.1fs",
                attempt + 1,
                THROTTLING_RETRIES,
                sleep_for,
            )
            time.sleep(sleep_for)
            last_exc = exc
    raise RuntimeError("invoke_with_retry exhausted retries") from last_exc


async def _generate_one(
    model_id: str, bucket: str, prompt: str, aspect_ratio: str, key: str
) -> tuple[str, int]:
    seed = secrets.randbits(31)
    body = json.dumps(_build_payload(prompt=prompt, aspect_ratio=aspect_ratio, seed=seed)).encode()
    loop = asyncio.get_event_loop()
    payload = await loop.run_in_executor(None, _invoke_with_retry, model_id, body)

    # Bedrock Stability SD3.5 returns finish_reasons; non-null means a content filter
    # blocked the generation. Surface as a hard error so the Celery task
    # marks the job as failed instead of writing a half-result.
    finish_reason = payload.get("finish_reasons", [None])[0]
    if finish_reason is not None:
        raise RuntimeError(f"Bedrock content filter tripped: {finish_reason}")

    png_bytes = base64.b64decode(payload["images"][0])
    await loop.run_in_executor(
        None,
        lambda: _S3.put_object(Bucket=bucket, Key=key, Body=png_bytes, ContentType="image/png"),
    )
    logger.info("generated s3://%s/%s (seed=%d)", bucket, key, seed)
    return key, seed


async def _handler_async(event: dict[str, Any]) -> dict[str, Any]:
    user_id = event["user_id"]
    job_id = event["job_id"]
    prompt = event["prompt"]
    variants_count = int(event.get("variants_count", 1))
    aspect_ratio = event.get("aspect_ratio", "1:1")

    if not 1 <= variants_count <= MAX_VARIANTS:
        raise ValueError(f"variants_count must be in [1, {MAX_VARIANTS}], got {variants_count}")
    if aspect_ratio not in ALLOWED_ASPECT_RATIOS:
        raise ValueError(
            f"aspect_ratio must be one of {sorted(ALLOWED_ASPECT_RATIOS)}, got {aspect_ratio!r}"
        )

    model_id = _required_env("BEDROCK_MODEL_ID")
    bucket = _required_env("DRAFTS_BUCKET")

    tasks = [
        _generate_one(
            model_id,
            bucket,
            prompt,
            aspect_ratio,
            f"drafts/{user_id}/{job_id}/{i}.png",
        )
        for i in range(variants_count)
    ]
    results = await asyncio.gather(*tasks)
    image_keys = [k for k, _ in results]
    seeds = [s for _, s in results]
    return {"image_keys": image_keys, "seeds": seeds}


def handler(event: dict, context: object) -> dict:
    # Empty payload = deploy-stage smoke ping. Return a cheap shape that
    # the workflow can grep for without spending Bedrock quota on every
    # deploy. Any real invocation carries job_id/prompt and falls through.
    if not event or set(event.keys()) <= {"ping"}:
        return {"ok": True, "from": "generate_image"}
    return asyncio.run(_handler_async(event))
