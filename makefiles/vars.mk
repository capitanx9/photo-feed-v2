# Shared variables — sourced first by the root Makefile.

UV := uv
DC_DEV := docker compose -f docker-compose.dev.yml

STAGE_INSTANCE_ID := i-030a13513a1cd91df
STAGE_REGION := eu-central-1
STAGE_PROFILE := cx9-gmail

SSM_RUN := aws ssm start-session --target $(STAGE_INSTANCE_ID) --region $(STAGE_REGION) --profile $(STAGE_PROFILE)

# Synchronous exec over SSM. Uses AWS-StartInteractiveCommand instead of
# send-command so we get output in the terminal in ~4s instead of waiting
# 30-60s for the SSM poll cycle. `command=[...]` is the doc-specific
# param shape — bash inside runs one shell command and returns.
SSM_EXEC := aws ssm start-session --target $(STAGE_INSTANCE_ID) --region $(STAGE_REGION) --profile $(STAGE_PROFILE) --document-name AWS-StartInteractiveCommand
