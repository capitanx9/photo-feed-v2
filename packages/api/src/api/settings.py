"""Django settings for the api package.

Configuration is read from the process environment — never hardcoded.
The same image runs in dev (docker-compose.dev.yml) and stage/prod
(docker-compose.stage.yml) — only env-vars change.

Defaults are tuned for **local dev**: DEBUG=1, sqlite, hosts="*".
In stage/prod every value is overridden by compose env from
Secrets Manager / images.env / docker-compose.stage.yml.
"""

import os
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
]

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

# If POSTGRES_HOST is set, we're in compose with the postgres service.
# Otherwise (plain `python manage.py runserver`), fall back to sqlite —
# zero-setup for local development.
if os.environ.get("POSTGRES_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "HOST": env("POSTGRES_HOST"),
            "PORT": env("POSTGRES_PORT", "5432"),
            "NAME": env("POSTGRES_DB", "api"),
            "USER": env("POSTGRES_USER", "api"),
            "PASSWORD": env("POSTGRES_PASSWORD"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


# ----------------------------------------------------------------------
# Auth + DRF
# ----------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

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
