#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "${ALLOW_DIRTY:-0}" = "1" ]; then
  exit 0
fi

cd "$REPO_ROOT"

dirty=0

if ! git diff --quiet; then
  dirty=1
fi

if ! git diff --cached --quiet; then
  dirty=1
fi

if git ls-files --others --exclude-standard | grep -q .; then
  dirty=1
fi

if [ "$dirty" -ne 0 ]; then
  if [ "${CI:-0}" = "1" ]; then
    echo "[ERROR] Worktree is dirty. Commit or stash changes before running build." >&2
    git status -sb >&2
    exit 1
  fi
  echo "[WARN] Worktree is dirty. Proceeding because CI=0. Set ALLOW_DIRTY=1 to silence." >&2
  git status -sb >&2
fi
