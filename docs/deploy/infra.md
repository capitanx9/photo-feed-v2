# Infra — CloudFormation stacks

AWS resources are pinned in CloudFormation under `infra/cf/`. One folder = one deploy workflow = one or more stacks. Everything glues together through `!ImportValue` on named `Export`s, so the dependency graph is baked into the templates themselves.

## Layout

```
infra/cf/
  base/       network.yaml   iam.yaml   secrets.yaml   dns.yaml
  ecr/        ecr-euc1.yaml  ecr-usw2.yaml
  s3/         s3-euc1.yaml   s3-usw2.yaml
  ec2/        ec2-stage.yaml (+ bootstrap.sh)
  lambdas/    euc1.yaml      usw2.yaml   (+ images.env)
```

## Stacks + workflows

| Group | Stacks | Workflow | Region | Path filter |
| --- | --- | --- | --- | --- |
| Base | `photo-feed-base-network`, `photo-feed-base-iam`, `photo-feed-base-secrets` | `deploy-infra-base` | `eu-central-1` | `infra/cf/base/**` (excludes `dns.yaml`) |
| DNS | `photo-feed-base-dns` | `deploy-infra-dns` | `eu-central-1` | `infra/cf/base/dns.yaml` |
| ECR | `photo-feed-ecr-euc1`, `photo-feed-ecr-usw2` | `deploy-infra-ecr` | `eu-central-1` + `us-west-2` | `infra/cf/ecr/**` |
| S3 | `photo-feed-s3-euc1`, `photo-feed-s3-usw2` | `deploy-infra-s3` | `eu-central-1` + `us-west-2` | `infra/cf/s3/**` |
| EC2 | `photo-feed-ec2-stage` | `deploy-infra-ec2-stage` | `eu-central-1` | `infra/cf/ec2/**` |
| Lambdas | `photo-feed-lambdas-euc1`, `photo-feed-lambdas-usw2` | `deploy-lambdas-stage` | `eu-central-1` + `us-west-2` | `infra/cf/lambdas/**` |

All workflows use `--no-fail-on-empty-changeset` — deploying an unchanged stack is a no-op, so an unrelated path-filter false positive doesn't fail CI.

## Dependency graph

`base` is the foundation for everything else. `dns` and `ec2` and `lambdas` sit on top of it. `s3` depends on `lambdas/euc1` because the S3 bucket notification points at the `cut_image` function ARN.

```
base/network  ─┐
base/iam      ─┼─→ ec2/ec2-stage  ─┐
base/secrets  ─┘                   ├─→ base/dns (StageEIP)
                                   │
ecr/*          (independent — pushed to before deploy)
                                   │
lambdas/euc1  ────→ s3/s3-euc1     │
lambdas/usw2  ────→ s3/s3-usw2     │
                                   │
                             infra/host/apply.sh reads:
                               - StageDomain from ec2-stage
                               - secrets from base/secrets
```

### Key `!ImportValue` edges

- `ec2/ec2-stage.yaml` imports `photo-feed-instance-profile-name`, `photo-feed-public-subnet-a`, `photo-feed-ec2-sg-id` from `base/`.
- `s3/s3-euc1.yaml` imports `photo-feed-cut-image-fn-arn` from `lambdas/euc1` for the S3 → Lambda notification. Order matters at bootstrap.
- `base/dns.yaml` imports `photo-feed-stage-eip` from `ec2-stage` for the A-record. See `docs/runbooks/dns-import-bootstrap.md` for the one-time IMPORT dance.

Exports are declared under `Outputs:` in each template and referenced by exact export name.

## One-time apply order

For a from-scratch account, apply in dependency order:

1. `deploy-infra-base` (network → iam → secrets, sequential inside the workflow)
2. `deploy-infra-ecr` (both regions in parallel)
3. Push some initial images so ECR isn't empty — run each `build-*` workflow once via `workflow_dispatch`.
4. `deploy-lambdas-stage` (both regions in parallel)
5. `deploy-infra-s3` — the `s3-euc1` stack references the cut_image ARN, so lambdas must exist first.
6. `deploy-infra-ec2-stage` — creates the instance and the Elastic IP.
7. **One-time DNS import** (see `docs/runbooks/dns-import-bootstrap.md`) — the hosted zone and stage A-record must be imported into CloudFormation, not `deploy`d fresh, or a second hosted zone gets created.
8. `deploy-infra-dns` from then on.
9. `deploy-host-stage` (either via a subsequent push to `infra/host/**` or `workflow_dispatch`) to bring compose up on the instance.

`deploy-infra-dns` refuses to run if the stack doesn't exist yet — it prints the runbook location and exits non-zero, so a fresh clone can never nuke the live domain.

## Ongoing changes

Each stack has an idempotent `aws cloudformation deploy` step. Path filters mean editing `infra/cf/ecr/**` triggers only `deploy-infra-ecr`, not `deploy-infra-base`. Concurrency groups (`photo-feed-deploy-infra-*`) serialise same-workflow runs so two updates to the same stack can't collide.

Each workflow assumes the `photo-feed-github-actions-infra` role via OIDC. That role has the CloudFormation permissions needed for its stacks and nothing else (see `infra/cf/base/iam.yaml`).

## EC2 replacement guard

`ec2/ec2-stage.yaml` pins `UbuntuAMI` as `AWS::EC2::Image::Id` with a **hardcoded default** — deliberately not resolved from SSM. Canonical publishes a new AMI every few days; if CloudFormation ever saw a new ImageId on an UPDATE it would replace the instance and silently wipe the compose volumes (Postgres data, certbot data). Bump `UbuntuAMI` deliberately when the AMI needs refreshing. Long term, RDS moves the DB off the instance and this stops mattering.

## Related

- CI that pushes the images each deploy references: [ci.md](ci.md)
- Host-stage apply on the EC2 instance: [cd.md](cd.md)
- Lambda specifics: [lambda-images.md](lambda-images.md)
- DNS one-time import: [dns.md](dns.md), [../runbooks/dns-import-bootstrap.md](../runbooks/dns-import-bootstrap.md)
