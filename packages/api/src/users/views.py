import contextlib
from datetime import UTC, datetime

from common.schema import ERROR_400, ERROR_401, ERROR_404, auth_schema, users_schema
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .cookies import clear_auth_cookies, set_auth_cookies
from .serializers import (
    LoginSerializer,
    RegisterSerializer,
    SessionUserSerializer,
    UserSerializer,
    UserUpdateSerializer,
)

User = get_user_model()


def _issue_tokens(user) -> tuple[str, str]:  # type: ignore[no-untyped-def]
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def _fresh_access_expires_at_iso() -> str:
    # Called right after issuing a new token (login/refresh). Kept in sync
    # with SIMPLE_JWT.ACCESS_TOKEN_LIFETIME so the client-side deadline
    # matches the cookie's own `exp` to the second.
    lifetime = settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]
    return (datetime.now(UTC) + lifetime).isoformat().replace("+00:00", "Z")


def _token_expires_at_iso(token) -> str:  # type: ignore[no-untyped-def]
    # `token["exp"]` is a unix timestamp — the real deadline the server will
    # enforce on this specific access cookie. Preferred over `now + lifetime`
    # when we already hold a validated token (e.g. on GET /me/), so a cold-
    # started client schedules its warning against the true remaining time.
    exp = int(token["exp"])
    return datetime.fromtimestamp(exp, UTC).isoformat().replace("+00:00", "Z")


def _user_payload(user, expires_at: str) -> dict:  # type: ignore[no-untyped-def, type-arg]
    data = UserSerializer(user).data
    data["expires_at"] = expires_at
    return data


class RegisterView(APIView):
    permission_classes = [AllowAny]

    @auth_schema(
        summary="Register a new user",
        description=(
            "Creates an active user with the given email and password. "
            "Does not log the user in — issue a POST /api/auth/login/ next."
        ),
        request=RegisterSerializer,
        responses={201: UserSerializer, 400: ERROR_400},
    )
    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    @auth_schema(
        summary="Login with email and password",
        description=(
            "Verifies credentials and sets HttpOnly access/refresh cookies. "
            "Access cookie is scoped to /, refresh cookie is scoped to /api/auth/. "
            "The response body includes `expires_at`, the ISO-8601 deadline of "
            "the access token, so clients can schedule a session-expiry warning."
        ),
        request=LoginSerializer,
        responses={200: SessionUserSerializer, 400: ERROR_400, 401: ERROR_401},
    )
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            return Response(
                {"detail": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        access, refresh = _issue_tokens(user)
        response = Response(
            _user_payload(user, _fresh_access_expires_at_iso()),
            status=status.HTTP_200_OK,
        )
        return set_auth_cookies(response, access, refresh)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @auth_schema(
        summary="Logout and clear cookies",
        description=(
            "Blacklists the current refresh token and clears both auth cookies. "
            "Requires a valid access cookie."
        ),
        request=None,
        responses={204: None, 401: ERROR_401},
    )
    def post(self, request: Request) -> Response:
        raw_refresh = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE)
        if raw_refresh:
            with contextlib.suppress(TokenError):
                RefreshToken(raw_refresh).blacklist()
        response = Response(status=status.HTTP_204_NO_CONTENT)
        return clear_auth_cookies(response)


class RefreshView(APIView):
    permission_classes = [AllowAny]

    @auth_schema(
        summary="Rotate access and refresh tokens",
        description=(
            "Reads the refresh cookie, blacklists it, and issues a new "
            "access/refresh pair as HttpOnly cookies. Replay of a used "
            "refresh token returns 401. The response body carries the fresh "
            "`expires_at` so the client can reschedule its session-expiry timer."
        ),
        request=None,
        responses={200: SessionUserSerializer, 401: ERROR_401},
    )
    def post(self, request: Request) -> Response:
        raw_refresh = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE)
        if not raw_refresh:
            return Response({"detail": "No refresh token"}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            old_refresh = RefreshToken(raw_refresh)
            user_id = old_refresh["user_id"]
            old_refresh.blacklist()
        except TokenError:
            return Response(
                {"detail": "Invalid refresh token"}, status=status.HTTP_401_UNAUTHORIZED
            )
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response(
                {"detail": "Invalid refresh token"}, status=status.HTTP_401_UNAUTHORIZED
            )
        new_refresh = RefreshToken.for_user(user)
        access = str(new_refresh.access_token)
        refresh = str(new_refresh)
        response = Response(
            _user_payload(user, _fresh_access_expires_at_iso()),
            status=status.HTTP_200_OK,
        )
        return set_auth_cookies(response, access, refresh)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @auth_schema(
        summary="Get the current user",
        description=(
            "Returns the authenticated user's id and email, plus `expires_at` — "
            "a fresh access-token deadline so a cold-started client can seed "
            "its session-expiry timer."
        ),
        request=None,
        responses={200: SessionUserSerializer, 401: ERROR_401},
    )
    def get(self, request: Request) -> Response:
        expires_at = (
            _token_expires_at_iso(request.auth)
            if request.auth is not None
            else _fresh_access_expires_at_iso()
        )
        return Response(_user_payload(request.user, expires_at))

    @auth_schema(
        summary="Update the current user",
        description="Patch the authenticated user. Email is the only mutable field for now.",
        request=UserUpdateSerializer,
        responses={200: UserSerializer, 400: ERROR_400, 401: ERROR_401},
    )
    def patch(self, request: Request) -> Response:
        serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class PublicUserView(APIView):
    permission_classes = [AllowAny]

    @users_schema(
        summary="Retrieve a public user",
        description="Public profile data for the given user id.",
        request=None,
        responses={200: UserSerializer, 404: ERROR_404},
    )
    def get(self, request: Request, pk: int) -> Response:
        user = get_object_or_404(User, pk=pk)
        return Response(UserSerializer(user).data)
