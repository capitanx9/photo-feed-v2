from django.conf import settings
from django.db import models


class Cart(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cart",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Cart({self.user_id})"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    post = models.ForeignKey("posts.Post", on_delete=models.CASCADE)
    qty = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("cart", "post")]
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"CartItem(cart={self.cart_id}, post={self.post_id}, qty={self.qty})"


class Order(models.Model):
    class Status(models.TextChoices):
        PAID = "paid"
        SHIPPED = "shipped"
        CANCELLED = "cancelled"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="orders",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PAID)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=32)
    shipping_name = models.CharField(max_length=128)
    shipping_address = models.CharField(max_length=256)
    shipping_city = models.CharField(max_length=128)
    shipping_zip = models.CharField(max_length=32)
    shipping_country = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"Order#{self.pk} ({self.status})"


class OrderItem(models.Model):
    # post is PROTECTed so historical orders never lose their line items
    # when an owner deletes the underlying post.
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    post = models.ForeignKey("posts.Post", on_delete=models.PROTECT)
    qty = models.PositiveIntegerField()
    price_at_purchase = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"OrderItem(order={self.order_id}, post={self.post_id}, qty={self.qty})"
