#!/usr/bin/env bash
set -euo pipefail

/opt/novadex/dex/scripts/require_clean_worktree.sh

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

DEPLOYMENTS="/opt/novadex/contracts/deployments.json"
if [ ! -f "$DEPLOYMENTS" ]; then
  echo "[ERROR] Missing deployments.json at ${DEPLOYMENTS}" >&2
  exit 1
fi

WNOVA="$(jq -r '.addresses.wnova' "$DEPLOYMENTS")"
FACTORY="$(jq -r '.addresses.factory' "$DEPLOYMENTS")"
ROUTER="$(jq -r '.addresses.router' "$DEPLOYMENTS")"
TONY="$(jq -r '.addresses.tony' "$DEPLOYMENTS")"
MULTICALL="$(jq -r '.addresses.multicall2 // empty' "$DEPLOYMENTS")"
BOOST_REGISTRY="$(jq -r '.addresses.boostRegistry // empty' "$DEPLOYMENTS")"
INIT_CODE_HASH="${INIT_CODE_HASH:-0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f}"
EXPLORER_URL="${EXPLORER_URL:-https://explorer.ethnova.net}"

RUN_AS=""
if [ "$(id -un)" != "novadex" ]; then
  RUN_AS="sudo -u novadex"
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

DEX_UI_REPO="${DEX_UI_REPO:-https://github.com/33357/uniswap-v2-interface.git}"
DEX_INFO_REPO="${DEX_INFO_REPO:-https://github.com/Uniswap/info.git}"
MONO_ROOT="/opt/novadex/dex"
DEX_UI_DIR="${DEX_UI_DIR:-/opt/novadex/dex-ui}"
DEX_INFO_DIR="${DEX_INFO_DIR:-/opt/novadex/dex-info}"

if [ -d "${MONO_ROOT}/dex-ui" ]; then
  DEX_UI_DIR="${MONO_ROOT}/dex-ui"
fi

if [ -d "${MONO_ROOT}/dex-info" ]; then
  DEX_INFO_DIR="${MONO_ROOT}/dex-info"
fi

if [ ! -d "${DEX_UI_DIR}/.git" ] && [ "${DEX_UI_DIR}" != "${MONO_ROOT}/dex-ui" ]; then
  echo "[INFO] Cloning swap UI repo..."
  $RUN_AS git clone "$DEX_UI_REPO" "$DEX_UI_DIR"
fi

if [ ! -d "${DEX_INFO_DIR}/.git" ] && [ "${DEX_INFO_DIR}" != "${MONO_ROOT}/dex-info" ]; then
  echo "[INFO] Cloning analytics UI repo..."
  $RUN_AS git clone "$DEX_INFO_REPO" "$DEX_INFO_DIR"
fi

echo "[INFO] Configuring swap UI env..."
RPC_URLS="${ETHERNOVA_RPC_URLS:-$RPC_URL}"
BUILD_STAMP="$(date -u +%Y-%m-%dT%H:%MZ)"
cat > "${DEX_UI_DIR}/.env.local" <<EOF
REACT_APP_CHAIN_ID=${CHAIN_ID}
REACT_APP_NETWORK_URL=${RPC_URL}
REACT_APP_ETHERNOVA_RPC_URLS=${RPC_URLS}
REACT_APP_EXPLORER_URL=${EXPLORER_URL}
REACT_APP_FACTORY_ADDRESS=${FACTORY}
REACT_APP_ROUTER_ADDRESS=${ROUTER}
REACT_APP_WNOVA_ADDRESS=${WNOVA}
REACT_APP_TONY_ADDRESS=${TONY}
REACT_APP_MULTICALL_ADDRESS=${MULTICALL}
REACT_APP_BUILD_STAMP=${BUILD_STAMP}
EOF

echo "[INFO] Writing runtime config for swap UI..."
node "${DEX_UI_DIR}/scripts/write-config-from-deployments.js"

echo "[INFO] Building swap UI..."
$RUN_AS bash -lc "cd ${DEX_UI_DIR} && corepack enable && yarn install"

