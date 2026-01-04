#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/opt/novadex/dex"
TARGET_LABEL="phase2"
TARGET_REF="feature/pumpfun-metadata-clean"
LOCK_FILE="/opt/novadex/current/DEPLOY_TARGET"
FORCE="${FORCE:-0}"

if [ -f "$LOCK_FILE" ]; then
  CURRENT="$(tr -d ' \n' < "$LOCK_FILE")"
  if [ "$CURRENT" != "$TARGET_LABEL" ] && [ "$FORCE" != "1" ]; then
    echo "[ERROR] Deploy target lock is '${CURRENT}'. Use FORCE=1 to override." >&2
    exit 1
  fi
fi

echo "[INFO] Deploying phase2 (${TARGET_REF})"
cd "$REPO_ROOT"

git fetch origin --prune

git switch -f "$TARGET_REF"
if git show-ref --verify --quiet "refs/remotes/origin/${TARGET_REF}"; then
  git reset --hard "origin/${TARGET_REF}"
else
  git reset --hard "${TARGET_REF}"
fi

git clean -fd

if [ -n "$(git status --porcelain)" ]; then
  echo "[ERROR] Worktree is not clean after checkout." >&2
  git status -sb >&2
  exit 1
fi

BUILD_COMMIT="$(git rev-parse --short HEAD)"
BUILD_AT="$(date -u +"%Y-%m-%dT%H:%MZ")"

echo "[INFO] Build commit: ${BUILD_COMMIT}"

echo "[INFO] Running build_frontends.sh"
/opt/novadex/dex/scripts/build_frontends.sh

printf '{"commit":"%s","builtAt":"%s"}\n' "$BUILD_COMMIT" "$BUILD_AT" > /opt/novadex/current/dex-ui/build/__version.json
printf '{"commit":"%s","builtAt":"%s"}\n' "$BUILD_COMMIT" "$BUILD_AT" > /opt/novadex/current/dex-info/build/__version.json

echo "$TARGET_LABEL" > "$LOCK_FILE"

systemctl reload caddy || systemctl restart caddy

/opt/novadex/dex/scripts/smoke_version_consistency.sh

echo "[OK] DEPLOY OK"
echo "  target: ${TARGET_LABEL}"
echo "  commit: ${BUILD_COMMIT}"
echo "  builtAt: ${BUILD_AT}"
echo "  ui: /opt/novadex/current/dex-ui/build"
echo "  info: /opt/novadex/current/dex-info/build"
