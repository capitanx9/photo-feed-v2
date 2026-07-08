# photo-feed-v2

Shoppable Instagram-style photo feed. Django DRF + Next.js 16 + Celery + AWS.

## Stage

- App: <https://stage.photo-feed.click/>
- Admin: <https://stage.photo-feed.click/admin/>
- Seed users: `user1@seed.local` … `user5@seed.local` / `stagepass123`
- Admin credentials: on request

## Quick start (local)

```bash
git clone https://github.com/capitanx9/photo-feed-v2.git
cd photo-feed-v2
make dev-up
make dev-migrate && make dev-seed
```

App: <http://localhost:3000> — API: <http://localhost:8000/api/> — Swagger: <http://localhost:8000/api/schema/swagger-ui/>

`make help` lists every top-level target.

## Docs

**Quick-start**

- [Stage](docs/quick-start/stage.md) · [Dev](docs/quick-start/dev.md)

**Development**

- [Workflow](docs/develop/workflow.md) · [Make targets](docs/develop/make.md) · [Testing](docs/develop/testing.md)

**Debug**

- [Logs](docs/debug/logs.md) · [SSM](docs/debug/ssm.md) · [Stage shell](docs/debug/stage-shell.md)

**Deploy**

- [CI](docs/deploy/ci.md) · [CD](docs/deploy/cd.md) · [Infra](docs/deploy/infra.md) · [Lambda images](docs/deploy/lambda-images.md) · [DNS](docs/deploy/dns.md)

**API**

- [Overview](docs/api/overview.md) · [Auth](docs/api/auth.md) · [Media flow](docs/api/media-flow.md) · [AI flow](docs/api/ai-flow.md)

**Architecture**

- [architecture.md](docs/architecture.md) — the "why" behind the shape of the codebase

**Runbooks**

- [SSH via SSM](docs/runbooks/ssh-via-ssm.md) · [DNS import bootstrap](docs/runbooks/dns-import-bootstrap.md)

## License + issues

MIT. Bug reports and feature requests: <https://github.com/capitanx9/photo-feed-v2/issues>.
