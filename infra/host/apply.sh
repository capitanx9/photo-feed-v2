#!/bin/bash
# Apply the photo-feed stage stack on EC2.
#
# Idempotent. Sources of truth (in order of precedence at runtime):
#   - main on github.com           : compose / nginx / apply.sh / images.env
#   - Secrets Manager              : DJANGO_SECRET_KEY, POSTGRES_PASSWORD,
#                                    WEBHOOK_SHARED_SECRET
#   - ECR                          : image tags from images.env
#
# Steps:
#   1. git pull                    → host matches main exactly
#   2. pull secrets into shell env → compose reads them without a .env file
#   3. ECR login + compose pull    → only the images that changed
#   4. compose up -d               → services with unchanged digests stay
#   5. nginx reload                → bind-mounted conf re-applied
#   6. migrations                  → no-op if nothing pending
#   7. smoke check                 → both halves must answer 200
#
# Rollback: `git revert <bad-commit>` on main → next apply pulls the
# replacement tags and recreates containers.

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/srv/photo-feed}"
AWS_REGION="${AWS_REGION:-eu-central-1}"
SECRETS_PREFIX="${SECRETS_PREFIX:-/photo-feed/stage}"
ECR_REGISTRY="${ECR_REGISTRY:-797890596022.dkr.ecr.eu-central-1.amazonaws.com}"
STACK_NAME="${STACK_NAME:-photo-feed-ec2-stage}"

cd "${PROJECT_DIR}"

# ----------------------------------------------------------------------
# 0) Resolve the stage hostname from CloudFormation. While we wait for
#    a proper Route 53 domain, ec2-stage.yaml exports `StageDomain` as
#    `<ip-dashed>.nip.io`. When we switch to a real domain later, only
#    this output changes — nothing else in this script does.
# ----------------------------------------------------------------------

STAGE_DOMAIN="$(aws cloudformation describe-stacks \
    --region "${AWS_REGION}" \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='StageDomain'].OutputValue" \
    --output text)"

if [ -z "${STAGE_DOMAIN}" ]; then
    echo "FATAL: could not resolve StageDomain from stack ${STACK_NAME}" >&2
    exit 1
fi

HEALTH_API="https://${STAGE_DOMAIN}/api/health/"
HEALTH_WEB="https://${STAGE_DOMAIN}/"

# ----------------------------------------------------------------------
# 1) Self-sync from main. main is the contract; the host follows.
# ----------------------------------------------------------------------

git fetch origin main
git reset --hard origin/main

# ----------------------------------------------------------------------
# 2) Pull secrets from Secrets Manager into shell env. Compose interpolates
#    ${VAR} from the process environment, so no .env file on disk.
# ----------------------------------------------------------------------

secret_get() {
    aws secretsmanager get-secret-value \
        --region "${AWS_REGION}" \
        --secret-id "${SECRETS_PREFIX}/$1" \
        --query SecretString --output text
}

DJANGO_SECRET_KEY="$(secret_get DJANGO_SECRET_KEY)"
POSTGRES_PASSWORD="$(secret_get POSTGRES_PASSWORD)"
WEBHOOK_SHARED_SECRET="$(secret_get WEBHOOK_SHARED_SECRET)"
export DJANGO_SECRET_KEY POSTGRES_PASSWORD WEBHOOK_SHARED_SECRET ECR_REGISTRY STAGE_DOMAIN

# ----------------------------------------------------------------------
# 3) ECR login + compose pull. Compose itself decides which images need
#    a fresh pull based on the tags in images.env.
# ----------------------------------------------------------------------

aws ecr get-login-password --region "${AWS_REGION}" \
    | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# Render nginx config from the template. The template references
# ${STAGE_DOMAIN} so we substitute it once here instead of teaching
# nginx to read env vars at runtime (it can, but requires extra wiring
# and surprises if a key isn't set).
envsubst '${STAGE_DOMAIN}' \
    < infra/host/nginx/photo-feed.conf.template \
    > infra/host/nginx/photo-feed.conf

# --env-file order: images.env (tags) merged with process env (secrets).
# Both are read; later values override earlier — but they declare disjoint
# variables so order is informational.
COMPOSE="docker compose --env-file infra/host/images.env -f infra/host/docker-compose.stage.yml"

$COMPOSE pull
$COMPOSE up -d --remove-orphans

# ----------------------------------------------------------------------
# 4) Reload nginx config. nginx.conf is bind-mounted — the process only
#    re-reads it on SIGHUP. `compose up -d` reports "Running" when the
#    image hasn't changed and never re-reads config on its own.
# ----------------------------------------------------------------------

$COMPOSE exec -T nginx nginx -t
$COMPOSE exec -T nginx nginx -s reload

# ----------------------------------------------------------------------
# 5) Migrations. Safe to re-run; Django's migrate is a no-op when no new
#    migrations are pending.
# ----------------------------------------------------------------------

$COMPOSE exec -T web python manage.py migrate --noinput

# ----------------------------------------------------------------------
# 6) Smoke checks. Both halves must answer 200 before we call apply ok.
# ----------------------------------------------------------------------

smoke() {
    local url="$1"
    for attempt in 1 2 3 4 5; do
        status="$(curl -sk -o /dev/null -w '%{http_code}' "$url" || true)"
        if [ "$status" = "200" ]; then
            echo "smoke: $url -> 200 OK"
            return 0
        fi
        echo "smoke attempt $attempt: $url -> $status, retrying..."
        sleep $((attempt * 2))
    done
    echo "smoke FAILED: $url did not return 200" >&2
    return 1
}

smoke "$HEALTH_API" || { $COMPOSE logs --tail 50 web       >&2; exit 1; }
smoke "$HEALTH_WEB" || { $COMPOSE logs --tail 50 web-front >&2; exit 1; }

echo "apply: ok"
