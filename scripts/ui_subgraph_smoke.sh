#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/novadex/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

BASE_URL="https://${DEX_DOMAIN:-dex.ethnova.net}"
QUERY='{"query":"{_meta{block{number}}}"}'

check_endpoint() {
  local url="$1"
  local resp
  resp="$(curl -sS "$url" -H 'content-type: application/json' --data "$QUERY" || true)"
  if command -v rg >/dev/null 2>&1; then
    if echo "$resp" | rg -qi '<html|<!doctype'; then
      echo "[ERROR] HTML response from $url" >&2
      return 1
    fi
  else
    if echo "$resp" | grep -qiE '<html|<!doctype'; then
      echo "[ERROR] HTML response from $url" >&2
      return 1
    fi
  fi
  if ! echo "$resp" | jq -e '.data._meta.block.number' >/dev/null 2>&1; then
    echo "[ERROR] Invalid GraphQL response from $url" >&2
    echo "$resp" >&2
    return 1
  fi
  local block
  block="$(echo "$resp" | jq -r '.data._meta.block.number')"
  echo "[OK] $url _meta.block.number=$block"
}

check_endpoint "${BASE_URL}/subgraphs/name/novadex/novadex"
check_endpoint "${BASE_URL}/info/subgraphs/name/novadex/novadex"

echo "[OK] ui_subgraph_smoke completed"
