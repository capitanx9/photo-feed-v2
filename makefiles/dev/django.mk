# Django management commands running inside the dev api container.

.PHONY: dev-django-shell dev-migrate dev-makemigrations dev-createsuperuser dev-reset-db
dev-django-shell:
	$(DC_DEV) exec api python manage.py shell

dev-migrate:
	$(DC_DEV) exec api python manage.py migrate

dev-makemigrations:
	$(DC_DEV) exec api python manage.py makemigrations

dev-createsuperuser:
	$(DC_DEV) exec api python manage.py createsuperuser

# Wipe the DB volume completely, then rebuild + migrate + seed. Use this
# when a migration got wedged or you want a clean slate. Post-seed skips
# posts by default because seed.py pulls placeholders from picsum.photos
# and writes them to S3 — dev doesn't have S3 credentials.
dev-reset-db:
	$(DC_DEV) down -v
	$(DC_DEV) up -d db
	@echo "Waiting for postgres to be ready…"
	@until $(DC_DEV) exec -T db pg_isready -U api -d api > /dev/null 2>&1; do sleep 1; done
	$(DC_DEV) up -d
	$(DC_DEV) exec -T api python manage.py migrate
	$(DC_DEV) exec -T api python manage.py seed --users 5 --posts 0 --skip-posts
