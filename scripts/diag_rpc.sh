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

RUN_AS=""
if [ "$(id -un)" != "novadex" ]; then
  RUN_AS="sudo -u novadex"
fi

echo "[INFO] Checking DNS for ${DEX_DOMAIN}..."
dns_ip="$(dig +short "${DEX_DOMAIN}" | head -n1 || true)"
dns_expected="154.53.47.195"
dns_status="OK"
if [ -z "$dns_ip" ] || [ "$dns_ip" != "$dns_expected" ]; then
  dns_status="FAIL"
fi
echo "[INFO] DNS ${DEX_DOMAIN} -> ${dns_ip:-<empty>} (expected ${dns_expected})"

echo "[INFO] Checking RPC chainId..."
chain_hex="$(curl -sS "${RPC_URL}" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | jq -r '.result')"
chain_dec="$(python3 - <<PY
h="${chain_hex}"
print(int(h,16) if h.startswith("0x") else h)
PY
)"

echo "[INFO] Fetching latest block number and gasLimit..."
block_hex="$(curl -sS "${RPC_URL}" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | jq -r '.result')"
block_dec="$(python3 - <<PY
h="${block_hex}"
print(int(h,16) if h.startswith("0x") else h)
PY
)"

gas_hex="$(curl -sS "${RPC_URL}" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":["latest",false],"id":1}' | jq -r '.result.gasLimit')"
gas_dec="$(python3 - <<PY
h="${gas_hex}"
print(int(h,16) if h.startswith("0x") else h)
PY
)"

echo "[INFO] Running STATICCALL probe via Hardhat..."
$RUN_AS bash -lc "cd /opt/novadex/contracts && npm install" >/dev/null

set +e
diag_status=1
diag_output=""
for attempt in 1 2 3; do
  diag_output="$($RUN_AS bash -lc 'cd /opt/novadex/contracts && npx hardhat run scripts/rpc_diag.ts --network ethernova' 2>&1)"
  diag_status=$?
  if [ "${diag_status}" -eq 0 ]; then
    break
  fi
  echo "[WARN] RPC diag failed (attempt ${attempt}/3). Retrying in 5s..." >&2
  sleep 5
done
set -e

echo "${diag_output}" | tee /tmp/novadex_rpc_diag.log
static_ok="$(echo "${diag_output}" | awk -F= '/^STATICCALL_OK=/{print $2}' | tail -n1)"
static_err="$(echo "${diag_output}" | awk -F= '/^STATICCALL_ERROR=/{print $2}' | tail -n1)"

cat > /opt/novadex/DEBUG_NOTES.md <<EOF
# DEBUG_NOTES.md
timestamp: $(date -u --iso-8601=seconds)
dns_status: ${dns_status}
dns_result: ${DEX_DOMAIN} -> ${dns_ip:-<empty>} (expected ${dns_expected})
rpc_chainId_hex: ${chain_hex}
rpc_chainId_dec: ${chain_dec}
rpc_blockNumber_hex: ${block_hex}
rpc_blockNumber_dec: ${block_dec}
rpc_gasLimit_hex: ${gas_hex}
rpc_gasLimit_dec: ${gas_dec}
staticcall_ok: ${static_ok:-unknown}
staticcall_error: ${static_err:-none}
rpc_diag_log: /tmp/novadex_rpc_diag.log
EOF

if [ "${dns_status}" != "OK" ]; then
  echo "[ERROR] DNS does not resolve to expected IP. See /opt/novadex/DEBUG_NOTES.md" >&2
  exit 1
fi

if [ "${chain_dec}" != "${CHAIN_ID}" ]; then
  echo "[ERROR] RPC chainId mismatch. See /opt/novadex/DEBUG_NOTES.md" >&2
  exit 1
fi

if [ "${diag_status}" -ne 0 ] || [ "${static_ok}" != "1" ]; then
  echo "[ERROR] STATICCALL probe failed. See /opt/novadex/DEBUG_NOTES.md" >&2
  exit 1
fi

echo "[INFO] RPC diagnostics passed."
