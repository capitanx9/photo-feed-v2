# syntax=docker/dockerfile:1.7

# packages/generate_image — Lambda container image (us-west-2).
#
# Built from the REPO ROOT. Build command:
#
#   docker build -f packages/generate_image/Dockerfile -t photo-feed-generate-image:<tag> .
#
# Base image: public.ecr.aws/lambda/python:3.12. Same mechanics as
# cut_image. The two Dockerfiles are deliberately near-identical so
# whatever pattern proves itself for cut_image transfers here.

FROM public.ecr.aws/lambda/python:3.12

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR ${LAMBDA_TASK_ROOT}

COPY pyproject.toml uv.lock ./
COPY packages/generate_image/pyproject.toml packages/generate_image/

ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
RUN uv export --frozen --package generate-image --no-emit-workspace --format requirements-txt \
    | uv pip install --system --target "${LAMBDA_TASK_ROOT}" --no-deps -r -

COPY packages/generate_image/src/generate_image/ ./generate_image/

# Handler: generate_image/handler.py::handler
CMD ["generate_image.handler.handler"]
