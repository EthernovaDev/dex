#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/novadex/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <wallet_address>" >&2
  exit 1
fi

WALLET="$1"
if ! /opt/novadex/scripts/check_addr.sh "$WALLET" >/dev/null; then
  echo "[ERROR] Invalid address: $WALLET" >&2
  exit 1
fi

DEPLOYMENTS="/opt/novadex/contracts/deployments.json"
if [ ! -f "$DEPLOYMENTS" ]; then
  echo "[ERROR] Missing deployments.json at ${DEPLOYMENTS}" >&2
  exit 1
fi

RPC_URL="${RPC_URL:-https://rpc.ethnova.net}"
ROUTER="$(jq -r '.addresses.router' "$DEPLOYMENTS")"
WNOVA="$(jq -r '.addresses.wnova' "$DEPLOYMENTS")"
TONY="$(jq -r '.addresses.tony' "$DEPLOYMENTS")"

for addr in "$ROUTER" "$WNOVA" "$TONY"; do
  if ! /opt/novadex/scripts/check_addr.sh "$addr" >/dev/null; then
    echo "[ERROR] Invalid address: $addr" >&2
    exit 1
  fi
done

pad_addr() {
  local addr="${1#0x}"
  printf "%064s" "$addr" | tr ' ' '0'
}

rpc_call() {
  local method="$1"
  local params="$2"
  local attempts=5
  local delay=1
  local resp=""
  local is_html=0

  for ((i=1; i<=attempts; i++)); do
    resp="$(curl -sS "$RPC_URL" -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"method\":\"${method}\",\"params\":${params},\"id\":1}")" || true
    if command -v rg >/dev/null 2>&1; then
      echo "$resp" | rg -qi '<html|<!doctype' && is_html=1 || is_html=0
    else
      echo "$resp" | grep -qiE '<html|<!doctype' && is_html=1 || is_html=0
    fi
    if [ "$is_html" -eq 1 ]; then
      echo "[WARN] RPC returned HTML on attempt ${i}" >&2
    elif echo "$resp" | jq -e '.error' >/dev/null 2>&1; then
      echo "[WARN] RPC error on attempt ${i}: $(echo "$resp" | jq -r '.error.message')" >&2
    else
      echo "$resp"
      return 0
    fi
    sleep "$delay"
    delay=$((delay * 2))
  done

  echo "[ERROR] RPC failed after ${attempts} attempts" >&2
  echo "$resp" >&2
  return 1
}

echo "[INFO] Wallet: $WALLET"
echo "[INFO] Router: $ROUTER"
echo "[INFO] WNOVA:  $WNOVA"
echo "[INFO] TONY:   $TONY"

allowance_data() {
  local owner="$1"
  local spender="$2"
  echo "0xdd62ed3e$(pad_addr "$owner")$(pad_addr "$spender")"
}

read_allowance() {
  local token="$1"
  local label="$2"
  local data
  data="$(allowance_data "$WALLET" "$ROUTER")"
  local resp
  resp="$(rpc_call "eth_call" "[{\"to\":\"$token\",\"data\":\"$data\"},\"latest\"]")" || {
    echo "[WARN] ${label} allowance: UNKNOWN (RPC)"
    return 0
  }
  local raw
  raw="$(echo "$resp" | jq -r '.result')"
  if [ -z "$raw" ] || [ "$raw" = "null" ]; then
    echo "[WARN] ${label} allowance: UNKNOWN (null result)"
    return 0
  fi
  python3 - "$raw" "$label" <<'PY'
import sys
raw = sys.argv[1]
label = sys.argv[2]
try:
    val = int(raw, 16)
except Exception:
    print(f"[WARN] {label} allowance: UNKNOWN (invalid hex)")
    sys.exit(0)
print(f"[INFO] {label} allowance (raw): {val}")
print(f"[INFO] {label} allowance (18 decimals): {val / 10**18:.6f}")
PY
}

read_allowance "$WNOVA" "WNOVA"
read_allowance "$TONY" "TONY"
