#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 0xYourAddress" >&2
  exit 1
fi

ADDRESS="$1"
if [[ "$ADDRESS" == *"TU_WALLET"* ]]; then
  echo "[ERROR] Replace placeholder with a real address." >&2
  exit 1
fi

if ! [[ "$ADDRESS" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
  echo "[ERROR] Invalid address format: $ADDRESS" >&2
  exit 1
fi

printf '%s\n' "$ADDRESS"
