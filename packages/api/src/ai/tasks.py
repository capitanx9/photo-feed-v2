"""Celery task that bridges Django (eu-central-1) to generate_image Lambda (us-west-2).

The Lambda is invoked synchronously (RequestResponse) so we get the
image keys back in the same call. The worker updates the GenerationJob
row in-place; the frontend polls GET /api/ai/jobs/<id>/ for status.
"""

from __future__ import annotations

import json
import logging

import boto3
from api.celery_app import celery_app
from django.conf import settings

from .models import GenerationJob

logger = logging.getLogger(__name__)


def _build_lambda_payload(job: GenerationJob) -> dict[str, object]:
    return {
        "user_id": job.user_id,
        "job_id": str(job.id),
        "prompt": job.prompt,
        "variants_count": job.variants_count,
        "aspect_ratio": job.aspect_ratio,
    }


@celery_app.task(name="ai.generate_image")
def generate_image_task(job_id: int) -> None:
    job = GenerationJob.objects.get(pk=job_id)
    job.status = GenerationJob.Status.RUNNING
    job.save(update_fields=["status", "updated_at"])

    client = boto3.client("lambda", region_name=settings.BEDROCK_REGION)
    try:
        resp = client.invoke(
            FunctionName=settings.GENERATE_IMAGE_LAMBDA_NAME,
            InvocationType="RequestResponse",
            Payload=json.dumps(_build_lambda_payload(job)).encode(),
        )
        body = json.loads(resp["Payload"].read())
        if resp.get("FunctionError"):
            raise RuntimeError(f"Lambda error: {body}")
    except Exception as exc:
        # Broad catch is intentional: anything from Bedrock throttling to
        # malformed JSON should land in GenerationJob.error so the user
        # sees a failed-state polling response instead of a hung job.
        logger.exception("generate_image failed for job %s", job_id)
        job.status = GenerationJob.Status.FAILED
        job.error = str(exc)[:1000]
        job.save(update_fields=["status", "error", "updated_at"])
        return

    job.image_keys = body.get("image_keys", [])
    job.seeds = body.get("seeds", [])
    job.status = GenerationJob.Status.READY
    job.save(update_fields=["image_keys", "seeds", "status", "updated_at"])
