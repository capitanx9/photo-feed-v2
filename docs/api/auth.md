# Auth

Cookie JWT. Two HttpOnly cookies:

| Cookie | Path | Lifetime | Purpose |
| --- | --- | --- | --- |
| `access_token` | `/` | 15 min | Sent with every API call |
| `refresh_token` | `/api/auth/` | 7 days | Sent only to the refresh endpoint |

Both are set with `HttpOnly=true`, `Secure=true` (in stage/prod), `SameSite=Lax`. Never in `localStorage` / `sessionStorage` — XSS-vulnerable, and no JS ever needs to read them.

Source: `packages/api/src/users/views.py`, `packages/api/src/users/cookies.py`, `packages/api/src/users/serializers.py`.

## Session-expiry hint (`expires_at`)

Every response from `login`, `refresh`, and `me` includes `expires_at` — the ISO-8601 deadline (`YYYY-MM-DDTHH:MM:SSZ`) of the current access cookie. The web client uses it to:

- Schedule a "session about to expire" warning popup a few minutes before.
- Auto sign-off at the deadline instead of waiting for the next 401.

On `login` and `refresh` the deadline is computed as `now + ACCESS_TOKEN_LIFETIME`. On `GET /me/` it's computed from the validated token's `exp` claim — so a cold-started client seeds its timer against the *real* remaining time, not `now + 15min`.

## Refresh flow

`POST /api/auth/refresh/`:

1. Reads the refresh cookie.
2. Instantiates a `RefreshToken`; on any `TokenError` returns 401 immediately.
3. `blacklist()` the old refresh — a replay of the same refresh returns 401 on the next call (settings: `ROTATE_REFRESH_TOKENS=True`, `BLACKLIST_AFTER_ROTATION=True`).
4. Issues a fresh access + refresh pair, sets both cookies, returns the user payload with the new `expires_at`.

The frontend triggers refresh from an axios/fetch interceptor on `401` (except for `login` / `register` / `refresh` itself, to avoid retry storms).

## Registration does NOT log in

`POST /api/auth/register/` returns a 201 `UserSerializer` (`{id, email, avatar}`) and does not set cookies. The client posts to `/api/auth/login/` next with the same credentials. Rationale: keeps registration idempotent and separates account creation from session issuance — an account can be created by an admin flow, an invite flow, or the public form, and the login step is the same in all three.

## Guest and 401

Any authenticated endpoint returns `401 {"detail": "..."}` on missing or invalid access cookie. `GET /api/auth/me/` is authenticated — a 401 on `me` for a guest is expected, not a warning. The web client uses `me` as its "am I signed in" probe and treats 401 as "guest".

## Server settings

From `packages/api/src/api/settings.py`:

```
SIMPLE_JWT.ACCESS_TOKEN_LIFETIME  = 15 min
SIMPLE_JWT.REFRESH_TOKEN_LIFETIME = 7 days
SIMPLE_JWT.ROTATE_REFRESH_TOKENS  = True
SIMPLE_JWT.BLACKLIST_AFTER_ROTATION = True

ACCESS_TOKEN_COOKIE  = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"
AUTH_COOKIE_SAMESITE = "Lax"
AUTH_COOKIE_SECURE   = not DEBUG  # overridable via env
```

DRF default auth class is `users.auth.CookieJWTAuthentication` — a simple-jwt subclass that pulls the token out of the access cookie instead of the `Authorization: Bearer` header.

## Related

- Full endpoint map: [overview.md](overview.md)
- Web-side auth wiring (auth context, api client 401 handling): `packages/web/src/lib/auth.tsx`, `packages/web/src/lib/api.ts`
