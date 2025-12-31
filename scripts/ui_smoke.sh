#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://dex.ethnova.net}"

echo "[INFO] Checking UI endpoints at ${BASE_URL}"

curl -fsS "${BASE_URL}/" | head -c 200 >/dev/null
echo "[OK] /"

curl -fsS "${BASE_URL}/favicon.png" >/dev/null
echo "[OK] /favicon.png"

curl -fsS "${BASE_URL}/manifest.json" >/dev/null
echo "[OK] /manifest.json"

curl -fsS "${BASE_URL}/images/192x192_App_Icon.png" >/dev/null
echo "[OK] /images/192x192_App_Icon.png"

curl -fsS "${BASE_URL}/images/512x512_App_Icon.png" >/dev/null
echo "[OK] /images/512x512_App_Icon.png"

curl -fsS "${BASE_URL}/tokenlists/ethernova.tokenlist.json" | head -c 200 >/dev/null
echo "[OK] /tokenlists/ethernova.tokenlist.json"

curl -fsS "${BASE_URL}/info/" | head -c 200 >/dev/null
echo "[OK] /info/"

extract_assets() {
  local html="$1"
  if command -v rg >/dev/null 2>&1; then
    echo "$html" | rg -o "/static/js/[^\"']+\\.js" -g'*' || true
  else
    echo "$html" | grep -oE "/static/js/[^\"']+\\.js" || true
  fi
}

echo "[INFO] Checking swap assets..."
SWAP_HTML="$(curl -fsS "${BASE_URL}/")"
SWAP_ASSETS="$(extract_assets "$SWAP_HTML" | sort -u)"
if [ -z "$SWAP_ASSETS" ]; then
  echo "[WARN] No swap assets found in HTML"
else
  while IFS= read -r asset; do
    [ -z "$asset" ] && continue
    curl -fsS "${BASE_URL}${asset}" >/dev/null
    echo "[OK] ${asset}"
  done <<< "$SWAP_ASSETS"
fi

echo "[INFO] Checking analytics assets..."
INFO_HTML="$(curl -fsS "${BASE_URL}/info/")"
if command -v rg >/dev/null 2>&1; then
  INFO_ASSETS="$(echo "$INFO_HTML" | rg -o "/info/static/js/[^\"']+\\.js" -g'*' | sort -u)"
else
  INFO_ASSETS="$(echo "$INFO_HTML" | grep -oE "/info/static/js/[^\"']+\\.js" | sort -u)"
fi
if [ -z "$INFO_ASSETS" ]; then
  echo "[WARN] No info assets found in HTML"
else
  while IFS= read -r asset; do
    [ -z "$asset" ] && continue
    curl -fsS "${BASE_URL}${asset}" >/dev/null
    echo "[OK] ${asset}"
  done <<< "$INFO_ASSETS"
fi

if command -v rg >/dev/null 2>&1; then
  if curl -fsS "${BASE_URL}/" | rg -q "NOVA"; then
    echo "[OK] NOVA keyword found in HTML"
  else
    echo "[WARN] NOVA keyword not found in HTML"
  fi
else
  if curl -fsS "${BASE_URL}/" | grep -q "NOVA"; then
    echo "[OK] NOVA keyword found in HTML"
  else
    echo "[WARN] NOVA keyword not found in HTML"
  fi
fi
