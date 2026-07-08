# Stage quick-start

Live URL: `https://stage.photo-feed.click/`. Deployed continuously from
`main`; every merge triggers a build + GitOps deploy (see
[Deploy → CD](../deploy/cd.md)).

## Try the app

Fastest path — no signup:

- `user1..5@seed.local`
- Password `stagepass123`

Every seed user has published posts you can browse, buy, or drop into
a test cart. Regenerate with more data via `make stage-seed`
(see below).

## Admin

- URL: `https://stage.photo-feed.click/admin/`
- Credentials: **on request from the repo owner.** The repo is public;
  admin creds are not.

The admin panel is a stock Django admin with the orders app registered
— the `Approve` action flips `pending` orders to `paid` (see
[Architecture](../architecture.md#orders-flow)).

## Shell access to the host

No public SSH. Everything routes through SSM Session Manager:

```bash
make stage-shell
# → aws ssm start-session --target i-030a13513a1cd91df \
#                          --region eu-central-1 --profile cx9-gmail
```

You need the `cx9-gmail` AWS profile configured with SSO. Prerequisites,
session-manager-plugin install, and the VS Code Remote-SSH tunnel are
in [runbooks/ssh-via-ssm.md](../runbooks/ssh-via-ssm.md).

Once inside, common ops live in [Debug → Stage shell](../debug/stage-shell.md).

## Seed data

Every `make stage-*` target below is a synchronous SSM exec — the
command runs in `host-web-1` on the stage EC2 instance and streams
output back to your terminal in ~4-5 seconds.

```bash
make stage-seed            # 5 users × 3 posts + carts + orders
make stage-seed-users      # accounts only
make stage-seed-posts      # users + posts, no carts/orders
make stage-seed-carts
make stage-seed-orders
```

## Approve pending orders

Same effect as the admin "Approve selected pending orders" action,
run over every pending order in one shot:

```bash
make stage-approve-all
```

Any active `/api/orders/<id>/wait-confirm/` long-poll wakes on the
Redis publish that fires as part of the flip.

## Wipe data

Two ladders. **Django superusers survive every scope** — real admins
never disappear.

Seed-only (safe any time):

```bash
make stage-wipe-orders
make stage-wipe-carts
make stage-wipe-posts
make stage-wipe-seed
```

Everything (deletes real accounts and data):

```bash
make stage-wipe-all-orders
make stage-wipe-all-carts
make stage-wipe-all-posts
make stage-wipe-all-users
make stage-wipe            # nuke stage DB in one shot, keeps superusers
```

## What if the make target hangs?

If SSM exec sits with no output past ~15 seconds, the instance is
probably offline or SSO expired. Run `aws sso login --profile cx9-gmail`,
then retry.
