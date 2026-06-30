"""Django settings for the api package.

Configuration is read from the process environment — never hardcoded.
The same image runs in dev (docker-compose.dev.yml) and stage/prod
(docker-compose.stage.yml) — only env-vars change.

Defaults are tuned for **local dev**: DEBUG=1, sqlite, hosts="*".
In stage/prod every value is overridden by compose env from
Secrets Manager / images.env / docker-compose.stage.yml.
"""

import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str | None = None) -> str:
    """Read env var, fall back to default. Raise if no default and missing."""
    value = os.environ.get(name, default)
    if value is None:
        raise RuntimeError(f"Required environment variable {name!r} is not set.")
    return value


def env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


# ----------------------------------------------------------------------
# Core
# ----------------------------------------------------------------------

# In dev a built-in insecure key is fine. In stage/prod, compose injects
# the real key from Secrets Manager — env var DJANGO_SECRET_KEY.
SECRET_KEY = env(
    "DJANGO_SECRET_KEY",
    "django-insecure-dev-only-do-not-use-this-in-stage-or-prod",
)

DEBUG = env_bool("DJANGO_DEBUG", default=True)

# ALLOWED_HOSTS — comma-separated. "*" in dev so anything works.
# In stage/prod compose passes the real hostname (e.g. nip.io domain).
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", ["*"])


# ----------------------------------------------------------------------
# Apps + middleware
# ----------------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "users",
    "posts",
    "ai",
]

AUTH_USER_MODEL = "users.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "api.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "api.wsgi.application"


# ----------------------------------------------------------------------
# Database
# ----------------------------------------------------------------------

# Postgres everywhere — stage/prod via compose, local dev via the same
# compose stack. No sqlite fallback: it diverged from production
# behaviour (text/JSON field semantics, case sensitivity, etc.) and
# leaked a db.sqlite3 file into src/ on every accidental migrate.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "HOST": env("POSTGRES_HOST", "localhost"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "NAME": env("POSTGRES_DB", "api"),
        "USER": env("POSTGRES_USER", "api"),
        "PASSWORD": env("POSTGRES_PASSWORD", "api"),
    }
}


# ----------------------------------------------------------------------
# Auth + DRF
# ----------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "users.auth.CookieJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "photo-feed API",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": False,
}

# JWT (djangorestframework-simplejwt) — rotate refresh tokens on use and
# blacklist the used one so a stolen refresh becomes worthless on next use.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# HttpOnly auth cookies. Access cookie scoped to /, refresh to /api/auth/
# so it's never sent to anything but the refresh endpoint.
ACCESS_TOKEN_COOKIE = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"
AUTH_COOKIE_SAMESITE = "Lax"
AUTH_COOKIE_SECURE = env_bool("AUTH_COOKIE_SECURE", default=not DEBUG)

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# ----------------------------------------------------------------------
# CSRF + CORS (when running behind nginx in stage/prod)
# ----------------------------------------------------------------------

# Browser → nginx is HTTPS, but nginx → web is HTTP. Tell Django to
# trust the X-Forwarded-Proto header so it doesn't think every request
# is HTTP and break secure cookies / CSRF.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", [])

# CORS: photo-feed v1 used a same-origin frontend behind nginx, so CORS
# wasn't needed. We keep the env hook in case it ever is — read but
# don't install django-cors-headers until we have a use case for it.
# CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", [])


# ----------------------------------------------------------------------
# Celery
# ----------------------------------------------------------------------

CELERY_BROKER_URL = env("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")


# ----------------------------------------------------------------------
# S3 / uploads
# ----------------------------------------------------------------------

AWS_REGION = env("AWS_REGION", "eu-central-1")
S3_UPLOADS_BUCKET = env("S3_UPLOADS_BUCKET", "photo-feed-uploads")
S3_PRESIGN_TTL_SECONDS = int(env("S3_PRESIGN_TTL_SECONDS", "300"))
UPLOAD_MAX_BYTES = int(env("UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)))
UPLOAD_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"]

# Optional MinIO override for local dev; in stage/prod both are unset
# and boto3 talks to the real AWS endpoint. The presign helpers in
# common/s3.py only swap clients when these are non-empty.
AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", "")
AWS_S3_PUBLIC_ENDPOINT_URL = env("AWS_S3_PUBLIC_ENDPOINT_URL", "")

# Shared secret used by cut_image lambda when calling /internal/media/processed/
WEBHOOK_SHARED_SECRET = env("WEBHOOK_SHARED_SECRET", "local-dev-secret")


# ----------------------------------------------------------------------
# AI / Bedrock image generation (us-west-2)
# ----------------------------------------------------------------------

BEDROCK_REGION = env("BEDROCK_REGION", "us-west-2")
GENERATE_IMAGE_LAMBDA_NAME = env("GENERATE_IMAGE_LAMBDA_NAME", "photo-feed-generate-image-stage")
S3_GENERATED_BUCKET = env("S3_GENERATED_BUCKET", "photo-feed-generated-usw2")
S3_GENERATED_REGION = env("S3_GENERATED_REGION", "us-west-2")

AI_RATE_LIMIT_PER_HOUR = int(env("AI_RATE_LIMIT_PER_HOUR", "10"))
AI_MAX_VARIANTS = 4
AI_ALLOWED_ASPECT_RATIOS = ["1:1", "4:5", "16:9"]


# ----------------------------------------------------------------------
# Rate limiting (common/ratelimit.py)
# ----------------------------------------------------------------------

RATELIMIT_ENABLE = env_bool("RATELIMIT_ENABLE", default=True)
REDIS_URL = env("REDIS_URL", "redis://localhost:6379/2")


# ----------------------------------------------------------------------
# i18n + static
# ----------------------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"


# ----------------------------------------------------------------------
# Default primary key
# ----------------------------------------------------------------------

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
