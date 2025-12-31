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

BACKUP_DIR="/opt/novadex/backups"
mkdir -p "$BACKUP_DIR"

TS="$(date -u +%Y%m%d%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/novadex_${TS}.tar.gz"

echo "[INFO] Creating backup at ${BACKUP_FILE}..."

tar \
  --exclude='/opt/novadex/backups' \
  --exclude='**/node_modules' \
  --exclude='**/.git' \
  -czf "$BACKUP_FILE" \
  /opt/novadex

COUNT=$(ls -1t "${BACKUP_DIR}"/novadex_*.tar.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt 7 ]; then
  ls -1t "${BACKUP_DIR}"/novadex_*.tar.gz | tail -n +8 | xargs -r rm -f
fi

echo "[INFO] Backup complete. Total backups retained: $(ls -1t "${BACKUP_DIR}"/novadex_*.tar.gz 2>/dev/null | wc -l | tr -d ' ')"
