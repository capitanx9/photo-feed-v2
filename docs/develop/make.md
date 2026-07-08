# Make targets

Root `Makefile` is the entry point for every routine dev task. Run
`make help` for a live listing.

Targets are decomposed by scope under `makefiles/`:
`vars.mk` (shared variables), `dev.mk` (local stack), `stage.mk` (SSM),
`quality.mk` (lint/fmt/test), `meta.mk` (aws/install/lock/clean). The
root `Makefile` just `include`s them all.

## Local dev (docker-compose.dev.yml)

| Target | What it does | When to use |
| --- | --- | --- |
| `dev-up` | `docker compose -f docker-compose.dev.yml up -d --build` — db, redis, api, worker, beat, web | Start the whole stack |
| `dev-down` | Stop everything, keep volumes | Freeing ports without losing DB |
| `dev-logs` | Tail all services (last 100 lines each) | See interleaved output |
| `dev-logs-api` | Tail Django `api` only | Debugging DRF views / migrations |
| `dev-logs-worker` | Tail Celery `api-worker` | Debugging tasks (`ai`, `posts.cut_image` webhook) |
| `dev-logs-beat` | Tail `api-beat` scheduler | Verifying periodic cleanup jobs |
| `dev-logs-web` | Tail Next.js `web` | Client-side / SSR errors |
| `dev-shell-api` | Bash inside the api container | pip freeze, running one-off scripts |
| `dev-shell-db` | `psql -U api -d api` inside the db container | Ad-hoc SQL |
| `dev-django-shell` | `manage.py shell` in the api container | ORM poking |
| `dev-migrate` | `manage.py migrate` | After pulling migrations |
| `dev-makemigrations` | `manage.py makemigrations` | Model changes |
| `dev-createsuperuser` | Interactive `createsuperuser` | Log into local `/admin/` |
| `dev-seed` | `manage.py seed --users 5 --posts 3` | Fresh demo data |
| `dev-reset-db` | Wipe postgres volume, re-migrate, re-seed | Clean slate (drops all data) |

Postgres everywhere — no sqlite fallback, do not run `manage.py migrate`
outside compose.

## Stage (SSM into EC2 host — no open SSH)

| Target | What it does | When to use |
| --- | --- | --- |
| `stage-shell` | `aws ssm start-session` on `i-030a13513a1cd91df` | Interactive shell on the stage host |
| `stage-seed` | `send-command` running `manage.py seed --users 5 --posts 3` in `host-web-1` | One-shot demo data on stage |

More stage recipes in [../debug/stage-shell.md](../debug/stage-shell.md)
and [../debug/ssm.md](../debug/ssm.md).

## Quality

| Target | What it does | When to use |
| --- | --- | --- |
| `lint` | `ruff check` on api/generate_image/cut_image + `eslint` on web | Before every push |
| `lint-py` | Python only | Faster loop while editing api |
| `lint-web` | ESLint only | Faster loop while editing web |
| `fmt` | `ruff format` + `prettier --write` | Auto-fix formatting |
| `fmt-py` | Python only | |
| `fmt-web` | Web only | |
| `fmt-check` | Verify formatting without writing | CI-parity check before push |
| `test` | `test-py` + `test-web` | Full local suite |
| `test-py` | `pytest packages/api/tests -q` | Backend smoke tests |
| `test-web` | `tsc --noEmit && next build` in `packages/web` | Type-check + production build |

## Meta

| Target | What it does | When to use |
| --- | --- | --- |
| `aws-whoami` | `sts get-caller-identity --profile cx9-gmail` | Check SSO session validity |
| `install` | `uv sync` | Set up Python venv |
| `lock` | `uv lock` | Refresh `uv.lock` after dep changes |
| `clean` | Remove pycache, `.venv`, ruff/mypy/pytest caches, `dist`, `build` | Reset local Python state |
