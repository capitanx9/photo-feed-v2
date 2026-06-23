# syntax=docker/dockerfile:1.7

# packages/cut_image — Lambda container image.
#
# Built from the REPO ROOT (workspace lockfile + workspace pyproject.toml
# live at the root). Build command:
#
#   docker build -f packages/cut_image/Dockerfile -t photo-feed-cut-image:<tag> .
#
# Base image: public.ecr.aws/lambda/python:3.12. Ships with the Lambda
# Runtime Interface Client and the runtime API baked in — no extra setup.
# The CMD points at the handler as <module>.<function>.

FROM public.ecr.aws/lambda/python:3.12

# uv binary as a static drop-in. Used here to install deps from the
# workspace lockfile into the Lambda runtime venv.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# LAMBDA_TASK_ROOT is /var/task on the AWS Lambda base image — the runtime
# loads handlers from there. We install the deps and the package source
# under that root.
WORKDIR ${LAMBDA_TASK_ROOT}

# Workspace lockfile + workspace metadata first — best cache hit when only
# the handler changes.
COPY pyproject.toml uv.lock ./
COPY packages/cut_image/pyproject.toml packages/cut_image/

# Install the cut_image package's deps directly into LAMBDA_TASK_ROOT.
# `uv export` resolves the workspace lock for the cut-image package
# (currently no deps — Phase 5 stub), and `uv pip install --target`
# places site-packages alongside the handler so Lambda's runtime can
# import both. We don't use `uv sync` here because Lambda's base image
# uses a system Python (no venv layout under /var/task).
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
RUN uv export --frozen --package cut-image --no-emit-workspace --format requirements-txt \
    | uv pip install --system --target "${LAMBDA_TASK_ROOT}" --no-deps -r -

# Now the package source.
COPY packages/cut_image/src/cut_image/ ./cut_image/

# Handler: cut_image/handler.py::handler
CMD ["cut_image.handler.handler"]
