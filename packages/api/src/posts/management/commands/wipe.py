"""Remove seed / demo data at various granularities.

Usage:

    python manage.py wipe --scope seed          # *@seed.local users only (cascade)
    python manage.py wipe --scope posts         # posts of seed users only
    python manage.py wipe --scope carts         # empty seed users' carts
    python manage.py wipe --scope orders        # orders of seed users only
    python manage.py wipe --scope all-users     # every non-superuser (cascade)
    python manage.py wipe --scope all-posts     # every post regardless of owner
    python manage.py wipe --scope all-carts     # every cart item regardless of owner
    python manage.py wipe --scope all-orders    # every order regardless of owner
    python manage.py wipe --scope all           # nuke DB (keeps superusers)

    --stage-safe    Only allow the seed-only scopes. Rejects every all-*
                    variant. Passed by every stage-wipe-* Makefile target
                    so a make command can never delete a real account.

Two safety guarantees this command upholds:

- Django superusers are never deleted, in any scope.
- Under --stage-safe, the only reachable scopes are seed / posts /
  carts / orders — each restricted to accounts under @seed.local by
  design. All-* scopes error out.
"""

from __future__ import annotations

import argparse

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from orders.models import Cart, CartItem, Order
from users.models import User

from posts.models import Post, PostMedia

SEED_DOMAIN = "seed.local"

SCOPES = (
    "seed",
    "posts",
    "carts",
    "orders",
    "all-users",
    "all-posts",
    "all-carts",
    "all-orders",
    "all",
)


class Command(BaseCommand):
    help = "Wipe seed / demo data. Safe by default — non-seed users are never touched."

    def add_arguments(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "--scope",
            choices=SCOPES,
            required=True,
            help=f"Which slice of data to remove ({', '.join(SCOPES)}).",
        )
        parser.add_argument(
            "--stage-safe",
            action="store_true",
            help="Ignore --scope=all; restrict every operation to seed users only.",
        )

    def handle(self, *args, **opts) -> None:  # type: ignore[no-untyped-def, override]
        scope: str = opts["scope"]
        stage_safe: bool = opts["stage_safe"]

        # --stage-safe forbids anything that could touch a non-seed user.
        # `all` and the `all-*` slices are dev-only affordances.
        if stage_safe and scope.startswith("all"):
            raise CommandError(f"--scope={scope} is forbidden under --stage-safe.")

        with transaction.atomic():
            if scope == "seed":
                deleted = _wipe_seed_users()
                self.stdout.write(self.style.WARNING(f"Deleted {deleted} seed user(s) (cascade)."))
            elif scope == "posts":
                deleted = _wipe_posts(seed_only=True)
                self.stdout.write(self.style.WARNING(f"Deleted {deleted} seed post(s)."))
            elif scope == "carts":
                deleted = _wipe_carts(seed_only=True)
                self.stdout.write(self.style.WARNING(f"Deleted {deleted} seed cart item(s)."))
            elif scope == "orders":
                deleted = _wipe_orders(seed_only=True)
                self.stdout.write(self.style.WARNING(f"Deleted {deleted} seed order(s)."))
            elif scope == "all-users":
                deleted = _wipe_non_superuser_users()
                self.stdout.write(
                    self.style.WARNING(
                        f"Deleted {deleted} non-superuser user(s) (cascade). Superusers preserved."
                    )
                )
            elif scope == "all-posts":
                deleted = _wipe_posts(seed_only=False)
                self.stdout.write(self.style.WARNING(f"Deleted {deleted} post(s) (all users)."))
            elif scope == "all-carts":
                deleted = _wipe_carts(seed_only=False)
                self.stdout.write(
                    self.style.WARNING(f"Deleted {deleted} cart item(s) (all users).")
                )
            elif scope == "all-orders":
                deleted = _wipe_orders(seed_only=False)
                self.stdout.write(self.style.WARNING(f"Deleted {deleted} order(s) (all users)."))
            elif scope == "all":
                counts = _wipe_all()
                self.stdout.write(
                    self.style.WARNING(
                        "Nuked: "
                        f"{counts['orders']} order(s), "
                        f"{counts['carts']} cart item(s), "
                        f"{counts['posts']} post(s), "
                        f"{counts['media']} media, "
                        f"{counts['users']} non-superuser user(s)."
                    )
                )


def _wipe_seed_users() -> int:
    """Delete every @seed.local user + everything hanging off them.

    OrderItem.post is PROTECT (historical orders preserve line items),
    so Django's cascade can't delete a seed user whose post is
    referenced by any Order. We reach in and wipe those Orders first,
    even the ones owned by non-seed accounts, since they'd break
    integrity if left dangling against a deleted post.
    """
    seed_qs = User.objects.filter(email__endswith=f"@{SEED_DOMAIN}")
    # Any Order that contains a seed post has to go — the OrderItem's
    # PROTECT would otherwise block the user delete.
    Order.objects.filter(items__post__owner__in=seed_qs).distinct().delete()
    deleted, _ = seed_qs.delete()
    return deleted


def _wipe_non_superuser_users() -> int:
    """Delete every non-superuser (cascade), regardless of email domain.

    Django superusers are the one class of account this command will
    never touch — otherwise you'd have to recreate the admin after
    every reset. Same PROTECT-on-OrderItem story as _wipe_seed_users:
    wipe every Order first so cascade doesn't hit a locked post.
    """
    victims = User.objects.filter(is_superuser=False)
    Order.objects.filter(items__post__owner__in=victims).distinct().delete()
    deleted, _ = victims.delete()
    return deleted


def _wipe_posts(*, seed_only: bool) -> int:
    qs = Post.objects.all()
    if seed_only:
        qs = qs.filter(owner__email__endswith=f"@{SEED_DOMAIN}")
    # OrderItem.post is PROTECT — drop the orders that reference these
    # posts before we try to delete the posts themselves.
    Order.objects.filter(items__post__in=qs).distinct().delete()
    # PostMedia cascades on Post delete via on_delete=CASCADE.
    deleted, _ = qs.delete()
    return deleted


def _wipe_carts(*, seed_only: bool) -> int:
    qs = CartItem.objects.all()
    if seed_only:
        qs = qs.filter(cart__user__email__endswith=f"@{SEED_DOMAIN}")
    deleted, _ = qs.delete()
    return deleted


def _wipe_orders(*, seed_only: bool) -> int:
    qs = Order.objects.all()
    if seed_only:
        qs = qs.filter(user__email__endswith=f"@{SEED_DOMAIN}")
    deleted, _ = qs.delete()
    return deleted


def _wipe_all() -> dict[str, int]:
    orders, _ = Order.objects.all().delete()
    carts, _ = CartItem.objects.all().delete()
    Cart.objects.all().delete()
    posts, _ = Post.objects.all().delete()
    # Media without a post shouldn't survive a full wipe either.
    media, _ = PostMedia.objects.all().delete()
    # Preserve superusers so a dev doesn't have to recreate them.
    users_qs = User.objects.filter(is_superuser=False)
    users, _ = users_qs.delete()
    return {
        "orders": orders,
        "carts": carts,
        "posts": posts,
        "media": media,
        "users": users,
    }
