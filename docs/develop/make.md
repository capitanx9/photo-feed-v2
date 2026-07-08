# Make targets

Root `Makefile` is the entry point for every routine dev task. Run
`make help` for a live listing.

Targets are decomposed by scope under `makefiles/`:
`vars.mk` (shared variables), `dev/*.mk` (local stack, seed, wipe,
approve), `stage/*.mk` (SSM), `quality/*.mk` (lint/fmt/test),
`meta.mk` (aws/install/lock/clean). The root `Makefile` just
`include`s them all.

## Local dev (docker-compose.dev.yml)

| Target                | What it does                                                            |
| --------------------- | ----------------------------------------------------------------------- |
| `dev-up`              | `docker compose up -d --build` — db, redis, minio, api, worker, beat, web |
| `dev-down`            | Stop everything, keep volumes                                           |
| `dev-logs`            | Tail all services (last 100 lines each)                                 |
| `dev-logs-api`        | Tail Django `api` only                                                  |
| `dev-logs-worker`     | Tail Celery `api-worker`                                                |
| `dev-logs-beat`       | Tail `api-beat` scheduler                                               |
| `dev-logs-web`        | Tail Next.js `web`                                                      |
| `dev-shell-api`       | Bash inside the api container                                           |
| `dev-shell-db`        | `psql -U api -d api` inside the db container                            |
| `dev-django-shell`    | `manage.py shell` in the api container                                  |
| `dev-migrate`         | `manage.py migrate`                                                     |
| `dev-makemigrations`  | `manage.py makemigrations`                                              |
| `dev-createsuperuser` | Interactive `createsuperuser`                                           |
| `dev-reset-db`        | Wipe postgres volume, re-migrate, re-seed                               |

Postgres everywhere — no sqlite fallback, do not run `manage.py migrate`
outside compose.

## Seed (dev)

| Target            | What it does                                    |
| ----------------- | ----------------------------------------------- |
| `dev-seed`        | Full: 5 users × 3 posts + carts + orders        |
| `dev-seed-users`  | Users only (no posts)                           |
| `dev-seed-posts`  | Users + posts, skips carts and orders           |
| `dev-seed-carts`  | +2 cart items per existing seed user            |
| `dev-seed-orders` | +1 pending order per existing seed user         |

## Wipe (dev)

Seed-scoped — only touches `@seed.local`:

| Target             | What it does                        |
| ------------------ | ----------------------------------- |
| `dev-wipe-seed`    | Delete `@seed.local` users, cascade |
| `dev-wipe-posts`   | Delete seed users' posts            |
| `dev-wipe-carts`   | Empty seed users' carts             |
| `dev-wipe-orders`  | Delete seed users' orders           |

Everything — real accounts included:

| Target                | What it does                                    |
| --------------------- | ----------------------------------------------- |
| `dev-wipe`            | Nuke DB (still keeps Django superusers)         |
| `dev-wipe-all-users`  | Delete every non-superuser (cascade)            |
| `dev-wipe-all-posts`  | Delete every post                               |
| `dev-wipe-all-carts`  | Empty every cart                                |
| `dev-wipe-all-orders` | Delete every order                              |

## Approve orders (dev)

| Target             | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `dev-approve-all`  | Flip every pending Order to paid + wake long-polls  |

## Stage (SSM — synchronous exec, ~4-5 s per call)

Every `stage-*` target runs `sudo docker exec host-web-1 …` inside
the EC2 host via `aws ssm start-session --document-name
AWS-StartInteractiveCommand`. Output streams straight back.

| Target                  | What it does                                          |
| ----------------------- | ----------------------------------------------------- |
| `stage-shell`           | Interactive SSM session on the stage host             |
| `stage-seed`            | Full seed on stage                                    |
| `stage-seed-users`      | Users only                                            |
| `stage-seed-posts`      | Users + posts                                         |
| `stage-seed-carts`      | +2 cart items per seed user                           |
| `stage-seed-orders`     | +1 pending order per seed user                        |
| `stage-approve-all`     | Flip every pending Order on stage to paid             |
| `stage-wipe`            | Nuke stage DB (keeps superusers)                      |
| `stage-wipe-seed`       | Delete `@seed.local` users on stage                   |
| `stage-wipe-posts`      | Delete seed users' posts on stage                     |
| `stage-wipe-carts`      | Empty seed users' carts on stage                      |
| `stage-wipe-orders`     | Delete seed users' orders on stage                    |
| `stage-wipe-all-users`  | Delete every non-superuser on stage                   |
| `stage-wipe-all-posts`  | Delete every post on stage                            |
| `stage-wipe-all-carts`  | Empty every cart on stage                             |
| `stage-wipe-all-orders` | Delete every order on stage                           |

More stage recipes in [../debug/stage-shell.md](../debug/stage-shell.md)
and [../debug/ssm.md](../debug/ssm.md).

## Quality

| Target      | What it does                                                    |
| ----------- | --------------------------------------------------------------- |
| `lint`      | `ruff check` on api/generate_image/cut_image + `eslint` on web  |
| `lint-py`   | Python only                                                     |
| `lint-web`  | ESLint only                                                     |
| `fmt`       | `ruff format` + `prettier --write`                              |
| `fmt-py`    | Python only                                                     |
| `fmt-web`   | Web only                                                        |
| `fmt-check` | Verify formatting without writing                               |
| `test`      | `test-py` + `test-web`                                          |
| `test-py`   | `pytest packages/api/tests -q`                                  |
| `test-web`  | `tsc --noEmit && next build` in `packages/web`                  |

## Meta

| Target       | What it does                                                              |
| ------------ | ------------------------------------------------------------------------- |
| `aws-whoami` | `sts get-caller-identity --profile cx9-gmail`                             |
| `install`    | `uv sync`                                                                 |
| `lock`       | `uv lock`                                                                 |
| `clean`      | Remove pycache, `.venv`, ruff/mypy/pytest caches, `dist`, `build`         |
