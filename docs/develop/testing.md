# Testing

## What exists

- `packages/api/tests/` — pytest smoke tests. Currently `test_smoke.py`
  covering Django bootstrap, `/api/health/`, and `/api/schema/`.
- `packages/web/` — no unit test suite. Type-check + production build
  double as an integration smoke.

## How to run locally

Full suite (mirrors CI):

```bash
make test
```

Split:

```bash
make test-py    # uv run pytest packages/api/tests -q
make test-web   # tsc --noEmit && next build, inside packages/web
```

`test-web` catches the vast majority of regressions on the frontend
because Next 16's `next build` collects page data (server components
render, `generateStaticParams` runs, client bundles compile). If it
builds, the app runs.

## Strategy

- **Backend**: pytest smokes on the DRF app. Verify endpoints exist and
  return the expected status codes. Full DB-integration tests would
  need `pytest-django` and a Postgres service — currently not wired up,
  do not run `manage.py migrate` outside compose.
- **Frontend**: `tsc --noEmit` proves types agree with API contracts;
  `next build` proves every route compiles and does not throw during
  data collection.
- **End-to-end**: manual on stage via SSM — see
  [../debug/stage-shell.md](../debug/stage-shell.md). Not in CI.

## Env flags the tests rely on

- `CELERY_TASK_ALWAYS_EAGER=1` — makes Celery tasks run inline in the
  test process instead of being queued to a real broker. Read at import
  time in `packages/api/src/api/celery_app.py`:

  ```python
  if os.environ.get("CELERY_TASK_ALWAYS_EAGER", "").lower() in ("1", "true", "yes"):
      celery_app.conf.task_always_eager = True
  ```

- `RATELIMIT_ENABLE=false` — turns off Redis-backed throttling on
  endpoints like `/api/ai/generate/` (default 10/h/user). Read in
  `packages/api/src/api/settings.py`:

  ```python
  RATELIMIT_ENABLE = env_bool("RATELIMIT_ENABLE", default=True)
  ```

Set both when running pytest outside `make test-py`:

```bash
CELERY_TASK_ALWAYS_EAGER=1 RATELIMIT_ENABLE=false uv run pytest packages/api/tests -q
```

## Pre-push checklist

`make lint && make fmt-check && make test`. Django-only changes also
run `makemigrations --check --dry-run` and `spectacular --validate`.
Full flow in [workflow.md](workflow.md).
