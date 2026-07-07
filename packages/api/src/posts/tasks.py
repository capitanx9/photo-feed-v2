"""Background tasks for the posts app."""

from __future__ import annotations

import contextlib
import logging
from datetime import timedelta

from celery import shared_task
from common.s3 import get_s3_client
from django.conf import settings
from django.utils import timezone

from .models import PostMedia

logger = logging.getLogger(__name__)


# Grace window before a media without a post is considered orphaned.
# The publish flow creates the media first (via /api/posts/upload-url/)
# and only later attaches it to a Post via POST /api/posts/. A generous
# window covers a user who leaves /posts/new open for a long session
# without submitting.
ORPHAN_GRACE = timedelta(hours=24)


@shared_task
def cleanup_orphan_media(dry_run: bool = False) -> dict[str, int]:
    """Delete PostMedia rows that never got attached to a Post.

    Runs on a Celery beat schedule (every hour). We only touch rows
    older than ORPHAN_GRACE so the /posts/new happy-path — media
    created seconds before /api/posts/ is called — is never at risk.

    For each doomed row we also fire-and-forget S3 deletes of raw + resized
    keys in the uploads bucket. delete_object is a no-op on missing keys,
    so we don't try to head_object first.

    Avatars are excluded: an unattached avatar means "not yet picked
    as PATCH me.avatar_media_id", which is a legitimate flow, not garbage.
    """
    cutoff = timezone.now() - ORPHAN_GRACE
    qs = PostMedia.objects.filter(
        post__isnull=True,
        kind=PostMedia.Kind.POST,
        created_at__lt=cutoff,
    )
    count = qs.count()
    if count == 0:
        return {"found": 0, "deleted": 0}

    if dry_run:
        logger.info("cleanup_orphan_media DRY-RUN: would delete %d rows", count)
        return {"found": count, "deleted": 0}

    s3 = get_s3_client()
    bucket = settings.S3_UPLOADS_BUCKET
    deleted_rows = 0
    for media in qs.iterator(chunk_size=100):
        for key in (media.s3_key_raw, media.s3_key_resized):
            if not key:
                continue
            # A failing S3 delete shouldn't block the DB row removal —
            # the S3 lifecycle rule on raw/ (7d) is our second net.
            with contextlib.suppress(Exception):
                s3.delete_object(Bucket=bucket, Key=key)
        media.delete()
        deleted_rows += 1

    logger.info("cleanup_orphan_media: deleted %d orphan media rows", deleted_rows)
    return {"found": count, "deleted": deleted_rows}
