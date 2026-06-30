"""cut_image Lambda — square-crop S3 uploads to 512x512 and webhook Django.

Triggered by an S3 PutObject on photo-feed-uploads under raw/. Reads the
raw image, square-crops it to 512x512 JPEG (q=85, LANCZOS, EXIF-rotated),
writes the result under processed/ in the same bucket, then POSTs to
Django's /internal/media/processed/ with status=ready or status=failed.

The shared webhook token is pulled from AWS Secrets Manager once per
container (cold start) — the ARN is in MEDIA_WEBHOOK_SECRET_ARN.

The handler also short-circuits on the empty payload `{}` (or `{"ping"}`)
that deploy-lambdas-stage smoke-tests with. Without this shortcut a
real handler would raise on the missing Records key and break smoke.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.request
from io import BytesIO
from typing import Any

import boto3
from PIL import Image, ImageOps

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TARGET_SIZE = 512
JPEG_QUALITY = 85
WEBHOOK_TIMEOUT_SECONDS = 10

_S3 = boto3.client("s3")
_SECRETS = boto3.client("secretsmanager")

_WEBHOOK_SECRET_CACHE: str | None = None


def _get_webhook_secret() -> str:
    global _WEBHOOK_SECRET_CACHE
    if _WEBHOOK_SECRET_CACHE is None:
        arn = os.environ["MEDIA_WEBHOOK_SECRET_ARN"]
        resp = _SECRETS.get_secret_value(SecretId=arn)
        _WEBHOOK_SECRET_CACHE = resp["SecretString"]
    return _WEBHOOK_SECRET_CACHE


def resize_to_square(raw_bytes: bytes) -> bytes:
    img = Image.open(BytesIO(raw_bytes))
    img = ImageOps.exif_transpose(img)
    img = ImageOps.fit(img, (TARGET_SIZE, TARGET_SIZE), method=Image.Resampling.LANCZOS)
    out = BytesIO()
    img.convert("RGB").save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


def _processed_key(raw_key: str) -> str:
    if not raw_key.startswith("raw/"):
        raise ValueError(f"Expected key under raw/, got: {raw_key}")
    stem = raw_key[len("raw/") :].rsplit(".", 1)[0]
    return f"processed/{stem}.jpg"


def _notify_django(*, s3_key: str, s3_key_resized: str, status: str) -> None:
    base = os.environ["API_BASE_URL"].rstrip("/")
    url = f"{base}/internal/media/processed/"
    body = json.dumps(
        {"s3_key": s3_key, "s3_key_resized": s3_key_resized, "status": status}
    ).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Lambda-Token": _get_webhook_secret(),
        },
    )
    with urllib.request.urlopen(req, timeout=WEBHOOK_TIMEOUT_SECONDS) as resp:
        if resp.status >= 300:
            raise RuntimeError(f"webhook returned {resp.status}")


def _process_record(bucket: str, key: str) -> None:
    logger.info("processing s3://%s/%s", bucket, key)
    try:
        raw_obj = _S3.get_object(Bucket=bucket, Key=key)
        resized = resize_to_square(raw_obj["Body"].read())
        processed_key = _processed_key(key)
        _S3.put_object(
            Bucket=bucket,
            Key=processed_key,
            Body=resized,
            ContentType="image/jpeg",
        )
        _notify_django(s3_key=key, s3_key_resized=processed_key, status="ready")
        logger.info("ready: s3://%s/%s", bucket, processed_key)
    except Exception:
        logger.exception("failed to process s3://%s/%s", bucket, key)
        try:
            _notify_django(s3_key=key, s3_key_resized="", status="failed")
        except Exception:
            logger.exception("failed-status webhook also failed for s3://%s/%s", bucket, key)
        raise


def handler(event: dict[str, Any], _context: object) -> dict[str, Any]:
    if not event or set(event.keys()) <= {"ping"}:
        return {"ok": True, "from": "cut_image"}

    records = event.get("Records", [])
    for record in records:
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]
        _process_record(bucket, key)
    return {"processed": len(records)}
