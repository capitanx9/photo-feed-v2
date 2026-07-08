# Lambda container images

The two Lambdas — `cut_image` (eu-central-1) and `generate_image` (us-west-2) — ship as container images pushed to ECR, not zip archives.

## Why container images

Zip packages are capped at 250 MB unzipped. `cut_image` bundles Pillow (image processing), `generate_image` bundles boto3 for Bedrock — either pair of dependencies plus the CPython runtime blows past that limit. Container images give us 10 GB, `--platform linux/amd64` gets Lambda-native binaries built once in CI, and Buildx layer caching keeps rebuilds fast.

Container-image Lambdas also give us:

- Consistent local builds. The same Dockerfile builds in dev and in CI.
- Predictable cold-start. Module-scope `boto3.client(...)` is instantiated at container init once per cold container and reused across invocations (frozen into SnapStart snapshot when enabled).
- One-file config. `packages/cut_image/Dockerfile` and `packages/generate_image/Dockerfile` are the only places the runtime is described.

## The ping-shortcut contract

**Every real handler must short-circuit on an empty payload** with:

```python
def handler(event, context):
    if not event or set(event.keys()) <= {"ping"}:
        return {"ok": True, "from": "<lambda-name>"}
    # ... real logic
```

`deploy-lambdas-stage.yml`'s smoke step invokes each Lambda with `--payload '{}'` and greps `"ok": true` in the response. That step proves the function is at least callable after a deploy, without burning Bedrock quota (a real Bedrock invoke costs ~$0.04 per image + throughput quota).

The stubs shipped in early PRs returned `{"ok": True}` on any payload, so the smoke worked transparently. The moment a real handler lands, an empty `{}` would raise on missing fields (`event["Records"]`, `event["prompt"]`) and break every deploy. Both current handlers implement the shortcut:

- `packages/cut_image/src/cut_image/handler.py` — top of the module.
- `packages/generate_image/src/generate_image/handler.py` — same, before the async entrypoint.

Reviewing any PR that replaces a Lambda stub: confirm the ping shortcut lands in the same PR.

## `cut_image` (eu-central-1)

- **Trigger.** S3 PutObject on `photo-feed-uploads` under `raw/`.
- **What it does.** GetObject → Pillow `ImageOps.fit` to 512x512 JPEG (LANCZOS, quality 85, EXIF-rotated) → PutObject under `processed/<same-stem>.jpg` → webhook `POST /internal/media/processed/` on Django with `X-Lambda-Token` header.
- **Auth.** Webhook secret (`WEBHOOK_SHARED_SECRET`) is pulled from Secrets Manager once per cold container, cached in module scope.
- **CFN.** `infra/cf/lambdas/euc1.yaml` — memory 1024, timeout 30s, image URI templated from `${AccountId}.dkr.ecr.eu-central-1.amazonaws.com/photo-feed-cut-image:${CutImageImageTag}`.
- **IAM.** GetObject on `photo-feed-uploads/raw/*`, PutObject on `.../processed/*`, GetSecretValue on `/photo-feed/stage/WEBHOOK_SHARED_SECRET-*`.

## `generate_image` (us-west-2)

- **Trigger.** Synchronous `Invoke` from a Django Celery task (`packages/api/src/ai/tasks.py`).
- **What it does.** Reads `{user_id, job_id, prompt, variants_count, aspect_ratio}`, calls Bedrock `InvokeModel` in parallel (`asyncio.gather`) — one call per variant with a random seed — decodes each PNG, PutObject into `drafts/<user>/<job>/<i>.png` in `photo-feed-generated-usw2`, returns `{"image_keys": [...], "seeds": [...]}` synchronously to the Celery worker.
- **Content filter.** If Bedrock's response has `finish_reasons[0] != None`, the handler raises `RuntimeError("Bedrock content filter tripped: ...")`. The Celery task catches, writes the error into `GenerationJob.error`, sets status `failed`. The user sees a failed job on their next poll — no half-written result.
- **Throttling.** Fixed-backoff retry on `ThrottlingException` — three attempts, `1s → 2s → 4s`.
- **CFN.** `infra/cf/lambdas/usw2.yaml` — memory 2048, timeout 60s, `BEDROCK_MODEL_ID` env var, `DRAFTS_BUCKET` env var.
- **IAM.** `bedrock:InvokeModel` on the exact model ARN, plus its previous version so a rollback is one env flip. PutObject on `photo-feed-generated-usw2/drafts/*`.

## Rotating the Bedrock model

Current model: `stability.sd3-5-large-v1:0`. Set in `infra/cf/lambdas/usw2.yaml`:

```yaml
Environment:
  Variables:
    BEDROCK_MODEL_ID: stability.sd3-5-large-v1:0
```

If AWS retires it (they announce a few months out):

1. Add the new model ARN to the `BedrockInvokeStability` policy's `Resource` list. The current list already keeps the previous version (`stability.sd3-large-v1:0`) so an env flip alone can roll back — do the same when picking the new one.
2. Bump `BEDROCK_MODEL_ID` to the new model.
3. Push. `deploy-lambdas-stage` re-applies the stack; the function picks up the new env; smoke passes.

Do this in a single PR — env change without the IAM update is an AccessDenied at generation time.

## Deploy

`deploy-lambdas-stage.yml` fires on:

- `workflow_run` from `build-cut-image` / `build-generate-image` success — the tag file `infra/cf/lambdas/images.env` already has the fresh tag by then.
- `push` on `main` with paths in `infra/cf/lambdas/**` — template / policy tweaks that don't ship a new image.

Two jobs run in parallel, one per region. Each reads its tag from `images.env`, deploys its stack, and runs the smoke `aws lambda invoke --payload '{}'`.

## Related

- CI that builds these images: [ci.md](ci.md)
- Infra graph: [infra.md](infra.md)
- The media pipeline `cut_image` participates in: [../api/media-flow.md](../api/media-flow.md)
- The AI flow `generate_image` participates in: [../api/ai-flow.md](../api/ai-flow.md)
