# Media upload flow

Two-phase presigned S3 upload with a Lambda-side resize step. The browser talks directly to S3 for the big transfer; Django only signs the URL and receives a webhook when the resize is done.

## Sequence

```
Browser                    Django                 S3 (photo-feed-uploads)     Lambda (cut_image)
   │                          │                            │                          │
   ├─(1) POST upload-url/─────►│                            │                          │
   │      {content_type,       │  validate + create         │                          │
   │       content_length,     │  pending PostMedia         │                          │
   │       kind}               │                            │                          │
   │◄──── {media_id,           │                            │                          │
   │       upload_url,         │                            │                          │
   │       s3_key,             │                            │                          │
   │       expires_in} ────────┤                            │                          │
   │                          │                            │                          │
   ├─(2) PUT upload_url ──────────────────────────────────►│                          │
   │      (raw bytes, exact                                │                          │
   │       Content-Type + Length)                          │                          │
   │◄─── 200 ──────────────────────────────────────────────┤                          │
   │                          │                            │                          │
   │                          │                       (3) PutObject notification ────►│
   │                          │                            │                          │
   │                          │                            │◄─── PutObject processed/ ┤
   │                          │                            │                          │
   │                          │◄─────── (4) POST /internal/media/processed/ ──────────┤
   │                          │              {s3_key, s3_key_resized, status}         │
   │                          │              X-Lambda-Token: WEBHOOK_SHARED_SECRET    │
   │                          │  flip PostMedia            │                          │
   │                          │  status → ready            │                          │
   │                          │                            │                          │
   ├─(5) GET /api/posts/media/<id>/ (poll)                 │                          │
   │◄── {status: "ready", url: presigned-GET} ─────────────┤                          │
```

## Step details

**1. `POST /api/posts/upload-url/`** — `packages/api/src/posts/views.py::UploadURLView`

- Body: `{content_type, content_length, kind}` where `kind` is `"post"` or `"avatar"`.
- Server validates `content_type ∈ UPLOAD_ALLOWED_MIME` and `0 < content_length ≤ UPLOAD_MAX_BYTES` (10 MiB default).
- Creates a `PostMedia` row with `status=pending`, `owner=request.user`, `s3_key_raw="raw/<kind>s/<user>/<uuid>.<ext>"`.
- Presigns a `PUT` against `photo-feed-uploads` with the exact `ContentType` and `ContentLength` locked in. Any mismatch on the browser side fails S3's signature check.
- TTL: `S3_PRESIGN_TTL_SECONDS` (default 5 min).

**2. Browser `PUT upload_url`** — direct-to-S3. No traffic through Django. The `Content-Type` and `Content-Length` on the request must match the values the URL was signed for.

**3. S3 event → Lambda** — S3 PutObject notification on the `raw/` prefix invokes `photo-feed-cut-image-stage`. Wired in `infra/cf/s3/s3-euc1.yaml`, referencing the Lambda ARN imported from `photo-feed-lambdas-euc1`.

The Lambda (`packages/cut_image/src/cut_image/handler.py`):

- GetObject the raw upload.
- `PIL.ImageOps.exif_transpose` → `ImageOps.fit(512, 512, LANCZOS)` → JPEG q=85.
- PutObject `processed/<stem>.jpg` in the same bucket.
- Pulls `WEBHOOK_SHARED_SECRET` from Secrets Manager (cached at cold start).

**4. `POST /internal/media/processed/`** — `packages/api/src/posts/views.py::media_processed`

- Auth: `X-Lambda-Token` header must equal `settings.WEBHOOK_SHARED_SECRET` (constant-time via `hmac.compare_digest`). Anything else returns 401. No DRF auth/permission classes on the view — Lambdas aren't users.
- Body: `{s3_key, s3_key_resized, status}` where `status ∈ {ready, failed}`.
- Looks up `PostMedia` by `s3_key_raw=s3_key`, sets `s3_key_resized` and `status`, saves.

**5. `GET /api/posts/media/<pk>/`** — polling loop for the client. Returns `PostMediaSerializer` which mints a fresh presigned GET URL when `status=ready` (null otherwise). Presigned URLs are minted on every read so they never expire in-flight — don't cache them client-side longer than a few minutes.

## Bucket layout

`photo-feed-uploads` (eu-central-1):

- `raw/<kind>s/<user>/<uuid>.<ext>` — 7-day S3 lifecycle rule (raw uploads are only useful until processed).
- `processed/<stem>.jpg` — permanent.
- `processed/ai/<user>/<uuid>.png` — permanent, populated by AI approve (see [ai-flow.md](ai-flow.md)).
- `tts/<post>-<hash>.mp3` — cache for `POST /api/posts/<pk>/tts/`.
- `stt/<uuid>.<ext>`, `stt/<uuid>.json` — 1-day lifecycle rule, short-lived STT artefacts.

All access is presigned — no public-read bucket policies.

## Publishing a post

The client collects one or more READY `media_id`s and calls `POST /api/posts/`. Each `media_id` must be owned by the caller, `status=ready`, and not already attached to any other post. The endpoint attaches them to the new `Post` in a single `.update(post=post)`.

## Related

- Endpoint tables: [overview.md](overview.md)
- Lambda specifics: [../deploy/lambda-images.md](../deploy/lambda-images.md)
- S3 helper functions: `packages/api/src/common/s3.py`
