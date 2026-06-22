# syntax=docker/dockerfile:1.7

# packages/api — Django + gunicorn image.
#
# Built from the REPO ROOT (not from packages/api/), because the
# uv-workspace lockfile and the workspace pyproject.toml live at the
# root. Build command:
#
#   docker build -f packages/api/Dockerfile -t photo-feed-api:<tag> .
#                                                                  ↑
#                                          context = repo root
#
# Multi-stage:
#   builder — uv + python deps installed into /opt/venv
#   runtime — python:3.12-slim with /opt/venv copied in; no uv, no build
#             tools, no caches

# ----------------------------------------------------------------------
# builder
# ----------------------------------------------------------------------

FROM python:3.12-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv

# uv binary as a static drop-in.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /workspace

# Install workspace deps without project code first — best cache hit when
# only application files change (Dockerfile cache invalidates on lockfile
# changes only, not on every code edit).
#
# .python-version is intentionally NOT copied: it pins the exact patch
# version (3.12.10) for local development, but inside Docker we trust
# the python:3.12-slim base image (currently 3.12.X). Without the pin,
# uv accepts the system interpreter — saving an interpreter download
# we'd otherwise have to also ship into the runtime stage.
COPY pyproject.toml uv.lock ./
COPY packages/api/pyproject.toml packages/api/

# `uv sync --package api` resolves the workspace and installs only what
# the api package needs (workspace metadata + its deps). --no-install-project
# skips the local sources at this step.
RUN uv sync --frozen --package api --no-install-project

# Now copy the api source and install it into the venv.
COPY packages/api/ packages/api/
RUN uv sync --frozen --package api

# ----------------------------------------------------------------------
# runtime
# ----------------------------------------------------------------------

FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH=/opt/venv/bin:$PATH \
    PYTHONPATH=/app/src \
    DJANGO_SETTINGS_MODULE=api.settings

# Non-root user. gunicorn doesn't need root, and one less attack surface.
RUN groupadd --system --gid 1001 app \
 && useradd  --system --uid 1001 --gid app --no-create-home --home-dir /app app

WORKDIR /app

# Venv with all deps, built in the builder stage.
COPY --from=builder /opt/venv /opt/venv

# Source. We copy only `src/` (Django code) and `manage.py` — tests,
# pyproject, lockfile, etc. don't belong in the runtime image.
COPY --chown=app:app packages/api/src/ /app/src/
COPY --chown=app:app packages/api/manage.py /app/manage.py

USER app

EXPOSE 8000

# `migrate` is run by apply.sh on the host (compose exec) — not from
# CMD. Reason: containers might restart for unrelated reasons, and we
# don't want auto-migrations every time. apply.sh owns the migration
# step.
CMD ["gunicorn", \
     "--bind=0.0.0.0:8000", \
     "--workers=3", \
     "--access-logfile=-", \
     "--error-logfile=-", \
     "api.wsgi:application"]
