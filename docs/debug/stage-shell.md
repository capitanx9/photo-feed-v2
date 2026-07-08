# On the stage host

After landing on the stage host via SSM (see [ssm.md](ssm.md) or
`make stage-shell`), everything runs inside docker containers. Use
`sudo docker exec` to poke around.

## Container inventory

```bash
sudo docker ps
sudo docker ps --format '{{.Names}}\t{{.Status}}'
```

Names on stage (compose project `host`): `host-web-1`,
`host-web-worker-1`, `host-web-beat-1`, `host-web-front-1`,
`host-nginx-1`, `host-db-1`, `host-redis-1`, `host-certbot-1`.

## Django shell

```bash
sudo docker exec -it host-web-1 python manage.py shell
```

For a Django management command that returns quickly, drop `-it`:

```bash
sudo docker exec host-web-1 python manage.py check
```

## Postgres

```bash
sudo docker exec -it host-db-1 psql -U api -d api
```

Ad-hoc query:

```bash
sudo docker exec host-db-1 psql -U api -d api -c "SELECT count(*) FROM posts_post;"
```

## Redis

```bash
sudo docker exec -it host-redis-1 redis-cli
```

Inspect Celery queues:

```bash
sudo docker exec host-redis-1 redis-cli LLEN celery
```

## Seed and superuser

```bash
sudo docker exec host-web-1 python manage.py seed --users 5 --posts 3
sudo docker exec -it host-web-1 python manage.py createsuperuser
```

`stage-seed` in the root Makefile wraps the seed as a one-shot SSM
call from your laptop.

## Django admin

- URL: `https://stage.photo-feed.click/admin/`
- Credentials: request from the repo owner. The repo is public — no
  passwords land in docs.
- If `/admin/` renders unstyled: static files are missing.
  `collectstatic` runs during image build; if it did not, exec into
  `host-web-1` and rerun:

  ```bash
  sudo docker exec host-web-1 python manage.py collectstatic --noinput
  ```

## Files on the host

The compose stack lives at `/srv/photo-feed/infra/host/`:

```bash
ls /srv/photo-feed/infra/host/
# apply.sh  docker-compose.stage.yml  images.env  nginx/
```

`apply.sh` is the deploy script. `images.env` holds the current image
tags (rewritten by the bot after each build).

## Follow logs

Individual container:

```bash
sudo docker logs --tail=200 -f host-web-worker-1
```

Multiple at once via compose:

```bash
sudo docker compose -f /srv/photo-feed/infra/host/docker-compose.stage.yml \
  logs -f --tail=200 web web-worker
```

More log recipes: [logs.md](logs.md).
