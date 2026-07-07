from decimal import Decimal

from common.schema import ERROR_400, ERROR_401, ERROR_404, cart_schema, orders_schema
from django.db import transaction
from django.shortcuts import get_object_or_404
from posts.models import Post
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Cart, CartItem, Order, OrderItem
from .pagination import OrdersCursorPagination
from .serializers import (
    CartItemAddSerializer,
    CartItemSerializer,
    CartItemUpdateSerializer,
    CartSerializer,
    CheckoutSerializer,
    OrderSerializer,
)


class CartView(APIView):
    permission_classes = [IsAuthenticated]

    @cart_schema(
        summary="Get the current cart",
        description="Returns (or creates) the cart for the authenticated user.",
        request=None,
        responses={200: CartSerializer, 401: ERROR_401},
    )
    def get(self, request: Request) -> Response:
        cart, _ = Cart.objects.get_or_create(user=request.user)
        return Response(CartSerializer(cart).data)


class CartItemsView(APIView):
    permission_classes = [IsAuthenticated]

    @cart_schema(
        summary="Add an item to the cart",
        description=(
            "Adds the given post to the cart. If the post is already in the cart, "
            "the qty is incremented by the supplied amount (default 1). "
            "Posts without a price cannot be added."
        ),
        request=CartItemAddSerializer,
        responses={201: CartItemSerializer, 400: ERROR_400, 401: ERROR_401},
    )
    def post(self, request: Request) -> Response:
        serializer = CartItemAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cart, _ = Cart.objects.get_or_create(user=request.user)
        post = Post.objects.get(pk=serializer.validated_data["post_id"])
        item, created = CartItem.objects.get_or_create(
            cart=cart,
            post=post,
            defaults={"qty": serializer.validated_data["qty"]},
        )
        if not created:
            item.qty += serializer.validated_data["qty"]
            item.save(update_fields=["qty"])
        return Response(
            CartItemSerializer(item).data,
            status=status.HTTP_201_CREATED,
        )


class CartItemDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_item(self, request: Request, pk: int) -> CartItem:
        item: CartItem = get_object_or_404(CartItem, pk=pk, cart__user=request.user)
        return item

    @cart_schema(
        summary="Update cart item qty (absolute)",
        description="Sets the item's qty to the value in the body.",
        request=CartItemUpdateSerializer,
        responses={200: CartItemSerializer, 401: ERROR_401, 404: ERROR_404},
    )
    def patch(self, request: Request, pk: int) -> Response:
        item = self._get_item(request, pk)
        serializer = CartItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item.qty = serializer.validated_data["qty"]
        item.save(update_fields=["qty"])
        return Response(CartItemSerializer(item).data)

    @cart_schema(
        summary="Remove an item from the cart",
        description="Owner only.",
        request=None,
        responses={204: None, 401: ERROR_401, 404: ERROR_404},
    )
    def delete(self, request: Request, pk: int) -> Response:
        item = self._get_item(request, pk)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    @orders_schema(
        summary="Create an order from the current cart",
        description=(
            "Snapshots each cart item's current post price into the order, then empties the "
            "cart. The order is created with status='pending' and moves to 'paid' after an "
            "admin approves it. Empty carts return 400."
        ),
        request=CheckoutSerializer,
        responses={201: OrderSerializer, 400: ERROR_400, 401: ERROR_401},
    )
    def post(self, request: Request) -> Response:
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cart, _ = Cart.objects.get_or_create(user=request.user)
        items = list(cart.items.select_related("post"))
        if not items:
            return Response({"detail": "Cart is empty"}, status=status.HTTP_400_BAD_REQUEST)
        if any(item.post.price is None for item in items):
            return Response(
                {"detail": "Cart contains items without a price"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            total = sum(
                (item.post.price * item.qty for item in items),
                start=Decimal("0"),
            )
            order = Order.objects.create(
                user=request.user,
                total=total,
                **serializer.validated_data,
            )
            OrderItem.objects.bulk_create(
                [
                    OrderItem(
                        order=order,
                        post=item.post,
                        qty=item.qty,
                        price_at_purchase=item.post.price,
                    )
                    for item in items
                ]
            )
            cart.items.all().delete()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderListView(ListAPIView):
    serializer_class = OrderSerializer
    pagination_class = OrdersCursorPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):  # type: ignore[no-untyped-def]
        return (
            Order.objects.filter(user=self.request.user)
            .prefetch_related("items")
            .select_related("user")
        )

    @orders_schema(
        summary="List my orders",
        description="Cursor-paginated history of the caller's orders, newest first.",
        request=None,
        responses={200: OrderSerializer(many=True), 401: ERROR_401},
    )
    def get(self, request, *args, **kwargs):  # type: ignore[no-untyped-def, override]
        return super().get(request, *args, **kwargs)


class OrderDetailView(RetrieveAPIView):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):  # type: ignore[no-untyped-def]
        return Order.objects.filter(user=self.request.user).prefetch_related("items")

    @orders_schema(
        summary="Retrieve one of my orders",
        description="Owner only — 404 for other users' orders.",
        request=None,
        responses={200: OrderSerializer, 401: ERROR_401, 404: ERROR_404},
    )
    def get(self, request, *args, **kwargs):  # type: ignore[no-untyped-def, override]
        return super().get(request, *args, **kwargs)
