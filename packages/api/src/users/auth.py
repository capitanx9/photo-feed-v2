"""DRF authentication class that reads the JWT from an HttpOnly cookie."""

from django.conf import settings
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request: Request):  # type: ignore[override]
        raw_token = request.COOKIES.get(settings.ACCESS_TOKEN_COOKIE)
        if raw_token is None:
            return None
        try:
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        except (InvalidToken, AuthenticationFailed, TokenError):
            # Stale cookie for a deleted user, or token past its exp. Treat
            # as anonymous so AllowAny views still work; IsAuthenticated
            # views 401 themselves.
            return None


class CookieJWTSchema(OpenApiAuthenticationExtension):
    target_class = "users.auth.CookieJWTAuthentication"
    name = "cookieAuth"

    def get_security_definition(self, auto_schema) -> dict:  # type: ignore[no-untyped-def, type-arg]
        return {
            "type": "apiKey",
            "in": "cookie",
            "name": settings.ACCESS_TOKEN_COOKIE,
        }
