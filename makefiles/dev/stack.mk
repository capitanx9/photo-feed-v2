# Compose stack lifecycle + logs + shells.

.PHONY: dev-up dev-down dev-logs dev-logs-api dev-logs-worker dev-logs-beat dev-logs-web
dev-up:
	$(DC_DEV) up -d --build

dev-down:
	$(DC_DEV) down

dev-logs:
	$(DC_DEV) logs -f --tail=100

dev-logs-api:
	$(DC_DEV) logs -f --tail=200 api

dev-logs-worker:
	$(DC_DEV) logs -f --tail=200 api-worker

dev-logs-beat:
	$(DC_DEV) logs -f --tail=200 api-beat

dev-logs-web:
	$(DC_DEV) logs -f --tail=200 web

.PHONY: dev-shell-api dev-shell-db
dev-shell-api:
	$(DC_DEV) exec api bash

dev-shell-db:
	$(DC_DEV) exec db psql -U api -d api
