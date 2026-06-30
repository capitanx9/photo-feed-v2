from django.conf import settings
from django.db import models


class GenerationJob(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued"
        RUNNING = "running"
        READY = "ready"
        FAILED = "failed"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="generation_jobs",
    )
    prompt = models.TextField()
    negative_prompt = models.TextField(blank=True, default="")
    variants_count = models.PositiveSmallIntegerField()
    aspect_ratio = models.CharField(max_length=8)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.QUEUED)
    # image_keys and seeds parallel the Bedrock SD3 output: each variant
    # gets one S3 key (drafts/<user>/<job>/<i>.png) and one seed value
    # used to reproduce or differentiate the generation. Plain JSONField
    # (not ArrayField) keeps us off the Postgres-specific path.
    image_keys = models.JSONField(default=list, blank=True)
    seeds = models.JSONField(default=list, blank=True)
    error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"GenerationJob#{self.pk} {self.status}"
