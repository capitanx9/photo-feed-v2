"""Speech-to-text endpoint.

POST /api/stt/ takes a multipart audio blob (webm/opus, ogg, mp3, wav),
uploads it under stt/<uuid>.<ext> in the uploads bucket, starts an
Amazon Transcribe job with automatic language identification, polls
until the job is COMPLETED, then fetches the result JSON from S3 and
returns the transcript text.

Blocking on Transcribe from a gunicorn worker is acceptable for the
lab-scale short clips this endpoint takes; anything above ~30s of audio
would need a job-based async pattern instead. A hard timeout and a
2 MB upload cap keep a single worker from getting stuck.

Uploaded audio and Transcribe result JSON live under stt/ with a 1-day
S3 lifecycle rule — one-shot artefacts, no reason to keep them.
"""

from __future__ import annotations

import json
import time
import uuid

import boto3
from common.s3 import get_s3_client
from common.schema import ERROR_400, ERROR_401, ERROR_500, posts_schema
from django.conf import settings
from rest_framework import serializers, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

# Module-scope Transcribe client. Region matches the app; Transcribe is
# available in eu-central-1.
_TRANSCRIBE = boto3.client("transcribe", region_name=settings.AWS_REGION)

# Accepted upload MIME types → file extension for the object key.
# Transcribe reads MediaFormat from the extension, so it has to match
# the real container.
_MIME_TO_EXT = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
}
_EXT_TO_MEDIA_FORMAT = {
    "webm": "webm",
    "ogg": "ogg",
    "mp4": "mp4",
    "mp3": "mp3",
    "wav": "wav",
}


class STTRequestSerializer(serializers.Serializer):
    audio = serializers.FileField()


class STTResponseSerializer(serializers.Serializer):
    text = serializers.CharField()
    language_code = serializers.CharField(required=False, allow_blank=True)


class STTView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    @posts_schema(
        summary="Transcribe an audio clip to text",
        description=(
            "Takes a short audio blob (webm/opus, ogg, mp4, mp3, wav) as "
            "multipart 'audio' field, uploads it to S3, runs Amazon "
            "Transcribe with automatic language identification, polls until "
            "the job completes, and returns the transcript. Blocking call; "
            "hard timeout at STT_POLL_TIMEOUT_SECONDS."
        ),
        request=STTRequestSerializer,
        responses={
            200: STTResponseSerializer,
            400: ERROR_400,
            401: ERROR_401,
            500: ERROR_500,
        },
    )
    def post(self, request: Request) -> Response:
        serializer = STTRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        audio = serializer.validated_data["audio"]

        content_type = (audio.content_type or "").split(";", 1)[0].strip().lower()
        ext = _MIME_TO_EXT.get(content_type)
        if ext is None:
            return Response(
                {
                    "detail": (
                        f"Unsupported audio type {content_type!r}. "
                        f"Use one of {sorted(_MIME_TO_EXT)}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if audio.size is None or audio.size <= 0 or audio.size > settings.STT_MAX_AUDIO_BYTES:
            return Response(
                {
                    "detail": (
                        f"Audio blob size must be in (0, {settings.STT_MAX_AUDIO_BYTES}] bytes."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        s3 = get_s3_client()
        job_uuid = uuid.uuid4().hex
        media_key = f"stt/{job_uuid}.{ext}"
        output_key = f"stt/{job_uuid}.json"

        s3.put_object(
            Bucket=settings.S3_UPLOADS_BUCKET,
            Key=media_key,
            Body=audio.read(),
            ContentType=content_type,
        )

        job_name = f"photo-feed-stt-{job_uuid}"
        _TRANSCRIBE.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={"MediaFileUri": f"s3://{settings.S3_UPLOADS_BUCKET}/{media_key}"},
            MediaFormat=_EXT_TO_MEDIA_FORMAT[ext],
            OutputBucketName=settings.S3_UPLOADS_BUCKET,
            OutputKey=output_key,
            IdentifyLanguage=True,
        )

        deadline = time.monotonic() + settings.STT_POLL_TIMEOUT_SECONDS
        while True:
            job = _TRANSCRIBE.get_transcription_job(TranscriptionJobName=job_name)[
                "TranscriptionJob"
            ]
            state = job["TranscriptionJobStatus"]
            if state == "COMPLETED":
                break
            if state == "FAILED":
                reason = job.get("FailureReason", "unknown Transcribe failure")
                return Response(
                    {"detail": f"Transcribe job failed: {reason}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            if time.monotonic() > deadline:
                return Response(
                    {"detail": "Transcribe job timed out."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            time.sleep(settings.STT_POLL_INTERVAL_SECONDS)

        result_obj = s3.get_object(Bucket=settings.S3_UPLOADS_BUCKET, Key=output_key)
        result = json.loads(result_obj["Body"].read())
        transcript = result["results"]["transcripts"][0]["transcript"]
        language_code = job.get("LanguageCode", "")

        return Response(
            STTResponseSerializer({"text": transcript, "language_code": language_code}).data
        )
