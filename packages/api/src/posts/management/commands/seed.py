"""Populate the stage database with demo users + posts.

Creates N users under the *@seed.local domain (skipped if they already
exist), then P posts per user. Each post gets one 512x512 JPEG pulled
from picsum.photos, uploaded straight into photo-feed-uploads/processed/
by the command itself (bypassing cut_image — the point is to seed data,
not to exercise the async pipeline; that flow is already covered by
the manual smoke on /posts/new).

Usage inside the running api container:

  docker compose exec web python manage.py seed --users 5 --posts 3

Idempotent when re-run: existing seed users are found by email and
reused, so re-running only tops up posts. Pass --fresh to first delete
every seed user (Post + PostMedia + Order + Cart cascade) and start
clean.
"""

from __future__ import annotations

import io
import random
import urllib.request
import uuid
from decimal import Decimal

from common.s3 import get_s3_client
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from users.models import User

from posts.models import Post, PostMedia

SEED_DOMAIN = "seed.local"
SEED_PASSWORD = "stagepass123"
SAMPLE_CAPTIONS = [
    "Straight from the studio",
    "Fresh drop, limited stock",
    "Golden hour catch",
    "Weekend find",
    "Rare piece, hand-picked",
    "The colour of the season",
    "Made to last",
    "Small batch, big attention",
    "Feels like home",
    "For the quiet moments",
]


class Command(BaseCommand):
    help = "Seed the database with demo users and published posts."

    def add_arguments(self, parser):  # type: ignore[no-untyped-def]
        parser.add_argument("--users", type=int, default=5)
        parser.add_argument("--posts", type=int, default=3)
        parser.add_argument(
            "--fresh",
            action="store_true",
            help="Delete existing seed users before creating anew.",
        )

    def handle(self, *args, **opts):  # type: ignore[no-untyped-def, override]
        num_users: int = opts["users"]
        posts_per_user: int = opts["posts"]

        if opts["fresh"]:
            deleted, _ = User.objects.filter(email__endswith=f"@{SEED_DOMAIN}").delete()
            self.stdout.write(self.style.WARNING(f"Deleted {deleted} seed rows."))

        s3 = get_s3_client()
        created_users = 0
        created_posts = 0

        for i in range(1, num_users + 1):
            email = f"user{i}@{SEED_DOMAIN}"
            user, was_created = User.objects.get_or_create(email=email)
            if was_created:
                user.set_password(SEED_PASSWORD)
                user.save(update_fields=["password"])
                created_users += 1

            for _ in range(posts_per_user):
                caption = random.choice(SAMPLE_CAPTIONS)
                price = Decimal(f"{random.randint(1000, 9900) / 100:.2f}")
                seed_slug = uuid.uuid4().hex[:12]
                jpeg = _download_placeholder(seed_slug)
                key = f"processed/seed/{user.id}/{seed_slug}.jpg"
                s3.put_object(
                    Bucket=settings.S3_UPLOADS_BUCKET,
                    Key=key,
                    Body=jpeg,
                    ContentType="image/jpeg",
                )

                with transaction.atomic():
                    media = PostMedia.objects.create(
                        owner=user,
                        kind=PostMedia.Kind.POST,
                        s3_key_raw=key,
                        s3_key_resized=key,
                        status=PostMedia.Status.READY,
                    )
                    post = Post.objects.create(
                        owner=user,
                        caption=caption,
                        price=price,
                        status=Post.Status.PUBLISHED,
                    )
                    media.post = post
                    media.save(update_fields=["post"])
                created_posts += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {created_users} new user(s), {created_posts} post(s). "
                f"Password for every seed user: {SEED_PASSWORD}"
            )
        )


def _download_placeholder(seed: str) -> bytes:
    """Pull one 512x512 JPEG from picsum.photos. The `seed` path segment
    makes the response deterministic per call, so re-runs stay stable."""
    url = f"https://picsum.photos/seed/{seed}/512"
    req = urllib.request.Request(url, headers={"User-Agent": "photo-feed-seed"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        buf = io.BytesIO()
        buf.write(resp.read())
        return buf.getvalue()
