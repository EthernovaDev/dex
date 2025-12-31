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
BASE_URL="https://${DEX_DOMAIN:-dex.ethnova.net}"

if ! /opt/novadex/scripts/check_addr.sh "$FACTORY" >/dev/null; then
  echo "[ERROR] Invalid factory address: $FACTORY" >&2
  exit 1
fi

pad_uint() {
  local n="$1"
  printf "%064x" "$n"
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

rpc_call_allow_revert() {
  local method="$1"
  local params="$2"
  local resp=""
  resp="$(curl -sS "$RPC_URL" -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"method\":\"${method}\",\"params\":${params},\"id\":1}")" || true
  echo "$resp"
}

is_execution_reverted() {
  local resp="$1"
  echo "$resp" | jq -e '.error.message == "execution reverted"' >/dev/null 2>&1
}

echo "[INFO] Factory: $FACTORY"

echo "[INFO] Checking UI main bundle..."
HTML="$(curl -fsS "$BASE_URL/")"
if command -v rg >/dev/null 2>&1; then
  MAIN_PATH="$(echo "$HTML" | rg -o '/static/js/main[^\" ]+\.js' -m1)"
else
  MAIN_PATH="$(echo "$HTML" | grep -o '/static/js/main[^\" ]*\.js' | head -n1)"
fi
if [ -z "$MAIN_PATH" ]; then
  echo "[ERROR] Could not find main bundle in HTML" >&2
  exit 1
fi
curl -fsS "$BASE_URL$MAIN_PATH" >/dev/null
echo "[OK] Main bundle: $MAIN_PATH"
length_data="0x4db4d5f6"
length_dec=0
use_logs=0
length_resp="$(rpc_call_allow_revert eth_call "[{\"to\":\"$FACTORY\",\"data\":\"$length_data\"},\"latest\"]")"
if is_execution_reverted "$length_resp"; then
  use_logs=1
else
  length_raw="$(echo "$length_resp" | jq -r '.result')"
  length_dec="$(python3 - "$length_raw" <<'PY'
import sys
raw = sys.argv[1]
if not raw or raw == 'null':
    print(0)
    sys.exit(0)
print(int(raw, 16))
PY
  )"
  if [ "$length_dec" -le 0 ]; then
    use_logs=1
  fi
fi

if [ "$use_logs" -eq 1 ]; then
  echo "[WARN] allPairsLength unavailable; falling back to PairCreated logs" >&2
  start_block="${START_BLOCK:-0}"
  if [ -n "$start_block" ]; then
    start_hex="0x$(printf "%x" "$start_block")"
  else
    start_hex="0x0"
  fi
  topic="0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9"
  logs_resp="$(rpc_call eth_getLogs "[{\"address\":\"$FACTORY\",\"fromBlock\":\"$start_hex\",\"toBlock\":\"latest\",\"topics\":[\"$topic\"]}]")"
  length_dec="$(echo "$logs_resp" | jq -r '.result | length')"
  if [ "$length_dec" -le 0 ] && [ "$start_hex" != "0x0" ]; then
    logs_resp="$(rpc_call eth_getLogs "[{\"address\":\"$FACTORY\",\"fromBlock\":\"0x0\",\"toBlock\":\"latest\",\"topics\":[\"$topic\"]}]")"
    length_dec="$(echo "$logs_resp" | jq -r '.result | length')"
  fi
  if [ "$length_dec" -le 0 ]; then
    echo "[ERROR] No PairCreated logs found" >&2
    exit 1
  fi
  echo "[INFO] PairCreated logs: $length_dec"
  first_data="$(echo "$logs_resp" | jq -r '.result[0].data')"
  PAIR="$(python3 - "$first_data" <<'PY'
import sys
data = sys.argv[1]
if not data.startswith("0x"):
    print("0x0000000000000000000000000000000000000000")
    sys.exit(0)
payload = data[2:]
if len(payload) < 64:
    print("0x0000000000000000000000000000000000000000")
    sys.exit(0)
slot0 = payload[:64]
pair = "0x" + slot0[-40:]
print(pair)
PY
)"
else
  echo "[INFO] allPairsLength: $length_dec"
  first_index=0
  pair_data="0x1e3dd18b$(pad_uint $first_index)"
  pair_resp="$(rpc_call eth_call "[{\"to\":\"$FACTORY\",\"data\":\"$pair_data\"},\"latest\"]")"
  pair_raw="$(echo "$pair_resp" | jq -r '.result')"
  PAIR="$(python3 - "$pair_raw" <<'PY'
import sys
data = sys.argv[1].lower()
if not data or data == 'null':
    print('0x0000000000000000000000000000000000000000')
    sys.exit(0)
print('0x' + data[-40:])
PY
)"
fi

if [ "$PAIR" = "0x0000000000000000000000000000000000000000" ]; then
  echo "[ERROR] allPairs(0) returned zero address" >&2
  exit 1
fi

echo "[INFO] First pair: $PAIR"

# token0/token1
TOKEN0_DATA="0x0dfe1681"
TOKEN1_DATA="0xd21220a7"

TOKEN0_RAW="$(rpc_call eth_call "[{\"to\":\"$PAIR\",\"data\":\"$TOKEN0_DATA\"},\"latest\"]" | jq -r '.result')"
TOKEN1_RAW="$(rpc_call eth_call "[{\"to\":\"$PAIR\",\"data\":\"$TOKEN1_DATA\"},\"latest\"]" | jq -r '.result')"

python3 - "$TOKEN0_RAW" "$TOKEN1_RAW" <<'PY'
import sys

def addr_from_hex(data: str) -> str:
    if not data or not data.startswith('0x'):
        return ''
    return '0x' + data[-40:]

print(f"[INFO] token0: {addr_from_hex(sys.argv[1])}")
print(f"[INFO] token1: {addr_from_hex(sys.argv[2])}")
PY

echo "[OK] ui_pairs_smoke completed"
