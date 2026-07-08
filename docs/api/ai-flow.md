# AI generation flow

Text-to-image via Bedrock Stability SD3.5. Cross-region because Bedrock's SD3.5 model lives in `us-west-2` while the rest of the app is in `eu-central-1`.

## Sequence

```
Client        Django (euc1)         Redis        Celery worker      Lambda (usw2)      Bedrock (usw2)     S3 (usw2)
  │                │                   │              │                   │                    │                │
  ├── POST /api/ai/generate/ ─────────►│              │                   │                    │                │
  │      {prompt,                       │              │                   │                    │                │
  │       variants_count}               │              │                   │                    │                │
  │      (aspect_ratio=1:1 fixed)       │              │                   │                    │                │
  │                                    │  ratelimit check                  │                    │                │
  │                                    │  create GenerationJob             │                    │                │
  │                                    │  (status=queued)                  │                    │                │
  │                                    ├──── enqueue "ai.generate_image"──►│                    │                │
  │◄── 202 {job_id, status_url} ───────┤                                   │                    │                │
  │                                    │                                   │                    │                │
  │                                    │                              set status=running        │                │
  │                                    │                                   ├── lambda.invoke ──►│                │
  │                                    │                                   │                    │  asyncio.gather one call per variant
  │                                    │                                   │                    ├── InvokeModel ─►
  │                                    │                                   │                    │◄── PNG b64 ────┤
  │                                    │                                   │                    ├── PutObject ──────────► drafts/<u>/<j>/<i>.png
  │                                    │                                   │◄── {image_keys, seeds}                │
  │                                    │                              set status=ready          │                │
  │                                    │                              write image_keys, seeds   │                │
  │                                    │                                                        │                │
  ├── GET /api/ai/jobs/<id>/ (poll) ──►│  presign each image_key                                                 │
  │◄── {status, image_urls[]} ─────────┤                                                                          │
  │                                    │                                                                          │
  ├── POST /api/ai/jobs/<id>/approve/ ►│  cross-region CopyObject                                                 │
  │      {variant_index}               │  drafts/<u>/<j>/<i>.png ─────────────────► processed/ai/<u>/<uuid>.png    │
  │                                    │  create PostMedia (status=ready)                                         │
  │◄── 201 PostMedia ──────────────────┤                                                                          │
```

## Endpoints

### `POST /api/ai/generate/`

- Body: `{prompt, variants_count}`. `prompt` 1–500 chars, `variants_count` 1–4.
- `aspect_ratio` is fixed to `"1:1"` server-side (`ai/serializers.py::FIXED_ASPECT_RATIO`) — not exposed. Negative prompts are hardcoded to `""`.
- Rate-limited via Redis sliding window: `AI_RATE_LIMIT_PER_HOUR` (default 100) hits per user per hour. 429 with `{"detail": "Rate limit exceeded - try again later."}` when exhausted. Implementation: `packages/api/src/common/ratelimit.py`.
- On accept: creates a `GenerationJob(status=queued)`, dispatches `generate_image_task.delay(job.id)`, returns `202 {job_id, status_url}` where `status_url` is `reverse("ai:job-detail")`.

### `GET /api/ai/jobs/<pk>/`

- Owner-only.
- Returns `{id, prompt, variants_count, aspect_ratio, status, image_urls[], error, created_at, updated_at}`.
- `image_urls` are freshly-presigned GETs against the `us-west-2` drafts bucket, generated per request (TTL: `S3_PRESIGN_TTL_SECONDS`, default 5 min). Empty list unless `status=ready`.
- Poll cadence on the client: ~2s. Terminal states are `ready` and `failed`.

### `POST /api/ai/jobs/<pk>/approve/`

- Body: `{variant_index}` (0-indexed).
- Requires `status=ready` and `variant_index < len(image_keys)`.
- Server-side cross-region CopyObject: `photo-feed-generated-usw2/drafts/<u>/<j>/<i>.png` → `photo-feed-uploads/processed/ai/<user>/<uuid>.png`. Boto3 issues one `copy_object` from a `eu-central-1`-pinned client with `CopySource` pointing at the `us-west-2` bucket; S3 handles the cross-region transfer.
- Creates a `PostMedia(kind=post, status=ready, s3_key_raw=dst, s3_key_resized=dst, owner=user)`. Both keys are set to the destination — the file is already at final size, no cut_image round-trip needed.
- Returns `201 PostMediaSerializer`. The client can then pass its `id` to `POST /api/posts/` to publish.
- **Non-exclusive.** Approving does not consume the job; the same `variant_index` can be approved again for a duplicate PostMedia, or a different variant can be approved from the same job. The job stays `ready`.

## Server → Lambda handoff

Celery task (`packages/api/src/ai/tasks.py::generate_image_task`) runs in the `web-worker` container. It builds the payload:

```
{"user_id", "job_id", "prompt", "variants_count", "aspect_ratio"}
```

and calls `boto3.client("lambda", region_name=BEDROCK_REGION).invoke(FunctionName=..., InvocationType="RequestResponse")` synchronously. Any exception is caught, `str(exc)[:1000]` lands in `GenerationJob.error`, status flips to `failed`. On success, the returned `image_keys` and `seeds` are persisted and status flips to `ready`.

## Lambda side (`packages/generate_image/src/generate_image/handler.py`)

- Validates `variants_count ∈ [1, 4]` and `aspect_ratio ∈ {1:1, 4:5, 16:9}`. (Django only ever sends 1:1.)
- `asyncio.gather` — one Bedrock `InvokeModel` call per variant, each with a random seed. Runs in parallel to keep total wall-clock roughly one variant's latency.
- Each call: base64-decode the PNG, PutObject to `drafts/<user>/<job>/<i>.png` in the drafts bucket.
- **Content filter.** If `payload["finish_reasons"][0] is not None` the handler raises `RuntimeError("Bedrock content filter tripped: ...")`. That surfaces as `FunctionError` in the boto3 response, which the Celery task catches and writes into `GenerationJob.error`. The user sees `status=failed` with the reason.
- **Throttling.** Fixed-backoff retry on `ThrottlingException`: 1s → 2s → 4s.
- **Ping shortcut.** Empty payload or `{"ping": ...}` returns `{"ok": true, "from": "generate_image"}` — see [../deploy/lambda-images.md](../deploy/lambda-images.md).

## Buckets

- `photo-feed-generated-usw2` (us-west-2): `drafts/<user>/<job>/<i>.png`. 24-hour S3 lifecycle rule — drafts aren't kept.
- `photo-feed-uploads` (eu-central-1): `processed/ai/<user>/<uuid>.png` — permanent, populated by approve.

Both are private; every URL the client sees is a fresh presigned GET.

## Costs / limits

- Bedrock SD3.5: ~$0.04 per image + Bedrock throughput quota. Rate limit protects against runaway generation.
- Lambda memory 2048 MB, timeout 60s (`infra/cf/lambdas/usw2.yaml`). Four 1024×1024 variants finish inside 30s from a warm container.

## Related

- Endpoint tables: [overview.md](overview.md)
- Media pipeline the approved output enters: [media-flow.md](media-flow.md)
- Lambda infra + how to rotate the Bedrock model: [../deploy/lambda-images.md](../deploy/lambda-images.md)
