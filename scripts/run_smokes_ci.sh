#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/opt/novadex/dex"
OUT_DIR="/opt/novadex/scripts/out"
mkdir -p "$OUT_DIR"

echo "[INFO] Running smoke_rpc_health..."
RPC_STATUS=0
node "$ROOT_DIR/scripts/smoke_rpc_health.mjs" || RPC_STATUS=$?

if [ "$RPC_STATUS" -eq 2 ]; then
  echo "[WARN] RPC flaky detected (RPC_UNSTABLE). Running ui_click_smoke with tolerance."
  SMOKE_RPC_SOFT_MAX="${SMOKE_RPC_SOFT_MAX:-10}" \
  SMOKE_RPC_CONSEC_MAX="${SMOKE_RPC_CONSEC_MAX:-5}" \
  node "$ROOT_DIR/scripts/ui_click_smoke.mjs" || {
    echo "[ERROR] ui_click_smoke failed under RPC flaky mode."
    exit 1
  }
  echo "[OK] PASS_WITH_RPC_FLAKE"
  exit 0
fi

if [ "$RPC_STATUS" -ne 0 ]; then
  echo "[ERROR] smoke_rpc_health failed with code $RPC_STATUS"
  exit "$RPC_STATUS"
fi

echo "[INFO] RPC healthy. Running ui_click_smoke strict."
node "$ROOT_DIR/scripts/ui_click_smoke.mjs"
echo "[OK] PASS"
