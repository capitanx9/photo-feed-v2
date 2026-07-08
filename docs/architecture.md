# Architecture

The "why" behind photo-feed-v2's shape. Every choice here has a specific reason — usually a bug we hit or a footgun we chose not to build.

## Monorepo layout

```
photo-feed-v2/
  packages/
    api/            Django + DRF + Celery (image: photo-feed-api)
    web/            Next.js 16, App Router (image: photo-feed-web)
    cut_image/      Lambda: resize S3 uploads (image: photo-feed-cut-image)
    generate_image/ Lambda: Bedrock text-to-image (image: photo-feed-generate-image)
  infra/
    cf/             CloudFormation (network, iam, ecr, s3, ec2, lambdas, dns)
    host/           docker-compose.stage.yml, apply.sh, nginx conf, images.env
  docs/             this tree
  Makefile          top-level dev/stage targets
```

Python is a **uv workspace** rooted at the top-level `pyproject.toml`; each Python package has its own `pyproject.toml` and `Dockerfile`. Web is plain `npm` under `packages/web`.

One repo, one branch (`main`), one deploy pipeline. No submodules, no floating tags between them.

## Two-layer CF / compose split

Two independent layers per environment. They never overlap.

- **CloudFormation** describes the AWS resources that change rarely: VPC + subnets + security group, IAM roles + OIDC provider, ECR repos, S3 buckets, EC2 instance + Elastic IP, Lambda functions, Route 53 hosted zone, Secrets Manager entries. Templates under `infra/cf/`.
- **Compose** describes the runtime tenants that change often: which containers run on the EC2 host, their env, their images, how nginx routes their ports. Lives in `infra/host/` and is applied on the instance by `apply.sh` over SSM.

The boundary is deliberate. Compose can be redeployed dozens of times a day; CF changes maybe weekly. Compose reads a few CFN outputs (`StageDomain`, Secrets Manager ARNs) and knows nothing else about AWS. When RDS eventually replaces the in-container Postgres, the compose file will lose the `db` service and the CF layer will grow an RDS stack — no cross-cutting refactor needed.

## Container-image Lambdas + ping shortcut

Both Lambdas ship as container images, not zip archives. Zip limits are 250 MB unzipped; Pillow + boto3 either alone gets close and together blows the limit. Container images get 10 GB, deterministic multi-stage builds, and a Buildx layer cache in CI.

Both handlers implement a **ping shortcut** for the deploy-stage smoke:

```python
if not event or set(event.keys()) <= {"ping"}:
    return {"ok": True, "from": "<lambda-name>"}
```

`deploy-lambdas-stage.yml`'s smoke step invokes the Lambda with `--payload '{}'` and asserts `"ok": true` in the response. That step proves the function is deployed and callable *without* burning Bedrock quota on every apply. When a real handler replaces a stub, the shortcut must land in the same PR — an empty `{}` in a real code path raises on missing fields and breaks every deploy.

Detail: [deploy/lambda-images.md](deploy/lambda-images.md).

## Cookie JWT

Auth = HttpOnly cookies with a JWT payload (`djangorestframework-simplejwt`). Access cookie scoped to `/`, refresh cookie scoped to `/api/auth/`. Both `HttpOnly=true`, `Secure=true` (in stage/prod), `SameSite=Lax`.

Preferred over `Authorization: Bearer` in `localStorage`:

- **XSS-safe.** Any script the browser runs cannot read HttpOnly cookies. `localStorage` is trivially readable.
- **Same-origin routing.** nginx proxies `/api/*` to Django on the same origin as the Next frontend, so no CORS, no third-party cookie problems, no OPTIONS preflight overhead.
- **Refresh scoping.** The refresh cookie is only sent to `/api/auth/`, so an XSS'd fetch to any other endpoint can't leak it.

Refresh rotation + blacklist: `ROTATE_REFRESH_TOKENS=True`, `BLACKLIST_AFTER_ROTATION=True`. A replayed refresh returns 401. Detail: [api/auth.md](api/auth.md).

## Presigned S3

Every image the browser sees comes through a **fresh presigned GET** — `PostMedia.url`, `GenerationJob.image_urls[]`, TTS mp3, etc. No public bucket policies, no CloudFront, no long-lived signed URLs.

Consequences:

- Presigned URLs change on every response, so they can't participate in Next.js's build-time image optimizer. **Use `<img>`, not `next/image`.** Next tries to cache the CDN copy under a stable key that depends on the URL — a rotating URL defeats it and the image loader ends up 500ing anyway.
- Client-side, don't cache URLs longer than `S3_PRESIGN_TTL_SECONDS` (default 5 min). Poll to refresh a stale one.

