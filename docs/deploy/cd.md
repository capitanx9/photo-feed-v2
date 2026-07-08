# CD — host stage deploy

`deploy-host-stage.yml` is the workflow that rolls a new api/web image out to the stage EC2 host. See [ci.md](ci.md) for how those tags land on `main` in the first place.

## Triggers

Two mutually exclusive modes:

1. **`workflow_run` on `build-web-back` / `build-web-front` success.** The build workflow already pushed a bump commit to `main`; this workflow reads the fresh `images.env` off of `main` and runs `apply.sh` on the host.
2. **`push` on `main` with paths in `infra/host/**` or the deploy workflow itself.** For infra-only changes (nginx conf, compose, `apply.sh`) that don't ship a new image.

The `if:` condition on the job also short-circuits when the upstream build failed:

```
github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'
```

If the build failed the bump commit never landed, so applying stale `images.env` would be a no-op at best and a wrong-image regression at worst.

## Concurrency

`concurrency.group: photo-feed-host-stage`, `cancel-in-progress: false`. Only one host-stage apply runs at a time — SSM SendCommand + `apply.sh` are not safe to race against themselves.

## What the workflow does

1. Assumes `photo-feed-github-actions-api` via OIDC.
2. `describe-instances` filtered by tags `Application=photo-feed`, `Environment=stage`, `instance-state-name=running` — the target instance is discovered, not hardcoded.
3. `ssm send-command` runs a five-line shim on the host:

```
set -eu
cd /srv/photo-feed
sudo -u ubuntu git fetch origin main
sudo -u ubuntu git reset --hard origin/main
sudo -u ubuntu AWS_REGION=eu-central-1 bash infra/host/apply.sh
```

4. Polls `get-command-invocation` until Success / Failed / Cancelled / TimedOut, prints stdout (and on failure stderr), fails the job accordingly. `executionTimeout: 600` on SSM side; the workflow polls for 10 min max.

### Why the git-pull is in the shim, not in `apply.sh`

**Critical.** Bash streams scripts off disk with a read cursor — it does not slurp them into memory. If `git reset --hard origin/main` inside `apply.sh` shortens or lengthens the file on disk mid-execution, the interpreter's cursor picks up the next line from wherever it happens to land — possibly mid-line, possibly a whole line ahead, possibly nothing coherent. There is no error message: bash just silently runs the wrong bytes.

That bit us in PRs #55 / #56. #55 changed `curl -sk` to `curl -skL` in the smoke check; the file on disk was correct, but every stage deploy kept behaving as if the fix weren't there. Root cause was the `git reset --hard` on line ~60 mutating the file bash was streaming.

The fix (in `deploy-host-stage.yml`) is to move `git fetch` + `git reset --hard origin/main` into the SSM shim, **before** `bash apply.sh`. `apply.sh` still has a defensive `git fetch/reset` at the top for the manual "ssh in and re-run apply.sh" case, but under CI it's a no-op because the shim already synced main.

## What `apply.sh` does

Fully documented at the top of `infra/host/apply.sh`. Summary of what runs on the host, in order:

1. **Resolve stage hostname** from CloudFormation output `StageDomain` on `photo-feed-ec2-stage`.
2. **Pull secrets** from Secrets Manager (`DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`, `WEBHOOK_SHARED_SECRET`) into the shell environment. Compose reads `${VAR}` from that env — no `.env` file on disk.
3. `aws ecr get-login-password | docker login` against `797890596022.dkr.ecr.eu-central-1.amazonaws.com`.
4. `envsubst` the nginx config template with the current `STAGE_DOMAIN`.
5. `docker compose --env-file infra/host/images.env -f infra/host/docker-compose.stage.yml pull`
6. `... up -d --remove-orphans`
7. `nginx -t` + `nginx -s reload` inside the nginx container (bind-mounted conf; nginx only re-reads on SIGHUP).
8. `python manage.py migrate --noinput` inside the `web` container (no-op when nothing pending).
9. Smoke checks (5 retries each, quadratic backoff):
   - `https://<stage>/api/health/` — asserts Django is up.
   - `https://<stage>/` — asserts Next.js is up. Uses `curl -skL` because the Next proxy redirects `/` → `/en` (307) for i18n routing; the assertion is the *final* status, not the raw one.
   - On failure, `docker compose logs --tail 50 web` / `web-front` are dumped to stderr before exiting non-zero.

`apply.sh` prints `apply: ok` on success. The workflow relays SSM stdout into the workflow log.

## Rollback

`git revert <bad-commit>` on `main`. The `images.env` line reverts to the previous tag, the deploy fires again, ECR still has the old image cached, compose pulls it, up -d recreates the container. No mutable tags to fight with, no console clicks.

## When a deploy fails

Read the workflow log first — it prints `apply.sh` stdout (and stderr on failure) and the last 50 lines of `docker compose logs` for whichever service failed the smoke.

Then decide whether it's:

- **Real code / config bug.** Fix in a follow-up PR, land, deploy runs again.
- **Flake.** Docker Hub 500 on `buildx setup-buildx-action`, cold-cache SSM timeout, an aborted upstream cancelling us via `workflow_run`, etc. Re-run the workflow from the Actions UI. Do not add retry logic — three specific flake classes have been catalogued and re-running is faster than teaching the workflow about each. Look at the log, confirm it's one of them, and rerun.

## Related

- CI side (how new tags get onto main): [ci.md](ci.md)
- Runtime layout of what apply.sh brings up: `infra/host/docker-compose.stage.yml`
- Infra stacks apply.sh reads from (`StageDomain`, IAM, ECR): [infra.md](infra.md)
- SSM access to the host for diagnostics: [../runbooks/ssh-via-ssm.md](../runbooks/ssh-via-ssm.md)
