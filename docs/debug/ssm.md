# SSM cheat sheet

The stage EC2 host has no open SSH port. All shell access goes through
AWS Systems Manager. Full setup + rationale in
[../runbooks/ssh-via-ssm.md](../runbooks/ssh-via-ssm.md).

## Prerequisites

- `AWS_PROFILE=cx9-gmail` — SSO-backed. Refresh with
  `aws sso login --profile cx9-gmail` when the token expires.
- Session Manager plugin, for interactive shells only:

  ```bash
  brew install --cask session-manager-plugin
  ```

- Stage instance id: `i-030a13513a1cd91df` in `eu-central-1`.

## Interactive shell

```bash
aws ssm start-session \
  --target i-030a13513a1cd91df \
  --region eu-central-1 \
  --profile cx9-gmail
```

Lands you as `ssm-user@ip-…`. `sudo -u ubuntu -i` to become the
`ubuntu` user if you want the usual home dir. Same target is one make
away: `make stage-shell`.

## Fire-and-forget a command

`send-command` returns immediately with a `CommandId`; the shell runs
in the background on the host.

```bash
CID=$(aws ssm send-command \
  --instance-ids i-030a13513a1cd91df \
  --document-name AWS-RunShellScript \
  --region eu-central-1 \
  --profile cx9-gmail \
  --parameters 'commands=["sudo docker ps"]' \
  --query 'Command.CommandId' --output text)
echo "$CID"
```

Multi-line commands: pass a JSON array of one command per line, or
`bash -lc 'multi; command; here'`.

## Read the result

```bash
aws ssm get-command-invocation \
  --instance-id i-030a13513a1cd91df \
  --command-id "$CID" \
  --region eu-central-1 \
  --profile cx9-gmail \
  --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}'
```

`Status` cycles `Pending` → `InProgress` → `Success` / `Failed` /
`TimedOut`. Default timeout is 30 s — long-running host commands may
show `TimedOut` even when they finished; verify by re-running a
follow-up `ls` / `docker ps`.

## Send file contents (small)

```bash
aws ssm send-command \
  --instance-ids i-030a13513a1cd91df \
  --document-name AWS-RunShellScript \
  --region eu-central-1 \
  --profile cx9-gmail \
  --parameters commands="$(jq -Rs . < ./local-script.sh)"
```

For anything bigger than a page, upload to S3 first and `curl` it
inside the command.

## Common recipes

Container health:

```bash
--parameters 'commands=["sudo docker ps --format \"{{.Names}}\t{{.Status}}\""]'
```

Bounce the API container:

```bash
--parameters 'commands=["cd /srv/photo-feed/infra/host && sudo docker compose -f docker-compose.stage.yml restart web"]'
```

Once shelled in, see [stage-shell.md](stage-shell.md) for `docker
exec` recipes (Django shell, psql, redis-cli, seed, createsuperuser).
Log tailing: [logs.md](logs.md).
