"""S3 helpers shared between media-upload, AI-draft, and approve flows.

Two clients per region: a server-side one (used for put/get/head from
inside Django) and a presigner (used to mint URLs that the browser
itself will follow). The split matters when AWS_S3_ENDPOINT_URL points
at something other than the AWS public endpoint — e.g. MinIO in a dev
docker network — because the signed `host` header must match what the
browser actually requests. In stage/prod both env vars are unset, both
clients talk straight to AWS, and the helpers collapse to plain boto3.
"""

import uuid

import boto3
from botocore.config import Config
from django.conf import settings


def _client_kwargs(region: str, *, public: bool = False) -> dict[str, object]:
    kwargs: dict[str, object] = {"region_name": region}
    endpoint = (
        settings.AWS_S3_PUBLIC_ENDPOINT_URL
        if public and settings.AWS_S3_PUBLIC_ENDPOINT_URL
        else settings.AWS_S3_ENDPOINT_URL
    )
    if endpoint:
        kwargs["endpoint_url"] = endpoint
        kwargs["config"] = Config(signature_version="s3v4", s3={"addressing_style": "path"})
    return kwargs


def get_s3_client():  # type: ignore[no-untyped-def]
    return boto3.client("s3", **_client_kwargs(settings.AWS_REGION))


def get_s3_presigner():  # type: ignore[no-untyped-def]
    return boto3.client("s3", **_client_kwargs(settings.AWS_REGION, public=True))


def get_generated_s3_client():  # type: ignore[no-untyped-def]
    return boto3.client("s3", **_client_kwargs(settings.S3_GENERATED_REGION))


def get_generated_s3_presigner():  # type: ignore[no-untyped-def]
    return boto3.client("s3", **_client_kwargs(settings.S3_GENERATED_REGION, public=True))


def make_raw_key(user_id: int, kind: str, extension: str) -> str:
    return f"raw/{kind}s/{user_id}/{uuid.uuid4().hex}.{extension.lstrip('.')}"


def make_upload_presign(*, key: str, content_type: str, content_length: int) -> str:
    url: str = get_s3_presigner().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.S3_UPLOADS_BUCKET,
            "Key": key,
            "ContentType": content_type,
            "ContentLength": content_length,
        },
        ExpiresIn=settings.S3_PRESIGN_TTL_SECONDS,
    )
    return url


def make_download_presign(*, key: str) -> str:
    url: str = get_s3_presigner().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_UPLOADS_BUCKET, "Key": key},
        ExpiresIn=settings.S3_PRESIGN_TTL_SECONDS,
    )
    return url


def make_download_presign_for_generated(*, key: str) -> str:
    url: str = get_generated_s3_presigner().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_GENERATED_BUCKET, "Key": key},
        ExpiresIn=settings.S3_PRESIGN_TTL_SECONDS,
    )
    return url


def make_approved_key(user_id: int) -> str:
    return f"processed/ai/{user_id}/{uuid.uuid4().hex}.png"


def copy_generated_to_uploads(*, src_key: str, dst_key: str) -> None:
    """Copy a draft PNG from the generated bucket (us-west-2) into the
    uploads bucket (eu-central-1). The destination client is region-pinned
    to uploads; boto3 issues a server-side CopyObject which S3 routes
    cross-region. ContentType is fixed to image/png — generate_image
    Lambda only produces PNGs."""
    get_s3_client().copy_object(
        Bucket=settings.S3_UPLOADS_BUCKET,
        Key=dst_key,
        CopySource={"Bucket": settings.S3_GENERATED_BUCKET, "Key": src_key},
        MetadataDirective="REPLACE",
        ContentType="image/png",
    )


EXT_BY_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def validate_upload_params(*, content_type: str, content_length: int) -> str:
    if content_type not in settings.UPLOAD_ALLOWED_MIME:
        raise ValueError(f"content_type must be one of {settings.UPLOAD_ALLOWED_MIME}")
    if content_length <= 0 or content_length > settings.UPLOAD_MAX_BYTES:
        raise ValueError(
            f"content_length must be in (0, {settings.UPLOAD_MAX_BYTES}], got {content_length}"
        )
    return EXT_BY_MIME[content_type]
