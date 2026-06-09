#!/bin/bash
# Sync Cookie Keeper snapshot into KeePass vault entries.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.openclaw"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

exec node "$SCRIPT_DIR/sync-cookie-keeper-to-vault.js" "$@"
