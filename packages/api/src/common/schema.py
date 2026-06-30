"""Helpers that pin down a uniform shape for every @extend_schema usage."""

from typing import Any

from drf_spectacular.utils import OpenApiResponse, extend_schema

from .serializers import ErrorSerializer

ERROR_400 = OpenApiResponse(response=ErrorSerializer, description="Validation error")
ERROR_401 = OpenApiResponse(response=ErrorSerializer, description="Authentication required")
ERROR_404 = OpenApiResponse(response=ErrorSerializer, description="Not found")
ERROR_429 = OpenApiResponse(response=ErrorSerializer, description="Rate limit exceeded")


def tagged_schema(
    tag: str,
    *,
    summary: str,
    description: str,
    request: Any = None,
    responses: dict[int, Any],
) -> Any:
    return extend_schema(
        tags=[tag],
        summary=summary,
        description=description,
        request=request,
        responses=responses,
    )


def auth_schema(**kwargs: Any) -> Any:
    return tagged_schema("auth", **kwargs)


def health_schema(**kwargs: Any) -> Any:
    return tagged_schema("health", **kwargs)


def users_schema(**kwargs: Any) -> Any:
    return tagged_schema("users", **kwargs)


def posts_schema(**kwargs: Any) -> Any:
    return tagged_schema("posts", **kwargs)


def internal_schema(**kwargs: Any) -> Any:
    return tagged_schema("internal", **kwargs)


def cart_schema(**kwargs: Any) -> Any:
    return tagged_schema("cart", **kwargs)


def orders_schema(**kwargs: Any) -> Any:
    return tagged_schema("orders", **kwargs)


def ai_schema(**kwargs: Any) -> Any:
    return tagged_schema("ai", **kwargs)
