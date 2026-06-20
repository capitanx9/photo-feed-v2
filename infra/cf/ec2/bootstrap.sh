#!/bin/bash
# EC2 bootstrap for photo-feed stage.
#
# Runs once on first boot via EC2 UserData. Idempotent enough that re-running
# after manual ssh-in won't break anything, but the canonical execution path
# is "fresh instance, first boot".
#
# Inputs (env, set by the YAML UserData wrapper before invoking this file):
#   CF_STACK_NAME   - CloudFormation stack name (for cfn-signal target)
#   CF_REGION       - AWS region of the stack
#   GH_REPO_URL     - https://github.com/.../photo-feed-v2.git
#
# Output goes to /var/log/photo-feed-userdata.log on the instance.

set -euxo pipefail
exec > >(tee /var/log/photo-feed-userdata.log) 2>&1

# ----------------------------------------------------------------------
# 1) Base packages + docker (official repo, not distro packages).
# ----------------------------------------------------------------------

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git unzip jq gettext-base

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# shellcheck source=/dev/null
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
      https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
      > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io \
                    docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
usermod -aG docker ubuntu

# ----------------------------------------------------------------------
# 2) awscli v2 — the apt package is v1; v2 is what apply.sh expects.
# ----------------------------------------------------------------------

curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" \
  -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install --update
rm -rf /tmp/aws /tmp/awscliv2.zip

# ----------------------------------------------------------------------
# 3) cfn-helper-scripts — needed for cfn-signal below.
# ----------------------------------------------------------------------

apt-get install -y python3-pip
pip3 install --break-system-packages \
  https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz

# ----------------------------------------------------------------------
# 4) Sparse-checkout the repo into /srv/photo-feed.
#    Only infra/host/ lands on disk. packages/, infra/cf/, docs/ stay
#    on github.com — the host never needs them.
# ----------------------------------------------------------------------

install -d -o ubuntu -g ubuntu /srv/photo-feed
sudo -u ubuntu git clone --filter=blob:none --no-checkout \
  "${GH_REPO_URL}" /srv/photo-feed
cd /srv/photo-feed
sudo -u ubuntu git sparse-checkout init --cone
sudo -u ubuntu git sparse-checkout set infra/host
sudo -u ubuntu git checkout main

# ----------------------------------------------------------------------
# 5) Signal CloudFormation that init is done.
#    If anything above failed, set -e aborted the script and cfn-signal
#    never fires. CF then times out the CreationPolicy → stack failed.
# ----------------------------------------------------------------------

/usr/local/bin/cfn-signal --success true \
  --stack "${CF_STACK_NAME}" \
  --resource StageInstance \
  --region "${CF_REGION}" || true
