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
  echo "Usage: $0 <wallet_address> [pair_address]" >&2
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
PAIR="${2:-}"
if [ -z "$PAIR" ]; then
  PAIR="$(jq -r '.addresses.pair' "$DEPLOYMENTS")"
fi

if ! /opt/novadex/scripts/check_addr.sh "$PAIR" >/dev/null; then
  echo "[ERROR] Invalid pair address: $PAIR" >&2
  exit 1
fi

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

pad_addr() {
  local addr="${1#0x}"
  printf "%064s" "$addr" | tr ' ' '0'
}

echo "[INFO] Wallet: $WALLET"
echo "[INFO] Pair:   $PAIR"

balance_data="0x70a08231$(pad_addr "$WALLET")"

balance_resp="$(rpc_call eth_call "[{\"to\":\"$PAIR\",\"data\":\"$balance_data\"},\"latest\"]")"
balance_raw="$(echo "$balance_resp" | jq -r '.result')"

supply_resp="$(rpc_call eth_call "[{\"to\":\"$PAIR\",\"data\":\"0x18160ddd\"},\"latest\"]")"
supply_raw="$(echo "$supply_resp" | jq -r '.result')"

reserves_resp="$(rpc_call eth_call "[{\"to\":\"$PAIR\",\"data\":\"0x0902f1ac\"},\"latest\"]")"
reserves_raw="$(echo "$reserves_resp" | jq -r '.result')"

token0_resp="$(rpc_call eth_call "[{\"to\":\"$PAIR\",\"data\":\"0x0dfe1681\"},\"latest\"]")"
token1_resp="$(rpc_call eth_call "[{\"to\":\"$PAIR\",\"data\":\"0xd21220a7\"},\"latest\"]")"

token0_raw="$(echo "$token0_resp" | jq -r '.result')"
token1_raw="$(echo "$token1_resp" | jq -r '.result')"

python3 - "$balance_raw" "$supply_raw" "$reserves_raw" "$token0_raw" "$token1_raw" <<'PY'
import sys

balance = int(sys.argv[1], 16) if sys.argv[1].startswith('0x') else 0
supply = int(sys.argv[2], 16) if sys.argv[2].startswith('0x') else 0
reserves = sys.argv[3]

def addr_from_hex(data: str) -> str:
    if not data or not data.startswith('0x'):
        return ''
    return '0x' + data[-40:]

if not reserves.startswith('0x'):
    print('[ERROR] reserves invalid')
    sys.exit(1)

raw = reserves[2:]
reserve0 = int(raw[0:64], 16)
reserve1 = int(raw[64:128], 16)

print(f"[INFO] token0: {addr_from_hex(sys.argv[4])}")
print(f"[INFO] token1: {addr_from_hex(sys.argv[5])}")
print(f"[INFO] LP balance raw: {balance}")
print(f"[INFO] TotalSupply raw: {supply}")
print(f"[INFO] Reserve0 raw: {reserve0}")
print(f"[INFO] Reserve1 raw: {reserve1}")

if balance == 0:
    print('[WARN] LP balance is 0')
    sys.exit(2)

if supply > 0:
    share = balance / supply
    print(f"[INFO] LP share: {share:.6%}")
    amt0 = reserve0 * share
    amt1 = reserve1 * share
    print(f"[INFO] Underlying0: {amt0:.6f}")
    print(f"[INFO] Underlying1: {amt1:.6f}")

print('[OK] ui_positions_smoke completed')
PY
