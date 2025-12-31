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

if $SUDO systemctl list-unit-files | grep -q "novadex-graph.service"; then
  echo "[INFO] Restarting novadex-graph systemd service..."
  $SUDO systemctl restart novadex-graph
else
  echo "[INFO] Restarting graph docker compose directly..."
  (cd /opt/novadex/graph && $SUDO docker compose up -d --remove-orphans)
fi

if $SUDO systemctl list-unit-files | grep -q "caddy.service"; then
  echo "[INFO] Restarting Caddy..."
  $SUDO systemctl restart caddy
fi

echo "[INFO] Restart complete."
