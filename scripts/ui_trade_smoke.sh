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

for addr in "$FACTORY" "$WNOVA" "$TONY"; do
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

echo "[INFO] Factory: $FACTORY"
echo "[INFO] WNOVA:   $WNOVA"
echo "[INFO] TONY:    $TONY"

get_pair_data="0xe6a43905$(pad_addr "$WNOVA")$(pad_addr "$TONY")"
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
  echo "[ERROR] Pair does not exist (WNOVA/TONY)" >&2
  exit 1
fi

token0_data="0x0dfe1681"
token1_data="0xd21220a7"
reserves_data="0x0902f1ac"

token0_resp="$(rpc_call "eth_call" "[{\"to\":\"$pair_addr\",\"data\":\"$token0_data\"},\"latest\"]")"
token1_resp="$(rpc_call "eth_call" "[{\"to\":\"$pair_addr\",\"data\":\"$token1_data\"},\"latest\"]")"
reserves_resp="$(rpc_call "eth_call" "[{\"to\":\"$pair_addr\",\"data\":\"$reserves_data\"},\"latest\"]")"

token0_raw="$(echo "$token0_resp" | jq -r '.result')"
token1_raw="$(echo "$token1_resp" | jq -r '.result')"
reserves_raw="$(echo "$reserves_resp" | jq -r '.result')"

python3 - "$token0_raw" "$token1_raw" "$reserves_raw" "$WNOVA" "$TONY" <<'PY'
import os
import sys

def addr_from_hex(data: str) -> str:
    if not data or not data.startswith('0x'):
        return ''
    return '0x' + data[-40:]

token0 = addr_from_hex(sys.argv[1])
token1 = addr_from_hex(sys.argv[2])
reserves_raw = sys.argv[3]
wnova = sys.argv[4].lower()
tony = sys.argv[5].lower()

if not reserves_raw or not reserves_raw.startswith('0x'):
    print("[ERROR] Invalid reserves response")
    sys.exit(1)

raw = reserves_raw[2:]
if len(raw) < 128:
    print("[ERROR] Reserves response too short")
    sys.exit(1)

reserve0 = int(raw[0:64], 16)
reserve1 = int(raw[64:128], 16)
print(f"[INFO] token0: {token0}")
print(f"[INFO] token1: {token1}")
print(f"[INFO] reserve0: {reserve0}")
print(f"[INFO] reserve1: {reserve1}")

if token0.lower() == wnova and token1.lower() == tony:
    reserve_wnova = reserve0
    reserve_tony = reserve1
elif token0.lower() == tony and token1.lower() == wnova:
    reserve_wnova = reserve1
    reserve_tony = reserve0
else:
    print("[ERROR] Token0/Token1 do not match WNOVA/TONY")
    sys.exit(1)

amount_in = 10 ** 18  # 1 WNOVA
if reserve_wnova == 0:
    print("[ERROR] WNOVA reserve is zero")
    sys.exit(1)

quote = (amount_in * reserve_tony) // reserve_wnova
quote_tony = quote / 10**18
print(f"[INFO] Quote for 1 WNOVA: {quote_tony:.6f} TONY")

expected_raw = os.environ.get("EXPECTED_TONY_PER_WNOVA")
if expected_raw:
    expected = float(expected_raw)
    lower = expected * 0.98
    upper = expected * 1.02
    if not (lower <= quote_tony <= upper):
        print("[ERROR] Quote outside expected range (±2%)")
        sys.exit(2)
    print("[OK] Quote within expected range")
else:
    print("[OK] Quote computed (no expected range configured)")
PY
