from django.conf import settings
from django.db import models


class Post(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft"
        PUBLISHED = "published"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="posts",
    )
    caption = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PUBLISHED)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"Post#{self.pk} by {self.owner_id}"


class PostMedia(models.Model):
    class Kind(models.TextChoices):
        POST = "post"
        AVATAR = "avatar"

    class Status(models.TextChoices):
        PENDING = "pending"
        READY = "ready"
        FAILED = "failed"

    # post is nullable: user can collect media (upload/AI-approve) before
    # the Post row exists; the post field is filled in on publish.
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="media",
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="media",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.POST)
    s3_key_raw = models.CharField(max_length=512, unique=True)
    s3_key_resized = models.CharField(max_length=512, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"PostMedia#{self.pk} {self.status}"
