# Tailing logs

## Local (docker-compose.dev.yml)

All logs via make:

```bash
make dev-logs           # every service, last 100 lines each
make dev-logs-api       # Django api only
make dev-logs-worker    # Celery worker (ai tasks, cut_image webhook)
make dev-logs-beat      # Celery beat scheduler
make dev-logs-web       # Next.js web
```

Under the hood: `docker compose -f docker-compose.dev.yml logs -f
--tail=200 <svc>`.

## Stage

There is no `make stage-logs` — logs live inside the docker daemon on
the EC2 host, reachable only through SSM.

Interactive:

```bash
aws ssm start-session \
  --target i-030a13513a1cd91df \
  --region eu-central-1 \
  --profile cx9-gmail
```

Then on the host:

```bash
sudo docker logs --tail=200 -f host-web-1
```

Container names on stage (compose project `host`):

| Container | Service | What runs |
| --- | --- | --- |
| `host-web-1` | Django API | gunicorn serving `/api/*` |
| `host-web-worker-1` | Celery worker | ai tasks, media processing |
| `host-web-beat-1` | Celery beat | periodic jobs (cleanup, etc.) |
| `host-web-front-1` | Next.js web | SSR + static site |
| `host-nginx-1` | nginx | TLS termination, reverse proxy |
| `host-db-1` | Postgres 16 | app DB |
| `host-redis-1` | Redis 7 | Celery broker + cache |
| `host-certbot-1` | certbot | Let's Encrypt renewal |

One-shot (no interactive session) via SSM `send-command`:

```bash
aws ssm send-command \
  --instance-ids i-030a13513a1cd91df \
  --document-name AWS-RunShellScript \
  --region eu-central-1 \
  --profile cx9-gmail \
  --parameters 'commands=["sudo docker logs --tail=200 host-web-1"]' \
  --query 'Command.CommandId' --output text
```

Then poll with `get-command-invocation`. Full recipe in
[ssm.md](ssm.md).

## Filtering

Errors only:

```bash
sudo docker logs --tail=1000 host-web-1 2>&1 | grep -iE "error|traceback|exception"
```

Since a timestamp:

```bash
sudo docker logs --since=15m host-web-worker-1
```

Follow multiple containers at once from the host:

```bash
sudo docker compose -f /srv/photo-feed/infra/host/docker-compose.stage.yml \
  logs -f --tail=200 web web-worker
```

## Once inside a container

See [stage-shell.md](stage-shell.md) for `docker exec` recipes
(psql, redis-cli, Django shell, seed, createsuperuser).
