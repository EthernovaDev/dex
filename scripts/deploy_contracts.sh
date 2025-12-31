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

for var in INITIAL_LP_NOVA INITIAL_LP_TONY; do
  if [ -z "${!var:-}" ]; then
    echo "[WARN] Missing optional var: $var; using defaults in deploy script."
  fi
done

RUN_AS=""
if [ "$(id -un)" != "novadex" ]; then
  RUN_AS="sudo -u novadex"
fi

cd /opt/novadex/contracts

if [ ! -d node_modules ]; then
  echo "[INFO] Installing contract dependencies..."
  $RUN_AS npm install
fi

echo "[INFO] Compiling contracts..."
$RUN_AS npx hardhat compile

echo "[INFO] Deploying contracts to ethernova..."
$RUN_AS npx hardhat run scripts/deploy.ts --network ethernova

echo "[INFO] Deployment finished."
