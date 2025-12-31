#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/novadex/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

BASE_URL="https://${DEX_DOMAIN:-dex.ethnova.net}"
DEPLOYMENTS="/opt/novadex/contracts/deployments.json"
RPC_URL="${RPC_URL:-https://rpc.ethnova.net}"

if [ ! -f "$DEPLOYMENTS" ]; then
  echo "[ERROR] Missing deployments.json at ${DEPLOYMENTS}" >&2
  exit 1
fi

PAIR="$(jq -r '.addresses.pair // empty' "$DEPLOYMENTS")"

if [ -n "$PAIR" ]; then
  if ! /opt/novadex/scripts/check_addr.sh "$PAIR" >/dev/null; then
    echo "[ERROR] Invalid pair address in deployments.json: $PAIR" >&2
    exit 1
  fi
fi

echo "[INFO] Checking /info homepage..."
HTML="$(curl -fsS "${BASE_URL}/info/" )"
if ! echo "$HTML" | grep -q "NovaDEX"; then
  echo "[ERROR] /info HTML missing NovaDEX content" >&2
  exit 1
fi
curl -fsS "${BASE_URL}/info/favicon.ico" >/dev/null
echo "[OK] /info/favicon.ico"
curl -fsS "${BASE_URL}/info/manifest.json" >/dev/null
echo "[OK] /info/manifest.json"
if command -v rg >/dev/null 2>&1; then
  MAIN_PATH="$(echo "$HTML" | rg -o '/info/static/js/main[^" ]+\.js' -m1)"
else
  MAIN_PATH="$(echo "$HTML" | grep -o '/info/static/js/main[^" ]*\.js' | head -n1)"
fi
if [ -z "$MAIN_PATH" ]; then
  echo "[ERROR] Could not find main bundle in /info HTML" >&2
  exit 1
fi
curl -fsS "${BASE_URL}${MAIN_PATH}" >/dev/null

echo "[OK] /info assets OK ($MAIN_PATH)"

QUERY='{"query":"{_meta{block{number}}}"}'
GRAPH_URL="${BASE_URL}/info/subgraphs/name/novadex/novadex"

echo "[INFO] Checking subgraph endpoint..."
RESP="$(curl -sS "$GRAPH_URL" -H 'content-type: application/json' --data "$QUERY" || true)"
IS_HTML=0
if command -v rg >/dev/null 2>&1; then
  echo "$RESP" | rg -qi '<html|<!doctype' && IS_HTML=1 || IS_HTML=0
else
  echo "$RESP" | grep -qiE '<html|<!doctype' && IS_HTML=1 || IS_HTML=0
fi
if [ "$IS_HTML" -eq 0 ] && echo "$RESP" | jq -e '.data._meta.block.number' >/dev/null 2>&1; then
  BLOCK="$(echo "$RESP" | jq -r '.data._meta.block.number')"
  echo "[OK] Subgraph _meta.block.number=$BLOCK"
else
  echo "[WARN] Subgraph unavailable; testing on-chain fallback"
fi

if [ -z "$PAIR" ]; then
  echo "[ERROR] Pair address missing; cannot test on-chain fallback" >&2
  exit 1
fi

RESERVES_DATA="0x0902f1ac"
RPC_RESP="$(curl -sS "$RPC_URL" -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$PAIR\",\"data\":\"$RESERVES_DATA\"},\"latest\"],\"id\":1}" || true)"
if command -v rg >/dev/null 2>&1; then
  if echo "$RPC_RESP" | rg -qi '<html|<!doctype'; then
    echo "[ERROR] RPC returned HTML during reserves call" >&2
    exit 1
  fi
else
  if echo "$RPC_RESP" | grep -qiE '<html|<!doctype'; then
    echo "[ERROR] RPC returned HTML during reserves call" >&2
    exit 1
  fi
fi
if echo "$RPC_RESP" | jq -e '.result' >/dev/null 2>&1; then
  echo "[OK] On-chain reserves call succeeded (fallback usable)"
else
  echo "[ERROR] On-chain fallback failed" >&2
  echo "$RPC_RESP" >&2
  exit 1
fi

echo "[INFO] Checking /info/#/pair route via Playwright..."
PAIR_URL="${BASE_URL}/info/#/pair/${PAIR}"
NODE_PATH="/opt/novadex/scripts/node_modules" PAIR_URL="$PAIR_URL" node <<'NODE' || exit 1
const { chromium } = require('playwright');
const url = process.env.PAIR_URL;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const crashed = await page.locator('text=NovaDEX Analytics crashed').count();
  const chart = await page.locator('#novadex-candle-chart').count();
  const html = await page.content();
  await browser.close();
  if (crashed) throw new Error('NovaDEX Analytics crashed');
  if (!chart) throw new Error('Candle chart container not found');
  if (html.replace(/\s+/g, '').length < 200) throw new Error('Blank analytics page');
  console.log('[OK] /info/#/pair rendered chart');
})().catch((err) => {
  console.error('[ERROR] /info/#/pair render failed', err?.message || err);
  process.exit(1);
});
NODE

if [ -n "$PAIR" ]; then
  echo "[INFO] Checking /info/#/token route via Playwright..."
  WNOVA="$(jq -r '.addresses.wnova // empty' "$DEPLOYMENTS")"
  if [ -n "$WNOVA" ]; then
    TOKEN_URL="${BASE_URL}/info/#/token/${WNOVA}"
    NODE_PATH="/opt/novadex/scripts/node_modules" TOKEN_URL="$TOKEN_URL" node <<'NODE' || exit 1
const { chromium } = require('playwright');
const url = process.env.TOKEN_URL;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const crashed = await page.locator('text=NovaDEX Analytics crashed').count();
  const header = await page.locator('[data-testid="token-header"]').count();
  const html = await page.content();
  await browser.close();
  if (crashed) throw new Error('NovaDEX Analytics crashed on token page');
  if (!header) throw new Error('Token header not found');
  if (/undefined%|NaN%/i.test(html)) throw new Error('Found undefined%/NaN% in token page HTML');
  console.log('[OK] /info/#/token rendered');
})().catch((err) => {
  console.error('[ERROR] /info/#/token render failed', err?.message || err);
  process.exit(1);
});
NODE
  fi
fi

echo "[OK] ui_info_smoke completed"
