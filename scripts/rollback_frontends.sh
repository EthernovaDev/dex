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

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <release_id>" >&2
  echo "Available releases:" >&2
  ls -1 /opt/novadex/releases 2>/dev/null || true
  exit 1
fi

RELEASE_ID="$1"
RELEASE_DIR="/opt/novadex/releases/${RELEASE_ID}"

if [ ! -d "${RELEASE_DIR}/dex-ui/build" ] || [ ! -d "${RELEASE_DIR}/dex-info/build" ]; then
  echo "[ERROR] Release ${RELEASE_ID} is missing dex-ui/build or dex-info/build" >&2
  exit 1
fi

mkdir -p /opt/novadex/current
ln -sfn "${RELEASE_DIR}/dex-ui" /opt/novadex/current/dex-ui
ln -sfn "${RELEASE_DIR}/dex-info" /opt/novadex/current/dex-info

echo "[INFO] Switched current release to ${RELEASE_ID}"

if systemctl is-active --quiet caddy; then
  systemctl reload caddy || systemctl restart caddy
fi
