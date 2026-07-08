"""Flip every pending Order to paid.

Mirrors the admin site's "Approve selected pending orders" action but
in bulk, so a dev or a stage smoke can unblock every parked checkout
popup at once (they long-poll on /api/orders/<id>/wait-confirm/ and
wake as soon as the status flips).

Publishes on the same Redis channel the admin action uses, so any
active wait-confirm long-poll returns immediately.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from orders.models import Order
from orders.wait_confirm import publish_status


class Command(BaseCommand):
    help = "Approve every pending Order (pending → paid). Wakes wait-confirm subscribers."

    def handle(self, *args, **opts) -> None:  # type: ignore[no-untyped-def, override]
        # Snapshot ids before the update — the queryset is lazy and
        # would come back empty after the status flip. Same pattern the
        # admin action uses.
        pending_ids = list(
            Order.objects.filter(status=Order.Status.PENDING).values_list("id", flat=True)
        )
        if not pending_ids:
            self.stdout.write(self.style.WARNING("No pending orders."))
            return
        updated = Order.objects.filter(id__in=pending_ids).update(status=Order.Status.PAID)
        for order_id in pending_ids:
            publish_status(order_id)
        self.stdout.write(self.style.SUCCESS(f"Approved {updated} pending order(s)."))
