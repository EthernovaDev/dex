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

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

if ! command -v caddy >/dev/null 2>&1; then
  echo "[INFO] Installing Caddy..."
  $SUDO apt-get update -y
  $SUDO apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | $SUDO tee /etc/apt/trusted.gpg.d/caddy-stable.asc >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | $SUDO tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  $SUDO apt-get update -y
  $SUDO apt-get install -y caddy
fi

mkdir -p /opt/novadex/caddy
cat > /opt/novadex/caddy/Caddyfile <<EOF
{
  email ${LE_EMAIL}
}

${DEX_DOMAIN} {
  encode gzip

  handle_path /info* {
    root * /opt/novadex/current/dex-info/build
    file_server
  }

  handle /subgraphs/* {
    reverse_proxy 127.0.0.1:8000
  }

  handle_path /graphql {
    rewrite * /subgraphs/name/novadex/novadex
    reverse_proxy 127.0.0.1:8000
  }

  root * /opt/novadex/current/dex-ui/build
  file_server
}
EOF

echo "[INFO] Installing Caddyfile..."
$SUDO cp /opt/novadex/caddy/Caddyfile /etc/caddy/Caddyfile
$SUDO systemctl enable caddy
$SUDO systemctl restart caddy

echo "[INFO] Caddy configured."
