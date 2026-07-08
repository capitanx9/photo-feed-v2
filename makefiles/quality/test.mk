# Tests — pytest smoke on api + tsc/next build on web.

.PHONY: test test-py test-web
test: test-py test-web

test-py:
	$(UV) run pytest packages/api/tests -q

test-web:
	cd packages/web && npx tsc --noEmit && npx next build
