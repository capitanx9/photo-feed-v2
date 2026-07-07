import hmac

from common.s3 import make_raw_key, make_upload_presign, validate_upload_params
from common.schema import ERROR_400, ERROR_401, ERROR_404, internal_schema, posts_schema
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import ListAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Post, PostMedia
from .pagination import PostsCursorPagination
from .serializers import (
    MediaProcessedSerializer,
    PostCreateSerializer,
    PostMediaSerializer,
    PostSerializer,
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


class PostListCreateView(APIView):
    """GET = public feed (cursor-paginated published posts).
    POST = authenticated user creates a post from media they already uploaded."""

    # AllowAny on the class so GET stays open (feed is public); POST
    # keeps its own is_authenticated check below.
    permission_classes = [AllowAny]

    @posts_schema(
        summary="List published posts (feed)",
        description="Cursor-paginated feed of all published posts. Public.",
        request=None,
        responses={200: PostSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        qs = (
            Post.objects.filter(status=Post.Status.PUBLISHED)
            .select_related("owner")
            .prefetch_related("media")
        )
        paginator = PostsCursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(PostSerializer(page, many=True).data)

    @posts_schema(
        summary="Create a post",
        description=(
            "Attach already-uploaded, owner-owned, post-less PostMedia to a new Post. "
            "media_ids must be non-empty; every id must belong to the authenticated user "
            "and not already be attached to another post."
        ),
        request=PostCreateSerializer,
        responses={201: PostSerializer, 400: ERROR_400, 401: ERROR_401},
    )
    def post(self, request: Request) -> Response:
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED
            )
        serializer = PostCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        media_ids = serializer.validated_data["media_ids"]
        media_qs = PostMedia.objects.filter(
            pk__in=media_ids,
            owner=request.user,
            post__isnull=True,
        )
        if media_qs.count() != len(set(media_ids)):
            return Response(
                {"detail": "media_ids contain unknown, foreign, or already-attached media"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        post = Post.objects.create(
            owner=request.user,
            caption=serializer.validated_data.get("caption", ""),
            price=serializer.validated_data.get("price"),
            status=Post.Status.PUBLISHED,
        )
        media_qs.update(post=post)
        return Response(PostSerializer(post).data, status=status.HTTP_201_CREATED)


class PostDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Post.objects.all().select_related("owner").prefetch_related("media")
    serializer_class = PostSerializer

    def get_permissions(self):  # type: ignore[no-untyped-def]
        if self.request.method in ("GET", "HEAD"):
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_object(self) -> Post:  # type: ignore[override]
        obj: Post = get_object_or_404(self.get_queryset(), pk=self.kwargs["pk"])
        if self.request.method not in ("GET", "HEAD") and obj.owner_id != self.request.user.id:
            raise PermissionDenied("Not your post")
        return obj

    @posts_schema(
        summary="Retrieve a post",
        description="Public read of one post including its media.",
        request=None,
        responses={200: PostSerializer, 404: ERROR_404},
    )
    def get(self, request: Request, *args, **kwargs):  # type: ignore[no-untyped-def, override]
        return super().get(request, *args, **kwargs)

    @posts_schema(
        summary="Update a post",
        description="Owner-only patch of caption and/or price.",
        request=PostSerializer,
        responses={200: PostSerializer, 400: ERROR_400, 401: ERROR_401, 404: ERROR_404},
    )
    def patch(self, request: Request, *args, **kwargs):  # type: ignore[no-untyped-def, override]
        return super().patch(request, *args, **kwargs)

    @posts_schema(
        summary="Delete a post",
        description="Owner-only. Cascades to PostMedia rows for this post.",
        request=None,
        responses={204: None, 401: ERROR_401, 404: ERROR_404},
    )
    def delete(self, request: Request, *args, **kwargs):  # type: ignore[no-untyped-def, override]
        return super().delete(request, *args, **kwargs)


class UserPostsView(ListAPIView):
    serializer_class = PostSerializer
    pagination_class = PostsCursorPagination
    permission_classes = [AllowAny]

    def get_queryset(self):  # type: ignore[no-untyped-def, override]
        return (
            Post.objects.filter(
                owner_id=self.kwargs["pk"],
                status=Post.Status.PUBLISHED,
            )
            .select_related("owner")
            .prefetch_related("media")
        )

    @posts_schema(
        summary="List a user's published posts",
        description="Cursor-paginated public list of published posts by user id.",
        request=None,
        responses={200: PostSerializer(many=True)},
    )
    def get(self, request: Request, *args, **kwargs):  # type: ignore[no-untyped-def, override]
        return super().get(request, *args, **kwargs)
