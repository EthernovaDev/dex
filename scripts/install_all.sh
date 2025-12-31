#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/novadex/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "[ERROR] Missing required var: $name" >&2
    exit 1
  fi
}

for var in RPC_URL DEPLOYER_PRIVATE_KEY DEX_DOMAIN EXPLORER_URL LE_EMAIL CHAIN_ID; do
  require_env "$var"
done

if [ "$(id -u)" -ne 0 ]; then
  echo "[ERROR] Run this script as root (sudo)." >&2
  exit 1
fi

echo "[INFO] Installing base packages..."
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y git curl ufw build-essential jq fail2ban ca-certificates gnupg lsb-release apt-transport-https dnsutils

if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  echo "[INFO] Adding Docker GPG key..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi
if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
  echo "[INFO] Adding Docker apt repo..."
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
fi
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

if ! id -u novadex >/dev/null 2>&1; then
  echo "[INFO] Creating user novadex..."
  adduser --disabled-password --gecos "" novadex
fi
usermod -aG sudo novadex
usermod -aG docker novadex

if ! command -v node >/dev/null 2>&1; then
  echo "[INFO] Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
corepack enable

sudo -u novadex mkdir -p /opt/novadex/{contracts,graph,subgraph,dex-ui,dex-info,caddy,scripts}
chown -R novadex:novadex /opt/novadex
chmod 600 /opt/novadex/.env
if [ -d /opt/novadex/graph/postgres ]; then
  chown -R 999:999 /opt/novadex/graph/postgres
fi

ufw allow 22 || true
ufw allow 80 || true
ufw allow 443 || true
ufw --force enable

echo "[INFO] Base install complete."
