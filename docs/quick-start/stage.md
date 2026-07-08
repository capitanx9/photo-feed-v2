# Stage quick-start

Live URL — `https://stage.photo-feed.click/`. Deployed continuously from `main`; every merge triggers a build + GitOps deploy (see [Deploy → CD](../deploy/cd.md)).

## Try the app

**As a seeded user** (fastest path — no signup):

- Any of `user1@seed.local` … `user5@seed.local`
- Password `stagepass123`
- Each seed user has published posts you can browse, buy, or use as test cart contents.

Regenerate with more data (careful, this appends, doesn't wipe):

```bash
make stage-seed          # seeds 5 users × 3 posts via SSM
```

Wipe all seed data first (`user*@seed.local`) then reseed — from an SSM shell (see [Debug → SSM](../debug/ssm.md)):

```bash
sudo docker exec host-web-1 python manage.py seed --users 5 --posts 3 --fresh
```

## Admin

- URL: `https://stage.photo-feed.click/admin/`
- Credentials: **on request from the repo owner.** The repo is public; credentials are not.

The admin panel is a stock Django admin with the orders app registered — the `Approve` action flips `pending` orders to `paid` (see [Architecture](../architecture.md#orders-flow)).

## Shell access to the host

No public SSH. Everything goes through SSM Session Manager:

```bash
aws ssm start-session --target i-030a13513a1cd91df --region eu-central-1 --profile cx9-gmail
```

You need the `cx9-gmail` AWS profile configured with SSO. Once inside, common ops live in [Debug → Stage shell](../debug/stage-shell.md).

Runbook with prerequisites (session-manager-plugin, IAM policies, VS Code Remote-SSH tunneling): [runbooks/ssh-via-ssm.md](../runbooks/ssh-via-ssm.md).
