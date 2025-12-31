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

cd /opt/novadex/graph
export RPC_URL

if [ ! -d postgres ]; then
  mkdir -p postgres
fi
if [ ! -d ipfs ]; then
  mkdir -p ipfs
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

if [ -d /opt/novadex/graph/postgres ]; then
  $SUDO chown -R 999:999 /opt/novadex/graph/postgres
fi

SERVICE_FILE="/etc/systemd/system/novadex-graph.service"
if [ ! -f "$SERVICE_FILE" ]; then
  echo "[INFO] Creating novadex-graph systemd service..."
  cat <<'EOF' | $SUDO tee "$SERVICE_FILE" >/dev/null
[Unit]
Description=NovaDEX Graph Node (Docker Compose)
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/novadex/graph
EnvironmentFile=/opt/novadex/.env
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=always
RestartSec=5
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
EOF
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable novadex-graph
fi

echo "[INFO] Starting graph stack via docker compose..."
docker compose pull
docker compose up -d

echo "[INFO] Graph services running."
