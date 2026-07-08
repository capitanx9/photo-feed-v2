# Photo-feed monorepo — top-level targets.
#
# Targets are split across makefiles/ by scope:
#   vars.mk           — shared variables ($(UV), $(DC_DEV), SSM helpers)
#   dev/stack.mk      — compose up/down/logs/shell
#   dev/django.mk     — migrate / makemigrations / createsuperuser / reset-db
#   dev/seed.mk       — dev-seed-*
#   dev/wipe.mk       — dev-wipe-*
#   stage/shell.mk    — stage-shell (interactive SSM)
#   stage/seed.mk     — stage-seed-*
#   stage/wipe.mk     — stage-wipe-*
#   quality/lint.mk   — lint targets
#   quality/fmt.mk    — fmt / fmt-check targets
#   quality/test.mk   — test targets
#   meta.mk           — AWS + workspace housekeeping
#
# vars.mk must load first so the sub-scoped files can reference its
# variables. The wildcard picks up every other .mk in any order.

include makefiles/vars.mk
include $(filter-out makefiles/vars.mk,$(wildcard makefiles/*.mk))
include $(wildcard makefiles/*/*.mk)

.DEFAULT_GOAL := help

.PHONY: help
help:
	@echo "Photo-feed monorepo — top-level make targets"
	@echo ""
	@echo "Local dev (docker-compose.dev.yml):"
	@echo "  dev-up               Start db + redis + api + worker + beat + web"
	@echo "  dev-down             Stop everything (keeps volumes)"
	@echo "  dev-logs             Tail every service"
	@echo "  dev-logs-api         Tail Django api only"
	@echo "  dev-logs-worker      Tail Celery worker only"
	@echo "  dev-logs-beat        Tail Celery beat only"
	@echo "  dev-logs-web         Tail Next.js web only"
	@echo "  dev-shell-api        Shell inside the api container"
	@echo "  dev-shell-db         psql into the dev postgres"
	@echo "  dev-migrate          manage.py migrate"
	@echo "  dev-makemigrations   manage.py makemigrations"
	@echo "  dev-createsuperuser  manage.py createsuperuser (interactive)"
	@echo "  dev-django-shell     manage.py shell"
	@echo "  dev-reset-db         Wipe postgres volume, re-migrate, re-seed"
	@echo ""
	@echo "Seed (dev):"
	@echo "  dev-seed             Full seed: 5 users x 3 posts + carts + orders"
	@echo "  dev-seed-users       Users only"
	@echo "  dev-seed-posts       Users + posts (no carts, no orders)"
	@echo "  dev-seed-carts       2 cart items per seed user"
	@echo "  dev-seed-orders      1 pending order per seed user"
	@echo ""
	@echo "Wipe (dev):"
	@echo "  dev-wipe             Nuke DB (keeps superusers)"
	@echo "  dev-wipe-seed        Delete @seed.local users (cascade)"
	@echo "  dev-wipe-posts       Delete seed users' posts only"
	@echo "  dev-wipe-carts       Empty seed users' carts"
	@echo "  dev-wipe-orders      Delete seed users' orders"
	@echo "  dev-wipe-all-users   Delete all non-superuser users (cascade)"
	@echo "  dev-wipe-all-posts   Delete every post regardless of owner"
	@echo "  dev-wipe-all-carts   Empty every cart regardless of owner"
	@echo "  dev-wipe-all-orders  Delete every order regardless of owner"
	@echo ""
	@echo "Stage (SSM into the EC2 host — no open SSH):"
	@echo "  stage-shell          Interactive SSM session"
	@echo "  stage-seed[-*]       Same slices as dev-seed[-*], via SSM"
	@echo "  stage-wipe-seed      Delete @seed.local users on stage (cascade)"
	@echo "  stage-wipe-posts     Delete seed users' posts on stage"
	@echo "  stage-wipe-carts     Empty seed users' carts on stage"
	@echo "  stage-wipe-orders    Delete seed users' orders on stage"
	@echo "  stage-wipe-all-users   Delete every non-superuser on stage (cascade)"
	@echo "  stage-wipe-all-posts   Delete every post on stage"
	@echo "  stage-wipe-all-carts   Empty every cart on stage"
	@echo "  stage-wipe-all-orders  Delete every order on stage"
	@echo "  (Django superusers are the only accounts wipe.py will not touch)"
	@echo ""
	@echo "Quality:"
	@echo "  lint                 ruff check + eslint"
	@echo "  fmt                  ruff format + prettier --write"
	@echo "  fmt-check            ruff format --check + prettier --check"
	@echo "  test                 pytest api + web tsc + web build"
	@echo ""
	@echo "Meta:"
	@echo "  aws-whoami           Show current AWS caller identity + profile"
	@echo "  install              uv sync"
	@echo "  lock                 uv lock"
	@echo "  clean                Remove build/cache dirs"
