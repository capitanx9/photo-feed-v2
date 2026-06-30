from common.ratelimit import allow as ratelimit_allow
from common.schema import ERROR_400, ERROR_401, ERROR_404, ERROR_429, ai_schema
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.urls import reverse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import GenerationJob
from .serializers import (
    FIXED_ASPECT_RATIO,
    GenerationCreateResponseSerializer,
    GenerationCreateSerializer,
    GenerationJobSerializer,
)
from .tasks import generate_image_task


class GenerateView(APIView):
    permission_classes = [IsAuthenticated]

    @ai_schema(
        summary="Request image generation",
        description=(
            "Validates the prompt and variants count, creates a queued GenerationJob, "
            "and dispatches a Celery task that invokes the generate_image Lambda in "
            "us-west-2. Returns 202 with a polling URL. Rate-limited per user "
            "(AI_RATE_LIMIT_PER_HOUR, sliding 1-hour window). aspect_ratio is fixed "
            "to 1:1 server-side; negative prompts are not exposed."
        ),
        request=GenerationCreateSerializer,
        responses={
            202: GenerationCreateResponseSerializer,
            400: ERROR_400,
            401: ERROR_401,
            429: ERROR_429,
        },
    )
    def post(self, request: Request) -> Response:
        if not ratelimit_allow(
            scope="ai-generate",
            identity=str(request.user.id),
            limit=settings.AI_RATE_LIMIT_PER_HOUR,
            window_seconds=3600,
        ):
            return Response(
                {"detail": "Rate limit exceeded - try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        serializer = GenerationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = GenerationJob.objects.create(
            user=request.user,
            prompt=serializer.validated_data["prompt"],
            variants_count=serializer.validated_data["variants_count"],
            aspect_ratio=FIXED_ASPECT_RATIO,
            status=GenerationJob.Status.QUEUED,
        )
        generate_image_task.delay(job.id)
        status_url = reverse("ai:job-detail", kwargs={"pk": job.id})
        return Response(
            GenerationCreateResponseSerializer({"job_id": job.id, "status_url": status_url}).data,
            status=status.HTTP_202_ACCEPTED,
        )


class JobDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @ai_schema(
        summary="Get generation job status",
        description=(
            "Returns the job state plus presigned GET URLs for the result PNGs once "
            "status is 'ready'. Owner-only."
        ),
        request=None,
        responses={200: GenerationJobSerializer, 401: ERROR_401, 404: ERROR_404},
    )
    def get(self, request: Request, pk: int) -> Response:
        job = get_object_or_404(GenerationJob, pk=pk, user=request.user)
        return Response(GenerationJobSerializer(job).data)
