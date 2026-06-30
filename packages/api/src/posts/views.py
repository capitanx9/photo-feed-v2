import hmac

from common.s3 import make_raw_key, make_upload_presign, validate_upload_params
from common.schema import ERROR_400, ERROR_401, ERROR_404, internal_schema, posts_schema
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PostMedia
from .serializers import (
    MediaProcessedSerializer,
    PostMediaSerializer,
    UploadURLRequestSerializer,
    UploadURLResponseSerializer,
)


class UploadURLView(APIView):
    permission_classes = [IsAuthenticated]

    @posts_schema(
        summary="Request a presigned S3 upload URL",
        description=(
            "Validates the intended content type and size, creates a pending PostMedia "
            "row, and returns a short-lived presigned PUT URL. The client must PUT the "
            "file with the exact Content-Type and Content-Length passed here. An S3 "
            "PutObject event on the upload then triggers the cut_image Lambda, which "
            "calls back to /internal/media/processed/ to flip the PostMedia to ready."
        ),
        request=UploadURLRequestSerializer,
        responses={200: UploadURLResponseSerializer, 400: ERROR_400, 401: ERROR_401},
    )
    def post(self, request: Request) -> Response:
        serializer = UploadURLRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content_type = serializer.validated_data["content_type"]
        content_length = serializer.validated_data["content_length"]
        kind = serializer.validated_data["kind"]
        try:
            ext = validate_upload_params(content_type=content_type, content_length=content_length)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        key = make_raw_key(user_id=request.user.id, kind=kind, extension=ext)
        media = PostMedia.objects.create(
            owner=request.user,
            kind=kind,
            s3_key_raw=key,
            status=PostMedia.Status.PENDING,
        )
        upload_url = make_upload_presign(
            key=key,
            content_type=content_type,
            content_length=content_length,
        )
        return Response(
            UploadURLResponseSerializer(
                {
                    "media_id": media.id,
                    "upload_url": upload_url,
                    "s3_key": key,
                    "expires_in": settings.S3_PRESIGN_TTL_SECONDS,
                }
            ).data
        )


class MediaDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @posts_schema(
        summary="Get media status",
        description="Owner-only poll for upload/resize status.",
        request=None,
        responses={200: PostMediaSerializer, 401: ERROR_401, 404: ERROR_404},
    )
    def get(self, request: Request, pk: int) -> Response:
        media = get_object_or_404(PostMedia, pk=pk, owner=request.user)
        return Response(PostMediaSerializer(media).data)


def _verify_lambda_token(request: Request) -> bool:
    raw = request.META.get("HTTP_X_LAMBDA_TOKEN", "")
    return hmac.compare_digest(raw, settings.WEBHOOK_SHARED_SECRET)


@internal_schema(
    summary="Lambda webhook: media processed",
    description=(
        "Called by the cut_image Lambda after a raw upload has been resized. "
        "Authentication: X-Lambda-Token header must match WEBHOOK_SHARED_SECRET."
    ),
    request=MediaProcessedSerializer,
    responses={204: None, 401: ERROR_401, 404: ERROR_404},
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def media_processed(request: Request) -> Response:
    if not _verify_lambda_token(request):
        return Response({"detail": "Invalid lambda token"}, status=status.HTTP_401_UNAUTHORIZED)
    serializer = MediaProcessedSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    media = get_object_or_404(PostMedia, s3_key_raw=serializer.validated_data["s3_key"])
    media.s3_key_resized = serializer.validated_data["s3_key_resized"]
    media.status = serializer.validated_data["status"]
    media.save(update_fields=["s3_key_resized", "status"])
    return Response(status=status.HTTP_204_NO_CONTENT)
