"""Helpers for setting/clearing the auth cookies on responses."""

from django.conf import settings
from rest_framework.response import Response


def set_auth_cookies(response: Response, access: str, refresh: str) -> Response:
    access_max_age = int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())
    refresh_max_age = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())
    common = {
        "httponly": True,
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
    }
    response.set_cookie(
        settings.ACCESS_TOKEN_COOKIE,
        access,
        max_age=access_max_age,
        path="/",
        **common,
    )
    response.set_cookie(
        settings.REFRESH_TOKEN_COOKIE,
        refresh,
        max_age=refresh_max_age,
        path="/api/auth/",
        **common,
    )
    return response


def clear_auth_cookies(response: Response) -> Response:
    response.delete_cookie(settings.ACCESS_TOKEN_COOKIE, path="/")
    response.delete_cookie(settings.REFRESH_TOKEN_COOKIE, path="/api/auth/")
    return response
