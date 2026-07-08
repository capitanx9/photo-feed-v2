# DNS

- **Hosted zone.** `photo-feed.click`, hosted zone ID `Z04994032Y4D2V7758MOD`.
- **Owner.** CloudFormation stack `photo-feed-base-dns` (`infra/cf/base/dns.yaml`) — after a one-time IMPORT, everything is managed via CF from then on.
- **Stage FQDN.** `stage.photo-feed.click` → the Elastic IP declared by `photo-feed-ec2-stage` (`StageEIP` output). The A-record TTL is 300s.
- **Workflow.** `deploy-infra-dns.yml` on push to `main` when `infra/cf/base/dns.yaml` changes. It refuses to run if the stack doesn't exist yet — a fresh clone can never nuke the live domain — and prints where to find the bootstrap runbook.

## Why DNS is a separate workflow

`deploy-infra-base` deliberately excludes `dns.yaml`. `Route53::RecordSet` is not import-eligible: the very first setup has to be a `create-change-set --change-set-type IMPORT` against the existing zone and record. A plain `deploy` on an empty stack would try to create a second hosted zone with the same name, which either fails (best case) or duplicates authoritative DNS (worst case).

## Bootstrap or recovery

Full one-time IMPORT + verification steps and the recovery dance if the stack ever needs to be recreated: **[../runbooks/dns-import-bootstrap.md](../runbooks/dns-import-bootstrap.md)**.

## Related

- Where the stage EIP is defined: `infra/cf/ec2/ec2-stage.yaml` (`StageEIP` resource)
- Infra graph (which stacks depend on DNS): [infra.md](infra.md)
