# API overview

Django DRF, mounted under `/api/`. Everything is JSON. Auth is HttpOnly cookie JWT — see [auth.md](auth.md).

Live Swagger UI (source of truth for exact request/response schemas):

- Stage: `https://stage.photo-feed.click/api/schema/swagger-ui/`
- Local: `http://localhost:8000/api/schema/swagger-ui/`
- Raw OpenAPI: `/api/schema/`

The tables below list every endpoint and its shape. `Auth` column: **guest** = no cookie needed, **user** = access cookie required, **owner** = access cookie + resource ownership check, **internal** = shared-secret webhook (no user auth). Cursor-paginated responses always follow DRF's `{next, previous, results[]}` shape; `next` is an absolute URL — strip the origin before re-fetching from a same-origin client.

## Auth

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register/` | guest | `{email, password}` | 201 `{id, email, avatar}` (no login) |
| POST | `/api/auth/login/` | guest | `{email, password}` | 200 `{id, email, avatar, expires_at}` + sets cookies |
| POST | `/api/auth/refresh/` | guest (refresh cookie) | none | 200 `{id, email, avatar, expires_at}` + rotates cookies |
| POST | `/api/auth/logout/` | user | none | 204, clears cookies, blacklists refresh |
| GET | `/api/auth/me/` | user | none | 200 `{id, email, avatar, expires_at}` |
| PATCH | `/api/auth/me/` | user | `{email?, avatar_media_id?}` | 200 `{id, email, avatar}` |

`expires_at` is the ISO-8601 deadline of the current access token — the web client uses it to schedule its session-expiry warning and auto sign-off. `PATCH /me/` rejects avatar media unless `kind=avatar` + `status=ready` + owned by the caller.

## Users

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/users/<pk>/` | guest | none | 200 `{id, email, avatar}` |
| GET | `/api/users/<pk>/posts/` | guest | none | 200 cursor-paginated `PostSerializer[]` |

## Posts

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/posts/` | guest | none | 200 cursor-paginated published-post feed |
| POST | `/api/posts/` | user | `{media_ids[], caption?, price?}` | 201 `PostSerializer` |
| GET | `/api/posts/<pk>/` | guest | none | 200 `PostSerializer` |
| PATCH | `/api/posts/<pk>/` | owner | `{caption?, price?}` | 200 `PostSerializer` |
| DELETE | `/api/posts/<pk>/` | owner | none | 204 |
| POST | `/api/posts/upload-url/` | user | `{content_type, content_length, kind?}` | 200 `{media_id, upload_url, s3_key, expires_in}` |
| GET | `/api/posts/media/<pk>/` | owner | none | 200 `PostMediaSerializer` |
| POST | `/api/posts/<pk>/tts/` | user | none | 200 `{audio_url, cached}` |
| POST | `/internal/media/processed/` | internal | `{s3_key, s3_key_resized, status}` | 204 |

`POST /api/posts/` requires every `media_id` to be owned by the caller, not already attached to any other post, and non-empty. `POST /api/posts/upload-url/` mints a presigned S3 PUT + a pending `PostMedia`; see [media-flow.md](media-flow.md) for the full pipeline. Internal webhook auth = `X-Lambda-Token` matches `WEBHOOK_SHARED_SECRET`; anything else returns 401.

## AI

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| POST | `/api/ai/generate/` | user | `{prompt, variants_count}` | 202 `{job_id, status_url}` |
| GET | `/api/ai/jobs/<pk>/` | owner | none | 200 `GenerationJobSerializer` |
| POST | `/api/ai/jobs/<pk>/approve/` | owner | `{variant_index}` | 201 `PostMediaSerializer` |

`aspect_ratio` is fixed server-side to `1:1`; negative prompts are not exposed. Rate limited per user, sliding 1-hour window (`AI_RATE_LIMIT_PER_HOUR`, default 100) — 429 when exhausted. `approve` is non-exclusive: the same or a different `variant_index` can be approved multiple times to materialise multiple PostMedia from the same job. See [ai-flow.md](ai-flow.md).

## Cart

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/cart/` | user | none | 200 `CartSerializer` (auto-created on first access) |
| POST | `/api/cart/items/` | user | `{post_id, qty?}` | 201 `CartItemSerializer` (additive on re-add) |
| PATCH | `/api/cart/items/<pk>/` | owner | `{qty}` | 200 `CartItemSerializer` (absolute set) |
| DELETE | `/api/cart/items/<pk>/` | owner | none | 204 |

