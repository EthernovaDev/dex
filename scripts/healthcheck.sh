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

echo "[CHECK] swap UI"
curl -fsS "https://${DEX_DOMAIN}/" | head

echo "[CHECK] analytics"
curl -fsS "https://${DEX_DOMAIN}/info" | head

echo "[CHECK] subgraph query"
curl -fsS "https://${DEX_DOMAIN}/subgraphs/name/novadex/novadex" \
  -H 'content-type: application/json' \
  --data '{"query":"{pairs(first:1){id}}"}'

echo "[CHECK] graphql query"
curl -fsS "https://${DEX_DOMAIN}/graphql" \
  -H 'content-type: application/json' \
  --data '{"query":"{pairs(first:1){id}}"}'

echo "[CHECK] docker ps"
$SUDO docker ps

echo "[CHECK] systemd caddy"
$SUDO systemctl is-active caddy

echo "[CHECK] systemd novadex-graph"
$SUDO systemctl is-active novadex-graph
