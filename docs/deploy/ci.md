# CI — image builds

Each buildable component has its own workflow that builds a container image, pushes it to ECR, and bumps the corresponding tag file in git. The bump commit lands on `main` and triggers the matching deploy workflow.

## Workflow matrix

| Workflow | Path filter | Region | ECR repo | Bumps |
| --- | --- | --- | --- | --- |
| `build-web-back` | `packages/api/**`, `pyproject.toml`, `uv.lock`, `.python-version`, `packages/api/Dockerfile` | `eu-central-1` | `photo-feed-api` | `API_IMAGE_TAG` in `infra/host/images.env` |
| `build-web-front` | `packages/web/**`, `packages/web/Dockerfile` | `eu-central-1` | `photo-feed-web` | `WEB_IMAGE_TAG` in `infra/host/images.env` |
| `build-cut-image` | `packages/cut_image/**`, `packages/cut_image/Dockerfile`, `pyproject.toml`, `uv.lock` | `eu-central-1` | `photo-feed-cut-image` | `CUT_IMAGE_TAG` in `infra/cf/lambdas/images.env` |
| `build-generate-image` | `packages/generate_image/**`, `packages/generate_image/Dockerfile`, `pyproject.toml`, `uv.lock` | `us-west-2` | `photo-feed-generate-image` | `GENERATE_IMAGE_TAG` in `infra/cf/lambdas/images.env` |

All four also run on `workflow_dispatch`. Each workflow's own YAML is in its own path filter, so editing the workflow re-runs it.

## Image tag scheme

Each build computes `TAG="${GITHUB_SHA::12}"` — the first 12 characters of the commit SHA that triggered the build. There are no `:latest` tags. The tag is what the deploy workflows read out of `images.env` and pass to CloudFormation / compose.

## OIDC and IAM roles

No long-lived AWS keys. Every job assumes an IAM role via GitHub's OIDC provider:

| Purpose | Role |
| --- | --- |
| Build + push api/web, deploy host stage | `arn:aws:iam::797890596022:role/photo-feed-github-actions-api` |
| Build + push lambdas, deploy lambda stacks | `arn:aws:iam::797890596022:role/photo-feed-github-actions-lambdas` |
| Deploy CloudFormation infra stacks | `arn:aws:iam::797890596022:role/photo-feed-github-actions-infra` |

Roles + OIDC provider are declared in `infra/cf/base/iam.yaml`.

## Bumping `images.env` (bot commit)

The build workflows push the bump commit as the `photo-feed-bot-v2` GitHub App — the App is a bypass actor in the `main` branch ruleset, so it can commit straight to `main` without opening a PR. The default `GITHUB_TOKEN` cannot bypass the ruleset, so a bot token is minted with `actions/create-github-app-token@v1` and only used for the push step.

The bump step is a **retry-loop** (5 attempts, quadratic backoff):

1. `git fetch origin main`
2. `git reset --hard origin/main`
3. Rewrite only the one line via `awk` (leaves other tag lines untouched — a concurrent build of the other component can't conflict)
4. Commit; `git push origin HEAD:main`
5. On push failure (main moved), reset and retry

Commit subject follows the house style:

```
[deploy] ci(build-web-back): bump API_IMAGE_TAG to <sha12> (#<pr>)
```

The `(#<pr>)` suffix is looked up via `gh pr list --search "$GITHUB_SHA" --state merged`.

## Concurrency

Each build workflow serialises itself with its own `concurrency` group so two builds of the same component can never race:

- `photo-feed-build-web-back`
- `photo-feed-build-web-front`
- `photo-feed-build-cut-image`
- `photo-feed-build-generate-image`

`cancel-in-progress: false` — a queued newer commit waits for the current build to finish instead of cancelling it (a partial push to ECR is safe, but the git-bump-and-push step is not idempotent under cancellation).

## Buildx cache

All four workflows use `type=gha,mode=max`. A cold cache adds ~2 min to the api/web images. Lambda images (`packages/cut_image`, `packages/generate_image`) build for `linux/amd64` only with `provenance: false` — Lambda's container-image runtime only accepts amd64 by default and rejects the multi-arch attestation manifest.

## Related

- Deploy side of the pipeline: [cd.md](cd.md)
- Infra stacks the deployed images run against: [infra.md](infra.md)
- Lambda specifics: [lambda-images.md](lambda-images.md)
