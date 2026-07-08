# Dev quick-start

Run the whole app locally end-to-end: Postgres, Redis, MinIO
(S3-compatible), Django, Celery worker + beat, and Next.js — all in
one docker compose stack with hot reload on the source.

## Prerequisites

- Docker Desktop / Colima / Rancher — anything that gives you
  `docker compose`
- `make`
- `uv` — only if you plan to run Django or Celery outside compose.
  Not needed for the golden container-only path.

## First run

```bash
git clone https://github.com/capitanx9/photo-feed-v2.git
cd photo-feed-v2
make dev-up          # boots db, redis, minio, api, worker, beat, web
make dev-migrate     # applies Django migrations
make dev-seed        # 5 users × 3 posts + 2 cart items each + 1 pending order
open http://localhost:3000
```

Log in as any seed user (`user1..5@seed.local`, password `stagepass123`).

## What's running

| Service      | Port      | What it does                                        |
| ------------ | --------- | --------------------------------------------------- |
| `db`         | 5432      | Postgres 16                                         |
| `redis`      | 6379      | Broker + cache                                      |
| `minio`      | 9000/9001 | S3-compatible object store; console on :9001        |
| `minio-init` | –         | Provisions buckets on first boot, then exits        |
| `api`        | 8000      | Django `runserver`, hot reload                      |
| `api-worker` | –         | Celery worker (AI generate, orphan-media cleanup)   |
| `api-beat`   | –         | Celery beat scheduler                               |
| `web`        | 3000      | Next.js `next dev`, hot reload                      |

Also worth bookmarking:

- App: <http://localhost:3000>
- Django admin: <http://localhost:8000/admin/>
- Swagger: <http://localhost:8000/api/schema/swagger-ui/>
- MinIO console: <http://localhost:9001> (`minio` / `minio123`)

Rate limiting is disabled in dev (`RATELIMIT_ENABLE=false`) so you can
hammer `POST /api/ai/generate/` without hitting the hourly cap.

## Seed data

Full run creates 5 seed users, 3 posts each, 2 cart items per user, and
one pending order per user.

```bash
make dev-seed              # everything above
make dev-seed-users        # accounts only
make dev-seed-posts        # users + posts, no carts/orders
make dev-seed-carts        # +2 items in each seed user's cart
make dev-seed-orders       # +1 pending order per seed user
```

Password for every seed account is `stagepass123`.

## Approve pending orders

After `make dev-seed` there are 5 pending orders parked on the
checkout wait popup. Bulk-approve them so any waiting long-poll wakes:

```bash
make dev-approve-all
```

(Same thing the admin action "Approve selected pending orders" does,
run over every pending row at once.)

## Wipe data

Two ladders — pick by blast radius. **Django superusers survive every
scope** — you never lose your admin login.

Seed-only (safe any time):

```bash
make dev-wipe-orders       # seed users' orders
make dev-wipe-carts        # seed users' carts
make dev-wipe-posts        # seed users' posts
make dev-wipe-seed         # all @seed.local users (cascade)
```

Everything (real accounts included):

```bash
make dev-wipe-all-orders
make dev-wipe-all-carts
make dev-wipe-all-posts
make dev-wipe-all-users
make dev-wipe              # nuke DB in one shot, keeps superusers
```

## Reset from scratch

```bash
make dev-reset-db          # docker down -v, up, migrate, dev-seed
```

Use this after a wedged migration or when the volume feels dirty.

## Django

```bash
make dev-migrate           # after pulling a new migration
make dev-makemigrations    # after editing a model
make dev-createsuperuser   # interactive admin login for /admin/
make dev-django-shell      # manage.py shell inside the container
```

## Poking at services

```bash
make dev-shell-api         # bash in the api container
make dev-shell-db          # psql
make dev-logs              # tail every service
make dev-logs-api          # tail just Django
make dev-logs-worker
make dev-logs-beat
make dev-logs-web
```

## Quality checks (host-side)

```bash
make lint                  # ruff + eslint
make fmt                   # ruff format + prettier --write
make fmt-check             # verify formatting without changing files
make test                  # pytest api smoke + tsc + next build
```

## Stop everything

```bash
make dev-down              # stop, keep volumes
```

## AWS-backed features

S3 runs locally through MinIO — uploads, TTS mp3 caching, and AI-draft
copying all work with fake creds baked into `docker-compose.dev.yml`.

**Bedrock is the one exception**: text-to-image generation needs a
real Lambda + Bedrock model, so it stays out of dev by default. To
exercise it, uncomment `BEDROCK_REGION` and
`GENERATE_IMAGE_LAMBDA_NAME` under `api` and `api-worker` in the
compose file, replace the MinIO creds with your AWS SSO ones, then:

```bash
aws sso login --profile cx9-gmail
make dev-up
```
