# Shell access via SSM Session Manager

The EC2 stage instance has no public SSH port. Shell access goes through
AWS SSM Session Manager: no key, no IP whitelist, works from any network,
authenticated by IAM, logged in CloudTrail.

The instance role `PhotoFeedInstanceRole` already includes
`AmazonSSMManagedInstanceCore` (see `infra/cf/base/iam.yaml`) — the SSM
Agent that ships with Ubuntu 22.04+ picks it up at boot.

## One-time setup (local)

Install the Session Manager plugin (only needed for interactive shells;
`send-command` works without it):

```bash
brew install --cask session-manager-plugin
```

## Interactive shell

```bash
AWS_PROFILE=cx9-gmail aws ssm start-session \
  --target i-030a13513a1cd91df \
  --region eu-central-1
```

Lands in a `ssm-user@ip-…` shell as root. `sudo -u ubuntu -i` to become
the `ubuntu` user if you want the usual home dir.

Also available from the AWS Console: EC2 → Instances → select instance →
Connect → Session Manager tab → Connect.

## One-shot commands (no interactive session)

Cheaper for scripting or "just look at the logs":

```bash
AWS_PROFILE=cx9-gmail aws ssm send-command \
  --instance-ids i-030a13513a1cd91df \
  --document-name AWS-RunShellScript \
  --region eu-central-1 \
  --parameters 'commands=["cd /srv/photo-feed/infra/host && docker compose -f docker-compose.stage.yml ps"]' \
  --query 'Command.CommandId' --output text
```

Poll for output using the returned `CommandId`:

```bash
AWS_PROFILE=cx9-gmail aws ssm get-command-invocation \
  --instance-id i-030a13513a1cd91df \
  --command-id <CommandId> \
  --region eu-central-1 \
  --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}'
```

## Common recipes

Interactive shell then:

```bash
cd /srv/photo-feed/infra/host

# All containers
docker compose -f docker-compose.stage.yml ps

# Tail Django logs
docker compose -f docker-compose.stage.yml logs -f --tail=200 web

# Tail Next.js logs
docker compose -f docker-compose.stage.yml logs -f --tail=200 web-front

# Tail nginx access + error logs together
docker compose -f docker-compose.stage.yml logs -f --tail=200 nginx

# Django management commands (e.g. createsuperuser)
docker compose -f docker-compose.stage.yml exec web python manage.py createsuperuser
```

## Emergency fallback

If the SSM Agent is broken (rare — it self-heals via SSM Fleet Manager),
use EC2 Serial Console from the AWS Console. It bypasses networking
entirely. `KeyName` on the CF stack is kept for this case.
