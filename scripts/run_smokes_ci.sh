#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/opt/novadex/dex"
OUT_DIR="/opt/novadex/scripts/out"
mkdir -p "$OUT_DIR"

echo "[INFO] Running metadata smokes..."
METADATA_BASE_URL_LOCAL="${METADATA_BASE_URL:-http://127.0.0.1:7400}"
METADATA_BASE_URL="$METADATA_BASE_URL_LOCAL" node "$ROOT_DIR/scripts/smoke_ipfs_storage_cap.mjs"
METADATA_BASE_URL="$METADATA_BASE_URL_LOCAL" node "$ROOT_DIR/scripts/smoke_metadata_limits.mjs"
METADATA_BASE_URL="$METADATA_BASE_URL_LOCAL" node "$ROOT_DIR/scripts/smoke_metadata_api.mjs"
METADATA_BASE_URL="$METADATA_BASE_URL_LOCAL" node "$ROOT_DIR/scripts/smoke_metadata_upload_image.mjs"
METADATA_BASE_URL="$METADATA_BASE_URL_LOCAL" node "$ROOT_DIR/scripts/smoke_quota_wallet.mjs"

if [ "${SMOKE_SWAP_QUOTE:-0}" = "1" ]; then
  echo "[INFO] Running smoke_swap_quote..."
  node "$ROOT_DIR/scripts/smoke_swap_quote.mjs"
fi

if [ "${SMOKE_SWAP_SIM:-0}" = "1" ]; then
  echo "[INFO] Running smoke_swap_simulate..."
  node "$ROOT_DIR/scripts/smoke_swap_simulate.mjs"
fi

if [ "${SMOKE_BOOST_E2E:-0}" = "1" ]; then
  echo "[INFO] Running smoke_boost_e2e..."
  node "$ROOT_DIR/scripts/smoke_boost_e2e.mjs"
fi

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
set +e
node "$ROOT_DIR/scripts/ui_click_smoke.mjs"
STRICT_STATUS=$?
set -e

if [ "$STRICT_STATUS" -eq 0 ]; then
  echo "[OK] PASS"
  exit 0
fi

LATEST_LOG="$(ls -t /opt/novadex/scripts/out/ui_click_smoke-*.log 2>/dev/null | head -n 1 || true)"
if [ -n "$LATEST_LOG" ]; then
  RPC_SOFT=$(python3 - <<PY 2>/dev/null
import json,sys
try:
  data=json.load(open("$LATEST_LOG"))
  soft=int(data.get("rpcSoft503",0) or data.get("summary",{}).get("rpcSoft503",0) or 0)
  if soft == 0:
    page_errors=data.get("pageErrors",[]) or data.get("summary",{}).get("pageErrors",[])
    if isinstance(page_errors,list) and any("503" in str(e) for e in page_errors):
      soft=1
  print(soft)
except Exception:
  print(0)
PY
)
  if [ "$RPC_SOFT" -gt 0 ]; then
    echo "[WARN] ui_click_smoke failed but rpcSoft503=${RPC_SOFT}. Rerunning with tolerance."
    SMOKE_RPC_SOFT_MAX="${SMOKE_RPC_SOFT_MAX:-10}" \
    SMOKE_RPC_CONSEC_MAX="${SMOKE_RPC_CONSEC_MAX:-5}" \
    node "$ROOT_DIR/scripts/ui_click_smoke.mjs" || {
      echo "[ERROR] ui_click_smoke failed under RPC flaky mode."
      exit 1
    }
    echo "[OK] PASS_WITH_RPC_FLAKE"
    exit 0
  fi
fi

echo "[ERROR] ui_click_smoke strict failed without RPC soft errors."
exit "$STRICT_STATUS"
