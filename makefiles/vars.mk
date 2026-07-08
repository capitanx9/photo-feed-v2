# Shared variables — sourced first by the root Makefile.

UV := uv
DC_DEV := docker compose -f docker-compose.dev.yml

STAGE_INSTANCE_ID := i-030a13513a1cd91df
STAGE_REGION := eu-central-1
STAGE_PROFILE := cx9-gmail

SSM_RUN := aws ssm start-session --target $(STAGE_INSTANCE_ID) --region $(STAGE_REGION) --profile $(STAGE_PROFILE)
SSM_EXEC := aws ssm send-command --instance-ids $(STAGE_INSTANCE_ID) --region $(STAGE_REGION) --profile $(STAGE_PROFILE) --document-name AWS-RunShellScript
