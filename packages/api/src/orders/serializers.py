from decimal import Decimal
from typing import Any

from posts.models import Post
from rest_framework import serializers

from .models import Cart, CartItem, Order, OrderItem


class CartItemSerializer(serializers.ModelSerializer):
    post_id = serializers.IntegerField(source="post.id", read_only=True)
    price = serializers.DecimalField(
        source="post.price", max_digits=10, decimal_places=2, read_only=True
    )
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ["id", "post_id", "qty", "price", "line_total", "created_at"]
        read_only_fields = fields

    def get_line_total(self, obj: CartItem) -> Decimal:
        price = obj.post.price or Decimal("0")
        result: Decimal = price * obj.qty
        return result


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Cart
        fields = ["id", "items", "total", "updated_at"]
        read_only_fields = fields

    def to_representation(self, instance: Cart) -> dict[str, Any]:
        data: dict[str, Any] = super().to_representation(instance)
        total = sum(
            ((item.post.price or Decimal("0")) * item.qty for item in instance.items.all()),
            start=Decimal("0"),
        )
        data["total"] = str(total.quantize(Decimal("0.01")))
        return data


class CartItemAddSerializer(serializers.Serializer):
    post_id = serializers.IntegerField()
    qty = serializers.IntegerField(min_value=1, default=1)

    def validate_post_id(self, value: int) -> int:
        try:
            post = Post.objects.get(pk=value)
        except Post.DoesNotExist as exc:
            raise serializers.ValidationError("Post not found") from exc
        if post.price is None:
            raise serializers.ValidationError("Post is not for sale")
        return value


class CartItemUpdateSerializer(serializers.Serializer):
    qty = serializers.IntegerField(min_value=1)


class OrderItemSerializer(serializers.ModelSerializer):
    post_id = serializers.IntegerField(source="post.id", read_only=True)
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ["id", "post_id", "qty", "price_at_purchase", "line_total"]
        read_only_fields = fields

    def get_line_total(self, obj: OrderItem) -> Decimal:
        result: Decimal = obj.price_at_purchase * obj.qty
        return result


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "status",
            "total",
            "payment_method",
            "shipping_name",
            "shipping_address",
            "shipping_city",
            "shipping_zip",
            "shipping_country",
            "items",
            "created_at",
        ]
        read_only_fields = ["id", "status", "total", "items", "created_at"]


PAYMENT_METHODS = ["card", "paypal", "crypto", "cod"]


class CheckoutSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(choices=PAYMENT_METHODS)
    shipping_name = serializers.CharField(max_length=128)
    shipping_address = serializers.CharField(max_length=256)
    shipping_city = serializers.CharField(max_length=128)
    shipping_zip = serializers.CharField(max_length=32)
    shipping_country = serializers.CharField(max_length=64, allow_blank=True, default="")