## Celery split: worker + beat

`web-worker` runs `celery worker`. `web-beat` runs `celery beat` — nothing else, no worker responsibilities.

Why two services instead of `celery worker -B`:

- Scaling workers doesn't spawn duplicate schedulers. `-B` starts a beat inside the worker; running two workers = two beats = every scheduled job fires twice.
- Beat's failure mode is different (its schedule file, its lock) — isolating it in its own container keeps a beat crash from taking a worker with it.

Both containers use the same image as `web` and connect to the same Redis service (`redis:6379`, broker on db 0, result backend on db 1). Django `tasks.py` per app, auto-discovered by `celery_app.autodiscover_tasks()` walking `INSTALLED_APPS`.

## WhiteNoise for admin static

Django admin's CSS/JS is served **by Django + WhiteNoise**, not by nginx. `WhiteNoiseMiddleware` sits right after `SecurityMiddleware` and answers `/static/*` before the URL resolver sees the request. Static files are precompressed (gzip + brotli) with content-hashed filenames via `whitenoise.storage.CompressedManifestStaticFilesStorage`.

Why not nginx: nginx serves `/api/`, `/admin/`, `/static/`, `/media/`, `/internal/` to `web` and everything else to `web-front`. `/static/` served by web means one source of truth for the admin assets — the Django `collectstatic` output the image was built with — and no volume mount to keep in sync across two containers.

## Next.js 16 gotchas that shaped the code

- **`proxy.ts`**, not `middleware.ts`. Next 16 renamed the file. It runs at the edge before the route handler.
- **`[lang]/` in the app router**, not `next-intl`. The locale is a route segment, i18n messages are static JSON per language, resolved at build time. Fewer moving parts than a runtime intl provider.
- **`useSearchParams` needs `<Suspense>`.** Any client component reading query params must be wrapped or the build fails.
- New Next 16 lint rules ban set-state-in-effect and require immutability in state updaters — enforced by ESLint; violations don't compile.
- **`"use client"` boundaries leak constants.** A module-scope constant defined in a `"use client"` file will be re-instantiated per client bundle chunk it's imported into — pull constants into a plain server module and re-export.

## GitOps deploy

Image tags are pinned in git:

- `infra/host/images.env` → `API_IMAGE_TAG`, `WEB_IMAGE_TAG`
- `infra/cf/lambdas/images.env` → `CUT_IMAGE_TAG`, `GENERATE_IMAGE_TAG`

Build workflows bump those files via the `photo-feed-bot-v2` GitHub App (a bypass actor in the main-branch ruleset). The bump commit triggers the matching deploy workflow via `workflow_run`. There's no `:latest` tag anywhere, no manual `docker compose pull` on the host, no console clicking.

Rollback = `git revert` on the bump commit. The tag reverts, the deploy fires again, ECR still has the old image, compose pulls it, `up -d` recreates the container. Same three-command flow as any other PR revert.

Detail: [deploy/ci.md](deploy/ci.md) + [deploy/cd.md](deploy/cd.md).

## Two ECR regions

`eu-central-1` hosts `photo-feed-api`, `photo-feed-web`, `photo-feed-cut-image`. `us-west-2` hosts `photo-feed-generate-image`.

The split is forced by **Bedrock**: Stability SD3.5 lives in `us-west-2` and Lambda has to be in the same region to keep the `InvokeModel` call low-latency and to avoid cross-region data-plane fees. The drafts bucket (`photo-feed-generated-usw2`) is co-located for the same reason.

Cross-region only bites at the API's approve step: `boto3.client("s3", region_name="eu-central-1").copy_object(CopySource={"Bucket": "photo-feed-generated-usw2", ...})` issues a server-side S3 copy that S3 routes cross-region internally. The API never downloads and re-uploads the bytes.

## Ruff exclusions

`ruff.toml` excludes `**/migrations/**` from lint (Django-generated code style is not ours).

`per-file-ignores` silences `RUF012` (mutable-class-attribute) for `views.py`, `serializers.py`, `models.py`, `admin.py`. DRF views declare `permission_classes = [IsAuthenticated]` at class scope, and Django `Meta` classes similarly declare `fields = [...]` — those are framework contracts, not mutable state. Blanket-adding `ClassVar` annotations across every view class is noise.

`BLE001` (broad-except) is not in `select`. If a broad `except Exception:` is intentional, put a comment explaining why — don't silence the lint.

## Related

- Individual pipeline / infra / API docs: [deploy/](deploy/), [api/](api/)
- Runbooks (SSM shell, DNS bootstrap): [runbooks/](runbooks/)