echo "[INFO] Patching Uniswap V2 SDK constants..."
SDK_DEV="${DEX_UI_DIR}/node_modules/@im33357/uniswap-v2-sdk/dist/uniswap-v2-sdk.cjs.development.js"
SDK_PROD="${DEX_UI_DIR}/node_modules/@im33357/uniswap-v2-sdk/dist/uniswap-v2-sdk.cjs.production.min.js"
for sdk_file in "$SDK_DEV" "$SDK_PROD"; do
  if [ -f "$sdk_file" ]; then
    python3 - <<PY "$sdk_file" "$FACTORY" "$INIT_CODE_HASH"
import re
import sys

path, factory, init_hash = sys.argv[1:4]
data = open(path, "r", encoding="utf-8").read()
data2 = re.sub(r"FACTORY_ADDRESS = '[^']+';", f"FACTORY_ADDRESS = '{factory}';", data)
data2 = re.sub(r"INIT_CODE_HASH = '[^']+';", f"INIT_CODE_HASH = '{init_hash}';", data2)
data2 = re.sub(r"w='0x[a-fA-F0-9]{40}'", f"w='{factory}'", data2)
data2 = re.sub(r'T=\"0x[a-fA-F0-9]{64}\"', f'T=\"{init_hash}\"', data2)
if data2 == data:
    print(f"[INFO] SDK already patched: {path}")
else:
    open(path, "w", encoding="utf-8").write(data2)
    print(f"[INFO] Patched {path}")
PY
  else
    echo "[WARN] Missing SDK file: $sdk_file"
  fi
done

echo "[INFO] Building swap UI..."
$RUN_AS bash -lc "cd ${DEX_UI_DIR} && rm -rf build && NODE_OPTIONS=--openssl-legacy-provider SKIP_PREFLIGHT_CHECK=true yarn build"

echo "[INFO] Configuring analytics UI env..."
cat > "${DEX_INFO_DIR}/.env.local" <<EOF
REACT_APP_SUBGRAPH_URL=https://${DEX_DOMAIN}/info/subgraphs/name/novadex/novadex
REACT_APP_BLOCKS_URL=https://${DEX_DOMAIN}/info/subgraphs/name/novadex/blocks
REACT_APP_EXPLORER_URL=${EXPLORER_URL}
REACT_APP_DEX_URL=https://${DEX_DOMAIN}
REACT_APP_RPC_URL=${RPC_URL}
REACT_APP_WNOVA_ADDRESS=${WNOVA}
REACT_APP_TONY_ADDRESS=${TONY}
REACT_APP_FACTORY_ADDRESS=${FACTORY}
REACT_APP_PAIR_ADDRESS=$(jq -r '.addresses.pair // empty' "$DEPLOYMENTS")
REACT_APP_BOOST_REGISTRY_ADDRESS=${BOOST_REGISTRY}
REACT_APP_BUILD_STAMP=${BUILD_STAMP}
PUBLIC_URL=/info
EOF

echo "[INFO] Building analytics UI..."
$RUN_AS bash -lc "cd ${DEX_INFO_DIR} && corepack enable && yarn install && rm -rf build && NODE_OPTIONS=--openssl-legacy-provider SKIP_PREFLIGHT_CHECK=true yarn build"

echo "[INFO] Creating release snapshot..."
RELEASES_DIR="/opt/novadex/releases"
TS="$(date -u +%Y%m%d%H%M%S)"
mkdir -p "${RELEASES_DIR}/${TS}/dex-ui" "${RELEASES_DIR}/${TS}/dex-info" /opt/novadex/current
cp -a "${DEX_UI_DIR}/build" "${RELEASES_DIR}/${TS}/dex-ui/"
cp -a "${DEX_INFO_DIR}/build" "${RELEASES_DIR}/${TS}/dex-info/"
ln -sfn "${RELEASES_DIR}/${TS}/dex-ui" /opt/novadex/current/dex-ui
ln -sfn "${RELEASES_DIR}/${TS}/dex-info" /opt/novadex/current/dex-info

if $SUDO systemctl is-active --quiet caddy; then
  $SUDO systemctl reload caddy || $SUDO systemctl restart caddy
fi

echo "[INFO] Frontend builds complete (release ${TS})."
