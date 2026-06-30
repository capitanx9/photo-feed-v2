from django.urls import path

from .views import (
    CartItemDetailView,
    CartItemsView,
    CartView,
    CheckoutView,
    OrderDetailView,
    OrderListView,
)

cart_urlpatterns = [
    path("", CartView.as_view(), name="cart"),
    path("items/", CartItemsView.as_view(), name="cart-items"),
    path("items/<int:pk>/", CartItemDetailView.as_view(), name="cart-item-detail"),
]

orders_urlpatterns = [
    path("", OrderListView.as_view(), name="order-list"),
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("<int:pk>/", OrderDetailView.as_view(), name="order-detail"),
]