Posts without a `price` cannot be added. `qty` defaults to 1 on add.

## Orders

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/orders/` | user | none | 200 cursor-paginated own orders |
| POST | `/api/orders/checkout/` | user | `{payment_method, shipping_name, shipping_address, shipping_city, shipping_zip, shipping_country?}` | 201 `OrderSerializer` |
| GET | `/api/orders/<pk>/` | owner | none | 200 `OrderSerializer` |
| GET | `/api/orders/<pk>/wait-confirm/` | owner | none | 200 `OrderSerializer` (long-poll up to `WAIT_CONFIRM_TIMEOUT_SECONDS`, default 25s) |

Checkout snapshots each cart line's current price into `OrderItem.price_at_purchase`, empties the cart, and creates an `Order` in status `pending`. Admin approve flips to `paid` and publishes a Redis pubsub message that wakes any parked `wait-confirm` long-poll. `payment_method` choices: `["card", "paypal", "crypto", "cod"]`.

## TTS

Post caption → mp3 (see also `POST /api/posts/<pk>/tts/` above). Cached in S3 under `tts/<post>-<hash>.mp3` (hash is first 12 chars of sha1(caption)); short-lived presigned GET URL returned. 400 if `len(caption.strip()) < TTS_MIN_CAPTION_CHARS` (default 140). Amazon Polly, `TTS_VOICE_ID` (default `Joanna`), `TTS_ENGINE` (default `neural`).

## STT

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| POST | `/api/stt/` | user | multipart `audio` field | 200 `{text, language_code}` |

Accepts webm/opus, ogg, mp4, mp3, wav. `STT_MAX_AUDIO_BYTES` cap (default 2 MiB). Amazon Transcribe with automatic language identification. Blocks the gunicorn worker up to `STT_POLL_TIMEOUT_SECONDS` (default 45s); returns 500 on failure or timeout. Audio + result JSON live under `stt/` with a 1-day S3 lifecycle rule.

## Health + schema

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/health/` | guest | none | 200 `{ok: true}` — used by nginx upstream + `apply.sh` smoke |
| GET | `/api/schema/` | guest | none | 200 OpenAPI YAML |
| GET | `/api/schema/swagger-ui/` | guest | none | 200 Swagger HTML |

## Response shapes worth remembering

- **Post** — `{id, owner_id, caption, price, status, media[], created_at}`. `price` is a decimal string, may be null.
- **PostMedia** — `{id, kind, status, url, created_at}`. `url` is a presigned GET (or null if not ready).
- **CartItem** — `{id, post_id, qty, price, line_total, created_at}` — no post/media embed; the cart page fetches each post separately for previews.
- **Cart** — `{id, items[], total, updated_at}`. `total` is stringified decimal.
- **Order** — `{id, status, total, payment_method, shipping_*, items[], created_at}`. Status enum: `pending`/`paid`/`shipped`/`cancelled`.
- **OrderItem** — `{id, post_id, qty, price_at_purchase, line_total}`.
- **GenerationJob** — `{id, prompt, variants_count, aspect_ratio, status, image_urls[], error, created_at, updated_at}`. `image_urls` populated only when `status=ready` (fresh presigned GET each poll).
- **Cursor page** — `{next, previous, results[]}`. `next` is absolute; strip origin for same-origin re-fetch.

## Related

- [auth.md](auth.md)
- [media-flow.md](media-flow.md)
- [ai-flow.md](ai-flow.md)
