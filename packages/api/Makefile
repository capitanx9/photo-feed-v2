UV := uv

# Runs the Django dev server against your host uv env — no docker.
# Prefer `make dev-up` from the repo root for a real end-to-end stack;
# these targets are useful when you only want to poke at the Django
# process itself.

install:
	$(UV) sync

dev:
	$(UV) run python manage.py runserver

worker:
	$(UV) run celery -A api.celery_app worker --loglevel=info

beat:
	$(UV) run celery -A api.celery_app beat --loglevel=info

migrate:
	$(UV) run python manage.py migrate

makemigrations:
	$(UV) run python manage.py makemigrations

superuser:
	$(UV) run python manage.py createsuperuser

shell:
	$(UV) run python manage.py shell

test:
	$(UV) run pytest -v --disable-warnings

lint:
	$(UV) run ruff check .

format:
	$(UV) run ruff format .

typecheck:
	$(UV) run mypy src

lock:
	$(UV) lock

clean:
	rm -rf __pycache__ .mypy_cache .pytest_cache .ruff_cache dist build *.egg-info .venv
	find . -name "*.pyc" -delete
	@echo "Clean done."
