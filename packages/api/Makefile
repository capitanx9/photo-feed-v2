UV := uv

install:
	$(UV) sync

dev:
	$(UV) run python manage.py runserver

worker:
	$(UV) run celery -A api.celery_app worker --loglevel=infomigrate:
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

docker:
	docker compose up --build

docker-down:
	docker compose down

clean:
	rm -rf __pycache__ .mypy_cache .pytest_cache .ruff_cache dist build *.egg-info .venv
	find . -name "*.pyc" -delete
	@echo "Clean done."

info:
	@$(UV) python list --only-installed
	@$(UV) --version
