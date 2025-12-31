#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/novadex/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <wallet_address>" >&2
  exit 1
fi

WALLET="$1"
if ! /opt/novadex/scripts/check_addr.sh "$WALLET" >/dev/null; then
  echo "[ERROR] Invalid wallet address: $WALLET" >&2
  exit 1
fi

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

echo "[INFO] Wallet:  $WALLET"
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

balance_data="0x70a08231$(pad_addr "$WALLET")"
balance_resp="$(rpc_call "eth_call" "[{\"to\":\"$pair_addr\",\"data\":\"$balance_data\"},\"latest\"]")"
balance_raw="$(echo "$balance_resp" | jq -r '.result')"

total_supply_data="0x18160ddd"
total_supply_resp="$(rpc_call "eth_call" "[{\"to\":\"$pair_addr\",\"data\":\"$total_supply_data\"},\"latest\"]")"
total_supply_raw="$(echo "$total_supply_resp" | jq -r '.result')"

token0_data="0x0dfe1681"
token1_data="0xd21220a7"
reserves_data="0x0902f1ac"

token0_raw="$(rpc_call "eth_call" "[{\"to\":\"$pair_addr\",\"data\":\"$token0_data\"},\"latest\"]" | jq -r '.result')"
token1_raw="$(rpc_call "eth_call" "[{\"to\":\"$pair_addr\",\"data\":\"$token1_data\"},\"latest\"]" | jq -r '.result')"
reserves_raw="$(rpc_call "eth_call" "[{\"to\":\"$pair_addr\",\"data\":\"$reserves_data\"},\"latest\"]" | jq -r '.result')"

python3 - "$balance_raw" "$total_supply_raw" "$token0_raw" "$token1_raw" "$reserves_raw" <<'PY'
import sys

def addr_from_hex(data: str) -> str:
    if not data or not data.startswith('0x'):
        return ''
    return '0x' + data[-40:]

balance_raw, total_raw, token0_raw, token1_raw, reserves_raw = sys.argv[1:6]
balance = int(balance_raw, 16) if balance_raw and balance_raw.startswith('0x') else 0
total_supply = int(total_raw, 16) if total_raw and total_raw.startswith('0x') else 0
token0 = addr_from_hex(token0_raw)
token1 = addr_from_hex(token1_raw)

if not reserves_raw or not reserves_raw.startswith('0x') or len(reserves_raw) < 130:
    print("[ERROR] Invalid reserves response")
    sys.exit(1)

reserve0 = int(reserves_raw[2:66], 16)
reserve1 = int(reserves_raw[66:130], 16)

print(f"[INFO] token0: {token0}")
print(f"[INFO] token1: {token1}")
print(f"[INFO] reserve0: {reserve0}")
print(f"[INFO] reserve1: {reserve1}")
print(f"[INFO] LP balance raw: {balance}")
print(f"[INFO] totalSupply raw: {total_supply}")
if balance == 0:
    print("[WARN] LP balance is zero")
else:
    print("[OK] LP balance > 0")
PY

echo "[OK] ui_import_pool_smoke completed"

echo "[INFO] Running UI import pool smoke..."
node /opt/novadex/scripts/ui_import_pool_smoke.mjs
