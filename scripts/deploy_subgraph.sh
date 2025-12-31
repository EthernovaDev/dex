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

DEPLOYMENTS="/opt/novadex/contracts/deployments.json"
if [ ! -f "$DEPLOYMENTS" ]; then
  echo "[ERROR] Missing deployments.json at ${DEPLOYMENTS}" >&2
  exit 1
fi

FACTORY_ADDRESS="$(jq -r '.addresses.factory' "$DEPLOYMENTS")"
START_BLOCK="$(jq -r '.startBlock' "$DEPLOYMENTS")"
WNOVA_ADDRESS="$(jq -r '.addresses.wnova' "$DEPLOYMENTS")"
TONY_ADDRESS="$(jq -r '.addresses.tony' "$DEPLOYMENTS")"
PAIR_ADDRESS="$(jq -r '.addresses.pair' "$DEPLOYMENTS")"
if [ -z "$FACTORY_ADDRESS" ] || [ "$FACTORY_ADDRESS" = "null" ]; then
  echo "[ERROR] Missing factory address in deployments.json" >&2
  exit 1
fi
if [ -z "$START_BLOCK" ] || [ "$START_BLOCK" = "null" ]; then
  echo "[ERROR] Missing startBlock in deployments.json" >&2
  exit 1
fi
if [ -z "$WNOVA_ADDRESS" ] || [ "$WNOVA_ADDRESS" = "null" ]; then
  echo "[ERROR] Missing wnova address in deployments.json" >&2
  exit 1
fi
if [ -z "$TONY_ADDRESS" ] || [ "$TONY_ADDRESS" = "null" ]; then
  echo "[ERROR] Missing tony address in deployments.json" >&2
  exit 1
fi
if [ -z "$PAIR_ADDRESS" ] || [ "$PAIR_ADDRESS" = "null" ]; then
  echo "[ERROR] Missing pair address in deployments.json" >&2
  exit 1
fi

FACTORY_ADDRESS_LC="$(echo "$FACTORY_ADDRESS" | tr '[:upper:]' '[:lower:]')"
WNOVA_ADDRESS_LC="$(echo "$WNOVA_ADDRESS" | tr '[:upper:]' '[:lower:]')"
TONY_ADDRESS_LC="$(echo "$TONY_ADDRESS" | tr '[:upper:]' '[:lower:]')"
PAIR_ADDRESS_LC="$(echo "$PAIR_ADDRESS" | tr '[:upper:]' '[:lower:]')"

if [ ! -d /opt/novadex/subgraph/.git ]; then
  echo "[INFO] Cloning Uniswap v2-subgraph..."
  $RUN_AS git clone https://github.com/Uniswap/v2-subgraph.git /opt/novadex/subgraph
fi

cd /opt/novadex/subgraph

echo "[INFO] Installing subgraph dependencies..."
$RUN_AS corepack enable >/dev/null 2>&1 || true
$RUN_AS yarn install

CONFIG_DIR="/opt/novadex/subgraph/config/ethernova"
mkdir -p "$CONFIG_DIR"

echo "[INFO] Writing ethernova config files..."
cat > "${CONFIG_DIR}/config.json" <<EOF
{
  "network": "ethernova",
  "factory": "${FACTORY_ADDRESS}",
  "startblock": "${START_BLOCK}"
}
EOF

cat > "${CONFIG_DIR}/chain.ts" <<EOF
import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts/index'

export const FACTORY_ADDRESS = '${FACTORY_ADDRESS_LC}'

export const REFERENCE_TOKEN = '${WNOVA_ADDRESS_LC}' // WNOVA
export const STABLE_TOKEN_PAIRS = ['${PAIR_ADDRESS_LC}']

export const WHITELIST: string[] = [
  '${WNOVA_ADDRESS_LC}',
  '${TONY_ADDRESS_LC}',
]

export const STABLECOINS: string[] = []

export const MINIMUM_USD_THRESHOLD_NEW_PAIRS = BigDecimal.fromString('1')
export const MINIMUM_LIQUIDITY_THRESHOLD_ETH = BigDecimal.fromString('1')

export class TokenDefinition {
  address: Address
  symbol: string
  name: string
  decimals: BigInt
}

export const STATIC_TOKEN_DEFINITIONS: TokenDefinition[] = []
export const SKIP_TOTAL_SUPPLY: string[] = []
EOF

cat > "${CONFIG_DIR}/.subgraph-env" <<EOF
V2_SUBGRAPH_NAME="novadex/novadex"
V2_SUBGRAPH_VERSION="v0.0.1"
EOF

echo "[INFO] Building subgraph manifest..."
$RUN_AS yarn build --network ethernova --subgraph-type v2

echo "[INFO] Creating and deploying subgraph to local graph-node..."
create_attempt=1
while true; do
  set +e
  create_output="$($RUN_AS npx graph create --node http://127.0.0.1:8020 novadex/novadex 2>&1)"
  create_status=$?
  set -e
  if [ "${create_status}" -eq 0 ] || echo "${create_output}" | grep -qi "already exists"; then
    break
  fi
  if [ "${create_attempt}" -ge 5 ]; then
    echo "[ERROR] graph create failed after ${create_attempt} attempts:" >&2
    echo "${create_output}" >&2
    exit 1
  fi
  echo "[WARN] graph create failed (attempt ${create_attempt}/5). Retrying in 5s..." >&2
  sleep 5
  create_attempt=$((create_attempt + 1))
done

deploy_attempt=1
while true; do
  set +e
  deploy_output="$($RUN_AS npx graph deploy --node http://127.0.0.1:8020 --ipfs http://127.0.0.1:5001 --version-label v0.0.1 novadex/novadex v2-subgraph.yaml 2>&1)"
  deploy_status=$?
  set -e
  if [ "${deploy_status}" -eq 0 ]; then
    echo "${deploy_output}"
    break
  fi
  if [ "${deploy_attempt}" -ge 5 ]; then
    echo "[ERROR] graph deploy failed after ${deploy_attempt} attempts:" >&2
    echo "${deploy_output}" >&2
    exit 1
  fi
  echo "[WARN] graph deploy failed (attempt ${deploy_attempt}/5). Retrying in 5s..." >&2
  sleep 5
  deploy_attempt=$((deploy_attempt + 1))
done

echo "[INFO] Subgraph deploy complete."
