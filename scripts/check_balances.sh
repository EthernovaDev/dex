#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/novadex/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

if [ $# -ne 1 ]; then
  echo "Usage: $0 0xYourWalletAddress" >&2
  exit 1
fi

ADDRESS="$1"
/opt/novadex/scripts/check_addr.sh "$ADDRESS" >/dev/null

RPC_URL="${RPC_URL:-}"
if [ -z "${RPC_URL:-}" ]; then
  echo "[ERROR] Missing RPC_URL in $ENV_FILE" >&2
  exit 1
fi

TMP_OUT="$(mktemp)"
/opt/novadex/scripts/rpc_diag.sh "$RPC_URL" "$ADDRESS" | tee "$TMP_OUT"

extract_hex() {
  local key="$1"
  local value
  value="$(awk -F': ' -v k="$key" '$1 == k {print $2}' "$TMP_OUT" | tail -n1)"
  if [ -z "$value" ] || [ "$value" = "null" ]; then
    echo ""
    return
  fi
  printf '%s' "$value"
}

hex_to_dec() {
  python3 - "$1" <<'PY'
import sys
h = sys.argv[1]
print(int(h, 16))
PY
}

hex_to_human18() {
  python3 - "$1" <<'PY'
import sys
from decimal import Decimal, getcontext
getcontext().prec = 40
h = sys.argv[1]
print(Decimal(int(h, 16)) / Decimal(10**18))
PY
}

nova_hex="$(extract_hex 'balance')"
wnova_hex="$(extract_hex 'wnova.balanceOf')"
tony_hex="$(extract_hex 'tony.balanceOf')"

if [ -n "$nova_hex" ]; then
  echo "NOVA  : $(hex_to_human18 "$nova_hex") (wei: $(hex_to_dec "$nova_hex"))"
fi
if [ -n "$wnova_hex" ]; then
  echo "WNOVA : $(hex_to_human18 "$wnova_hex") (wei: $(hex_to_dec "$wnova_hex"))"
fi
if [ -n "$tony_hex" ]; then
  echo "TONY  : $(hex_to_human18 "$tony_hex") (wei: $(hex_to_dec "$tony_hex"))"
fi

rm -f "$TMP_OUT"
