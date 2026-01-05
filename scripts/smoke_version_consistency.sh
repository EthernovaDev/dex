#!/usr/bin/env bash
set -euo pipefail

UI_LOCAL="/opt/novadex/current/dex-ui/build/__version.json"
INFO_LOCAL="/opt/novadex/current/dex-info/build/__version.json"

if [ ! -f "$UI_LOCAL" ] || [ ! -f "$INFO_LOCAL" ]; then
  echo "[ERROR] Missing local __version.json files" >&2
  exit 1
fi

UI_COMMIT="$(jq -r '.commit' "$UI_LOCAL")"
INFO_COMMIT="$(jq -r '.commit' "$INFO_LOCAL")"

if [ -z "$UI_COMMIT" ] || [ -z "$INFO_COMMIT" ]; then
  echo "[ERROR] Invalid local version stamps" >&2
  exit 1
fi

if [ "$UI_COMMIT" != "$INFO_COMMIT" ]; then
  echo "[ERROR] UI/Info commit mismatch: $UI_COMMIT vs $INFO_COMMIT" >&2
  exit 1
fi

LIVE_JSON="$(curl -fsS https://dex.ethnova.net/__version.json)"
LIVE_COMMIT="$(echo "$LIVE_JSON" | jq -r '.commit')"
if [ -z "$LIVE_COMMIT" ] || [ "$LIVE_COMMIT" = "null" ]; then
  echo "[ERROR] Live __version.json invalid" >&2
  exit 1
fi

LIVE_INFO_JSON="$(curl -fsS https://dex.ethnova.net/info/__version.json)"
LIVE_INFO_COMMIT="$(echo "$LIVE_INFO_JSON" | jq -r '.commit')"
if [ -z "$LIVE_INFO_COMMIT" ] || [ "$LIVE_INFO_COMMIT" = "null" ]; then
  echo "[ERROR] Live /info/__version.json invalid" >&2
  exit 1
fi

if [ "$LIVE_COMMIT" != "$UI_COMMIT" ]; then
  echo "[ERROR] Live UI commit mismatch: $LIVE_COMMIT vs $UI_COMMIT" >&2
  exit 1
fi

if [ "$LIVE_INFO_COMMIT" != "$INFO_COMMIT" ]; then
  echo "[ERROR] Live Info commit mismatch: $LIVE_INFO_COMMIT vs $INFO_COMMIT" >&2
  exit 1
fi

echo "[OK] Version consistency: $UI_COMMIT"
