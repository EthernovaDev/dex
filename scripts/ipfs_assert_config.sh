#!/usr/bin/env bash
set -euo pipefail

ENV_LINE=$(systemctl show ipfs -p Environment | sed 's/^Environment=//')
IPFS_PATH=$(printf '%s' "$ENV_LINE" | sed -n 's/.*IPFS_PATH=\([^ ]*\).*/\1/p')
if [ -z "$IPFS_PATH" ]; then
  echo "[ERROR] IPFS_PATH not found in systemd env" >&2
  exit 1
fi

STORAGE_MAX=$(IPFS_PATH="$IPFS_PATH" ipfs config Datastore.StorageMax || true)
GC_WATERMARK=$(IPFS_PATH="$IPFS_PATH" ipfs config Datastore.StorageGCWatermark --json || true)
GC_PERIOD=$(IPFS_PATH="$IPFS_PATH" ipfs config Datastore.GCPeriod || true)

printf "[INFO] IPFS_PATH=%s\n" "$IPFS_PATH"
printf "[INFO] StorageMax=%s\n" "$STORAGE_MAX"
printf "[INFO] StorageGCWatermark=%s\n" "$GC_WATERMARK"
printf "[INFO] GCPeriod=%s\n" "$GC_PERIOD"

if [ "$STORAGE_MAX" != "200GB" ]; then
  echo "[ERROR] StorageMax is not 200GB" >&2
  exit 1
fi

if [ "$GC_WATERMARK" != "90" ]; then
  echo "[ERROR] StorageGCWatermark is not 90" >&2
  exit 1
fi

exit 0
