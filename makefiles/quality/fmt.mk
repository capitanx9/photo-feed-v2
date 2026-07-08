# Format — ruff for Python, prettier for web.

.PHONY: fmt fmt-py fmt-web fmt-check
fmt: fmt-py fmt-web

fmt-py:
	$(UV) run ruff format packages/api packages/generate_image packages/cut_image

fmt-web:
	cd packages/web && npx prettier --write "src/**/*.{ts,tsx,json,css}"

fmt-check:
	$(UV) run ruff format --check packages/api packages/generate_image packages/cut_image
	cd packages/web && npx prettier --check "src/**/*.{ts,tsx,json,css}"
