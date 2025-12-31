#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/novadex/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

RPC_URL="${1:-${RPC_URL:-}}"
ADDRESS="${2:-}"
ATTEMPTS="${ATTEMPTS:-10}"

if [ -z "${RPC_URL:-}" ]; then
  echo "[ERROR] Missing RPC_URL" >&2
  exit 1
fi

if [ -n "$ADDRESS" ]; then
  /opt/novadex/scripts/check_addr.sh "$ADDRESS" >/dev/null
fi

DEPLOYMENTS="/opt/novadex/contracts/deployments.json"
WNOVA=""
TONY=""
if [ -f "$DEPLOYMENTS" ]; then
  WNOVA="$(jq -r '.addresses.wnova // empty' "$DEPLOYMENTS")"
  TONY="$(jq -r '.addresses.tony // empty' "$DEPLOYMENTS")"
fi

rpc_call() {
  local payload="$1"
  local attempts="$ATTEMPTS"
  local delay=1
  local i=0

  while [ $i -lt $attempts ]; do
    local tmp_body tmp_headers resp http_status content_type body
    tmp_body="$(mktemp)"
    tmp_headers="$(mktemp)"

    resp="$(curl -sS --max-time 20 --connect-timeout 5 \
      -D "$tmp_headers" \
      -o "$tmp_body" \
      -w '%{http_code}\n%{content_type}' \
      "$RPC_URL" -H 'content-type: application/json' --data "$payload" || true)"

    read -r http_status content_type <<<"$resp"
    body="$(cat "$tmp_body")"
    rm -f "$tmp_body" "$tmp_headers"

    echo "[HTTP] status=${http_status} content-type=${content_type}" >&2

    local is_html=0
    if echo "$content_type" | grep -qi 'text/html'; then
      is_html=1
    fi
    if echo "$body" | grep -qiE '^\s*<(!doctype|html)'; then
      is_html=1
    fi

    if [ "$http_status" = "200" ] && [ "$is_html" -eq 0 ]; then
      if echo "$body" | jq -e '.error' >/dev/null 2>&1; then
        echo "[RPC ERROR]" >&2
        echo "$body" | jq . >&2
        return 1
      fi
      echo "$body"
      return 0
    fi

    if [ "$http_status" = "503" ] || [ "$http_status" = "000" ] || [ -z "$http_status" ] || [ "$is_html" -eq 1 ]; then
      echo "[WARN] RPC returned ${http_status:-unknown}${is_html:+/html}, retrying in ${delay}s..." >&2
      sleep "$delay"
      delay=$((delay * 2))
      i=$((i + 1))
      continue
    fi

    echo "[HTTP ERROR] status $http_status" >&2
    echo "$body" >&2
    return 1
  done

  echo "[ERROR] RPC unavailable after ${attempts} attempts" >&2
  return 1
}

pad_addr() {
  local a="${1#0x}"
  printf '%064s' "$a" | tr ' ' 0
}

echo "[INFO] RPC: $RPC_URL"

chain_resp="$(rpc_call "{\"jsonrpc\":\"2.0\",\"method\":\"eth_chainId\",\"params\":[],\"id\":1}")"
net_resp="$(rpc_call "{\"jsonrpc\":\"2.0\",\"method\":\"net_version\",\"params\":[],\"id\":2}")"

printf 'chainId: %s\n' "$(echo "$chain_resp" | jq -r '.result')"
printf 'net_version: %s\n' "$(echo "$net_resp" | jq -r '.result')"

if [ -n "$ADDRESS" ]; then
  bal_resp="$(rpc_call "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ADDRESS\",\"latest\"],\"id\":3}")"
  printf 'balance: %s\n' "$(echo "$bal_resp" | jq -r '.result')"
fi

if [ -n "$ADDRESS" ] && [ -n "$WNOVA" ] && [ -n "$TONY" ]; then
  data="0x70a08231$(pad_addr "$ADDRESS")"
  wnova_resp="$(rpc_call "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$WNOVA\",\"data\":\"$data\"},\"latest\"],\"id\":4}")"
  tony_resp="$(rpc_call "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$TONY\",\"data\":\"$data\"},\"latest\"],\"id\":5}")"
  printf 'wnova.balanceOf: %s\n' "$(echo "$wnova_resp" | jq -r '.result')"
  printf 'tony.balanceOf: %s\n' "$(echo "$tony_resp" | jq -r '.result')"
fi
