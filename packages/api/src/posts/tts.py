"""Text-to-speech endpoint for post captions.

POST /api/posts/<pk>/tts/ synthesises the caption to an mp3 with Amazon
Polly and caches it in S3 under tts/<pk>-<hash>.mp3. Cache key includes
a short hash of the caption text, so editing the caption produces a
fresh object without stepping on the old one.

Returns a short-lived presigned GET URL for the browser's <audio>
element to hit directly — Django never streams the mp3 itself.
"""

from __future__ import annotations

import hashlib

import boto3
from botocore.exceptions import ClientError
from common.s3 import (
    get_s3_client,
    make_download_presign_with_ttl,
)
from common.schema import ERROR_400, ERROR_401, ERROR_404, posts_schema
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Post

# Module-scope Polly client for cold-start amortisation. Region is the
# same as the app; Polly is available in eu-central-1.
_POLLY = boto3.client("polly", region_name=settings.AWS_REGION)

# Presigned URL TTL for the mp3 — long enough for the browser to fully
# play the clip on a slow connection. Independent from the general
# S3_PRESIGN_TTL_SECONDS (which is tuned for uploads).
_PRESIGN_TTL_SECONDS = 15 * 60


class TTSResponseSerializer(serializers.Serializer):
    audio_url = serializers.URLField()
    cached = serializers.BooleanField()


def _cache_key(post_id: int, caption: str) -> str:
    digest = hashlib.sha1(caption.encode("utf-8")).hexdigest()[:12]
    return f"tts/{post_id}-{digest}.mp3"


def _object_exists(client, bucket: str, key: str) -> bool:  # type: ignore[no-untyped-def]
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
            return False
        raise


class PostTTSView(APIView):
    permission_classes = [IsAuthenticated]

    @posts_schema(
        summary="Synthesise a post caption to speech",
        description=(
            "Runs Amazon Polly on the post's caption, caches the mp3 in the "
            "uploads bucket under tts/<post>-<hash>.mp3, and returns a "
            "short-lived presigned GET URL for the audio. Captions shorter "
            "than TTS_MIN_CAPTION_CHARS get a 400 — they don't need audio."
        ),
        request=None,
        responses={
            200: TTSResponseSerializer,
            400: ERROR_400,
            401: ERROR_401,
            404: ERROR_404,
        },
    )
    def post(self, request: Request, pk: int) -> Response:
        post = get_object_or_404(Post, pk=pk, status=Post.Status.PUBLISHED)
        caption = (post.caption or "").strip()
        if len(caption) < settings.TTS_MIN_CAPTION_CHARS:
            return Response(
                {
                    "detail": (
                        f"Caption is too short for TTS (<{settings.TTS_MIN_CAPTION_CHARS} chars)."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        s3 = get_s3_client()
        key = _cache_key(post.id, caption)
        cached = _object_exists(s3, settings.S3_UPLOADS_BUCKET, key)

        if not cached:
            polly_response = _POLLY.synthesize_speech(
                Text=caption,
                OutputFormat="mp3",
                VoiceId=settings.TTS_VOICE_ID,
                Engine=settings.TTS_ENGINE,
            )
            audio_bytes = polly_response["AudioStream"].read()
            s3.put_object(
                Bucket=settings.S3_UPLOADS_BUCKET,
                Key=key,
                Body=audio_bytes,
                ContentType="audio/mpeg",
            )

        url = make_download_presign_with_ttl(key=key, ttl=_PRESIGN_TTL_SECONDS)
        return Response(TTSResponseSerializer({"audio_url": url, "cached": cached}).data)
