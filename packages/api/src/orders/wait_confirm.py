"""Long-poll endpoint for order confirmation.

GET /api/orders/<pk>/wait-confirm/ blocks the caller for up to
WAIT_CONFIRM_TIMEOUT_SECONDS while an admin flips the order out of
`pending`. Sync path:

1. Load the order (owner-only).
2. If status is already non-pending, return immediately.
3. Otherwise subscribe to a Redis pubsub channel keyed by the order id.
   The admin action publishes a single message on that channel when it
   flips the status (see orders/admin.py). Any published message wakes
   us; we then re-read the order and return the fresh serializer.
4. If the timeout fires with no message, re-read the order (in case the
   publish was lost — e.g. worker restart mid-approval) and return
   whatever the DB shows.

Blocking a gunicorn worker for up to 25s is fine for the stage-scale
this app is at — the checkout flow is low-traffic. If the worker pool
ever gets saturated by parked long-polls, this endpoint is the first
thing that should move to ASGI + Django Channels.
"""

from __future__ import annotations

import contextlib

import redis
from common.schema import ERROR_401, ERROR_404, orders_schema
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Order
from .serializers import OrderSerializer

_CHANNEL_PREFIX = "order-status:"


def _channel(order_id: int) -> str:
    return f"{_CHANNEL_PREFIX}{order_id}"


def publish_status(order_id: int) -> None:
    """Wake anyone parked on wait-confirm for this order.

    Called from the admin `approve` action right after the DB flip.
    Message body is unused; any subscriber wake-up triggers a fresh DB
    read on the other end.
    """
    client = redis.Redis.from_url(settings.REDIS_URL)
    client.publish(_channel(order_id), "changed")


class OrderWaitConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    @orders_schema(
        summary="Long-poll until an order leaves the pending state",
        description=(
            "Blocks up to WAIT_CONFIRM_TIMEOUT_SECONDS (25s) while the caller's "
            "order sits in 'pending'. Returns as soon as the admin approve action "
            "flips the status (via Redis pubsub) or when the timeout fires. Always "
            "returns the current server-side view of the order."
        ),
        request=None,
        responses={200: OrderSerializer, 401: ERROR_401, 404: ERROR_404},
    )
    def get(self, request: Request, pk: int) -> Response:
        order = get_object_or_404(Order, pk=pk, user=request.user)
        if order.status != Order.Status.PENDING:
            return Response(OrderSerializer(order).data)

        client = redis.Redis.from_url(settings.REDIS_URL)
        pubsub = client.pubsub(ignore_subscribe_messages=True)
        pubsub.subscribe(_channel(pk))
        try:
            pubsub.get_message(timeout=settings.WAIT_CONFIRM_TIMEOUT_SECONDS)
        finally:
            with contextlib.suppress(Exception):
                pubsub.close()

        order.refresh_from_db()
        return Response(OrderSerializer(order).data)
