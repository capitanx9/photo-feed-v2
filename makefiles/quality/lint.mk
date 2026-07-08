# Lint — ruff for Python, eslint for web.

.PHONY: lint lint-py lint-web
lint: lint-py lint-web

lint-py:
	$(UV) run ruff check packages/api packages/generate_image packages/cut_image

lint-web:
	cd packages/web && npx eslint src
