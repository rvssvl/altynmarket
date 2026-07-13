#!/usr/bin/env bash

set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this bootstrap script as root on an Ubuntu 24.04 VPS." >&2
  exit 1
fi

DEPLOY_USER=${DEPLOY_USER:-altyn-deploy}
APP_ROOT=/opt/altyn-market

apt-get update
apt-get install --yes ca-certificates curl git rsync ufw gnupg restic

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"${VERSION_CODENAME}\") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install --yes docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"
install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" -m 0750 "${APP_ROOT}"
install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" -m 0750 "${APP_ROOT}/releases"
install -d -o root -g "${DEPLOY_USER}" -m 0750 /etc/altyn-market

ufw default deny incoming
ufw default allow outgoing
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow OpenSSH
ufw --force enable

systemctl enable --now docker
echo "Bootstrap complete. Add the CI deploy public key to /home/${DEPLOY_USER}/.ssh/authorized_keys, then create /etc/altyn-market/staging.env from infra/env/staging.env.example."
