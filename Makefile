UV := uv

install:
	$(UV) sync

test:
	$(UV) run pytest -v --disable-warnings

lint:
	$(UV) run ruff check .

format:
	$(UV) run ruff format .

lock:
	$(UV) lock

freeze:
	$(UV) export --format requirements-txt --no-hashes -o requirements.txt

clean:
	rm -rf __pycache__ .mypy_cache .pytest_cache .ruff_cache dist build *.egg-info .venv
	find . -name "*.pyc" -delete
	@echo "Clean done."

info:
	@$(UV) python list --only-installed
	@$(UV) --version
