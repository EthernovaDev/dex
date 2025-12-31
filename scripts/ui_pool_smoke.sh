#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/novadex/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

DEPLOYMENTS="/opt/novadex/contracts/deployments.json"
if [ ! -f "$DEPLOYMENTS" ]; then
  echo "[ERROR] Missing deployments.json at ${DEPLOYMENTS}" >&2
  exit 1
fi

RPC_URL="${RPC_URL:-https://rpc.ethnova.net}"
FACTORY="$(jq -r '.addresses.factory' "$DEPLOYMENTS")"
WNOVA="$(jq -r '.addresses.wnova' "$DEPLOYMENTS")"
TONY="$(jq -r '.addresses.tony' "$DEPLOYMENTS")"

if ! /opt/novadex/scripts/check_addr.sh "$FACTORY" >/dev/null; then
  echo "[ERROR] Invalid factory address: $FACTORY" >&2
  exit 1
fi
if ! /opt/novadex/scripts/check_addr.sh "$WNOVA" >/dev/null; then
  echo "[ERROR] Invalid WNOVA address: $WNOVA" >&2
  exit 1
fi
if ! /opt/novadex/scripts/check_addr.sh "$TONY" >/dev/null; then
  echo "[ERROR] Invalid TONY address: $TONY" >&2
  exit 1
fi

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

  for ((i=1; i<=attempts; i++)); do
    resp="$(curl -sS "$RPC_URL" -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"method\":\"${method}\",\"params\":${params},\"id\":1}")" || true
    if command -v rg >/dev/null 2>&1; then
      echo "$resp" | rg -qi '<html|<!doctype' && is_html=1 || is_html=0
    else
      echo "$resp" | grep -qiE '<html|<!doctype' && is_html=1 || is_html=0
    fi
    if [ "${is_html:-0}" -eq 1 ]; then
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

echo "[INFO] Factory: $FACTORY"
echo "[INFO] WNOVA:   $WNOVA"
echo "[INFO] TONY:    $TONY"

get_pair_data="0xe6a43905$(pad_addr "$TONY")$(pad_addr "$WNOVA")"
pair_resp="$(rpc_call "eth_call" "[{\"to\":\"$FACTORY\",\"data\":\"$get_pair_data\"},\"latest\"]")"
pair_raw="$(echo "$pair_resp" | jq -r '.result')"

pair_addr="$(python3 - "$pair_raw" <<'PY'
import sys
data = sys.argv[1].lower() if len(sys.argv) > 1 else ''
if not data or data == 'null':
    print('0x0000000000000000000000000000000000000000')
    sys.exit(0)
addr = '0x' + data[-40:]
print(addr)
PY
)"

echo "[INFO] Pair: $pair_addr"
if [ "$pair_addr" = "0x0000000000000000000000000000000000000000" ]; then
  echo "[ERROR] Pair does not exist (TONY/WNOVA)" >&2
  exit 1
fi

get_reserves_data="0x0902f1ac"
reserves_resp="$(rpc_call "eth_call" "[{\"to\":\"$pair_addr\",\"data\":\"$get_reserves_data\"},\"latest\"]")"
reserves_raw="$(echo "$reserves_resp" | jq -r '.result')"

python3 - "$reserves_raw" <<'PY'
import sys
from decimal import Decimal

data = sys.argv[1] if len(sys.argv) > 1 else ''
if not data or data == 'null' or not data.startswith('0x'):
    print("[ERROR] Invalid reserves response")
    sys.exit(1)

raw = data[2:]
if len(raw) < 128:
    print("[ERROR] Reserves response too short")
    sys.exit(1)

reserve0 = int(raw[0:64], 16)
reserve1 = int(raw[64:128], 16)
print(f"[INFO] reserve0: {reserve0}")
print(f"[INFO] reserve1: {reserve1}")
if reserve0 == 0 and reserve1 == 0:
    print("[WARN] Pool exists but reserves are zero")
    sys.exit(2)
print("[OK] Pool exists with reserves")
PY
