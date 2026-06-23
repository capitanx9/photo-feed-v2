"""generate_image Lambda — Bedrock SD3 → S3 drafts in us-west-2.

Phase 5 stub: returns a fixed payload so we can prove the build → deploy →
invoke chain works before any real generation logic lands. The real handler
will:
  - Parse {prompt, variants_count, aspect_ratio} from the invoke payload.
  - asyncio.gather InvokeModel on stability.sd3-large-v1:0 N times in parallel.
  - Put each PNG to drafts/<user>/<job>/<i>.png in photo-feed-generated-usw2.
  - Mint presigned GET URLs (expires 1h) and return image_keys[] + seeds[].

Boto3 clients (bedrock-runtime, s3) live in module scope so cold-start
initialisation runs once per container, not per invocation. SnapStart is
enabled on the function so warm starts skip cold-init entirely.
"""

from __future__ import annotations


def handler(event: dict, context: object) -> dict:
    return {"ok": True, "from": "generate_image"}
