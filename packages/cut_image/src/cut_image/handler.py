"""cut_image Lambda — square-crop S3 uploads to 512x512 and webhook Django.

Phase 5 stub: returns a fixed payload so we can prove the build → deploy →
invoke chain works before any real cropping logic lands. The real handler
will:
  - Read raw/<user>/<media_id>.{jpg,png} from photo-feed-uploads (S3 PutObject event).
  - Square-crop center to 512x512 JPEG q=85 with Pillow.
  - Put processed/<user>/<media_id>.jpg back to the same bucket.
  - POST to /internal/media/processed/ on Django with an HMAC-signed body so
    PostMedia.status flips to ready.

Boto3 / Pillow clients live in module scope so cold-start initialisation
runs once per container, not per invocation.
"""

from __future__ import annotations


def handler(event: dict, context: object) -> dict:
    return {"ok": True, "from": "cut_image"}
