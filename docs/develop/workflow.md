# Development workflow

Day-to-day rules for landing a change in `photo-feed-v2`.

## Branches

Off latest `origin/main`, always fresh:

```bash
git checkout main
git fetch origin
git reset --hard origin/main
git checkout -b feat/short-name
```

Prefixes: `feat/`, `fix/`, `chore/`, `docs/`. Keep updates from main via
`git rebase origin/main`, not `merge`.

## One PR per concern

- A single reason for the change. Touching several apps is fine if the
  *why* is one thing (e.g. new endpoint + worker task for the same
  feature).
- Split when the reasons diverge — one PR to bump a dep, another to
  ship the feature that needs it.

## PR title and body

- Title format: `<type>(<scope>): <subject>`. Under 70 chars.
  Examples: `feat(orders): checkout flow`, `fix(web): cart total off-by-one`.
- Do not put `#NN` in the title — GitHub appends it on squash.
- Do not mention phase numbers, lab numbers, v1/v2, or roadmap
  positions anywhere. Talk about the feature, not the plan.
- Body sections (use what fits):
  - `## Summary` — 1-3 bullets, what changes and why.
  - `## Flow` / `## Implementation` — when the change has real depth.
  - `## Verified locally` — exact commands run.
  - `## After merge` — for changes with runtime impact.
- No `Co-Authored-By` trailer. No `## Test plan` scaffolding.

## Validate before pushing

```bash
make lint         # ruff + eslint
make fmt-check    # ruff format --check + prettier --check
make test         # pytest api + web tsc + web build
```

For Django-only changes also run:

```bash
uv run python packages/api/src/manage.py makemigrations --check --dry-run
uv run python packages/api/src/manage.py spectacular --validate
```

Full target map: [make.md](make.md). Testing details: [testing.md](testing.md).

## Testing UI flows end-to-end locally

Some paths need real seed data + a manual admin nudge. Example — the
checkout wait popup, which long-polls until an admin approves the
order:

```bash
make dev-seed              # creates 5 pending orders
# open http://localhost:3000, log in as user1@seed.local,
# go to /orders — note the "pending" pills
make dev-approve-all       # flips them all to paid
# refresh /orders — pills flip; any active wait-confirm long-poll wakes
```

For destructive testing (deleting real data), same pattern with
`dev-wipe-*` and `dev-reset-db` — see
[make.md](make.md#wipe-dev).

## Push and open the PR

```bash
git push -u origin <branch>
gh pr create --title "..." --body "$(cat <<'EOF'
## Summary
- …
EOF
)"
```

If push fails with `agent refused operation`, tap YubiKey / Touch ID
and retry — the key is hardware-backed.

## After PR opens

- CI runs `ci-web-back`, `ci-web-front`, `ci-infra`, `ci-lambdas` on
  the paths that changed. Deploy pipelines only fire on `main`.
- Owner reviews and squash-merges via GitHub UI. Do not run
  `gh pr merge` unless explicitly asked.
- Once merged, the `photo-feed-bot-v2` app rebuilds affected images
  and rewrites `infra/host/images.env`, which triggers
  `deploy-host-stage`. Deploy details live in `docs/deploy/`.

## When CI goes red

Read the failed step first. Docker Hub 5xx on buildx and cold-cache
SSM timeouts are the usual flakes — just rerun the job. A red step
that reproduces on a rerun is a real bug.
