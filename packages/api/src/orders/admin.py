from django.contrib import admin, messages
from django.http import HttpRequest
from django.utils.translation import ngettext

from .models import Cart, CartItem, Order, OrderItem
from .wait_confirm import publish_status


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ["post", "qty", "price_at_purchase"]
    can_delete = False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "status", "total", "created_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["user__email", "shipping_name", "shipping_city"]
    readonly_fields = ["total", "created_at"]
    inlines = [OrderItemInline]
    actions = ["approve_orders"]

    @admin.action(description="Approve selected pending orders (→ paid)")
    def approve_orders(self, request: HttpRequest, queryset) -> None:  # type: ignore[no-untyped-def]
        # Snapshot ids of the pending rows BEFORE the update so we can
        # wake the right long-poll subscribers; the queryset itself is
        # lazy and would come back empty after the flip.
        pending_ids = list(
            queryset.filter(status=Order.Status.PENDING).values_list("id", flat=True)
        )
        updated = Order.objects.filter(id__in=pending_ids).update(status=Order.Status.PAID)
        for order_id in pending_ids:
            publish_status(order_id)
        self.message_user(
            request,
            ngettext(
                "%d order was approved.",
                "%d orders were approved.",
                updated,
            )
            % updated,
            messages.SUCCESS,
        )


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "updated_at"]
    search_fields = ["user__email"]
    inlines = [CartItemInline]
