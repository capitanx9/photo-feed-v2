# Dev quick-start

Run the whole app locally end-to-end: Postgres, Redis, Django, Celery worker + beat, and Next.js — all in one docker compose stack with hot reload on the source.

## Prerequisites

- Docker (Desktop / Colima / Rancher — anything that gives you `docker compose`)
- `make`
- `uv` (only if you plan to run Django or Celery outside compose; see [Make targets](../develop/make.md))

No local Node or Python install is required for the golden path — everything runs in containers.

## Start it

```bash
git clone https://github.com/capitanx9/photo-feed-v2.git
cd photo-feed-v2
make dev-up
make dev-migrate
make dev-seed          # optional: 5 users × 3 posts of demo content
```

Then:

- App: <http://localhost:3000>
- Django admin: <http://localhost:8000/admin/> (create your own superuser: `make dev-createsuperuser`)
- Swagger UI: <http://localhost:8000/api/schema/swagger-ui/>
- Postgres: `localhost:5432` (`api` / `api` / `api`)
- Redis: `localhost:6379`

Log in with any seed user (`user1@seed.local` … `user5@seed.local`, password `stagepass123`).

## What's running

`docker-compose.dev.yml` spins up:

| Service      | Port  | What it does                                          |
|--------------|-------|-------------------------------------------------------|
| `db`         | 5432  | Postgres 16                                           |
| `redis`      | 6379  | Broker + cache                                        |
| `api`        | 8000  | Django `runserver` — hot reload on `packages/api/`    |
| `api-worker` | –     | Celery worker (AI generate, orphan-media cleanup, …)  |
| `api-beat`   | –     | Celery beat scheduler (hourly cleanup task)           |
| `web`        | 3000  | Next.js `next dev` — hot reload on `packages/web/`    |

Rate limiting is disabled in dev (`RATELIMIT_ENABLE=false`) so you can hammer `POST /api/ai/generate/` without hitting the hourly cap.

## Common tasks

```bash
make dev-logs               # tail all services
make dev-logs-api           # tail only the Django api
make dev-shell-api          # bash inside the api container
make dev-django-shell       # manage.py shell
make dev-migrate            # apply migrations after a schema change
make dev-makemigrations     # generate new migrations
make dev-createsuperuser    # interactive Django superuser
make dev-reset-db           # wipe volume, re-migrate, re-seed
make dev-down               # stop everything (keeps volumes)
```

Full list: [Make targets](../develop/make.md).

## AWS-backed features in dev

Some features (AI image generation via Bedrock, S3 uploads, TTS, STT) need real AWS credentials to work end-to-end. They're disabled by default — the golden path (auth, feed, cart, orders) works entirely offline.

To exercise the AWS-backed paths from your laptop, uncomment the `AWS_REGION`, `S3_UPLOADS_BUCKET`, `BEDROCK_REGION`, `GENERATE_IMAGE_LAMBDA_NAME` env vars in `docker-compose.dev.yml` under the `api` and `api-worker` services, then export credentials in your shell before `make dev-up`:

```bash
export AWS_PROFILE=cx9-gmail
aws sso login --profile cx9-gmail
make dev-up
```

