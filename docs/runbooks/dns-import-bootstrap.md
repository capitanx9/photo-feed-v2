# DNS import bootstrap

The Route 53 hosted zone for `photo-feed.click` and the `stage.photo-feed.click` A-record already exist — created out-of-band when the domain was first registered via Route 53 domain registration. The `photo-feed-base-dns` stack owns them going forward, but the very first stack creation has to happen through a CloudFormation **IMPORT**, not a plain `deploy`. Otherwise CloudFormation would try to create a second hosted zone with the same name and fail (best case) or duplicate authoritative DNS (worst case).

## One-time procedure

```bash
STACK=photo-feed-base-dns
REGION=eu-central-1
ZONE_ID=Z04994032Y4D2V7758MOD

AWS_PROFILE=cx9-gmail aws cloudformation create-change-set \
  --stack-name "$STACK" \
  --change-set-name import-existing \
  --change-set-type IMPORT \
  --template-body file://infra/cf/base/dns.yaml \
  --resources-to-import "[
    {
      \"ResourceType\": \"AWS::Route53::HostedZone\",
      \"LogicalResourceId\": \"HostedZone\",
      \"ResourceIdentifier\": {\"Id\": \"${ZONE_ID}\"}
    },
    {
      \"ResourceType\": \"AWS::Route53::RecordSet\",
      \"LogicalResourceId\": \"StageARecord\",
      \"ResourceIdentifier\": {
        \"HostedZoneId\": \"${ZONE_ID}\",
        \"Name\": \"stage.photo-feed.click.\",
        \"Type\": \"A\"
      }
    }
  ]" \
  --region "$REGION"

AWS_PROFILE=cx9-gmail aws cloudformation execute-change-set \
  --stack-name "$STACK" \
  --change-set-name import-existing \
  --region "$REGION"

AWS_PROFILE=cx9-gmail aws cloudformation wait stack-import-complete \
  --stack-name "$STACK" \
  --region "$REGION"
```

## Guard

`deploy-infra-dns.yml` refuses to run if the stack does not exist. That way a fresh clone of the repo, or an accidental stack deletion, cannot silently re-create the hosted zone from scratch and swap the NS records under your feet.

## After the import

The stack is now a regular CloudFormation stack. Any edit to `infra/cf/base/dns.yaml` goes out via the `deploy-infra-dns` workflow on push to `main`. Adding a new record (e.g. `prod.photo-feed.click`) is a normal template edit — no more manual imports.

## Verify

After the import completes:

```bash
AWS_PROFILE=cx9-gmail aws cloudformation describe-stacks \
  --stack-name photo-feed-base-dns \
  --region eu-central-1 \
  --query 'Stacks[0].[StackStatus,Outputs]' --output json

dig +short stage.photo-feed.click
# → 63.186.67.101
```
