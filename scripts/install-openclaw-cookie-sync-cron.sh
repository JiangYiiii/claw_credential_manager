#!/bin/bash
# 在 OpenClaw 中注册 Cookie Keeper -> KeePass 定时同步任务（默认每 10 分钟）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SYNC_SCRIPT="$SCRIPT_DIR/sync-cookie-keeper-to-vault.sh"
JOB_NAME="${OPENCLAW_CRON_JOB_NAME:-cookie-keeper-sync}"
INTERVAL="${OPENCLAW_CRON_INTERVAL:-10m}"

if ! command -v openclaw >/dev/null 2>&1; then
  echo "error: openclaw CLI not found" >&2
  exit 1
fi

if [[ ! -x "$SYNC_SCRIPT" ]]; then
  echo "error: sync script not executable: $SYNC_SCRIPT" >&2
  exit 1
fi

EXISTING_ID="$(openclaw cron list 2>/dev/null | awk -v name="$JOB_NAME" '$0 ~ name { print $1; exit }' || true)"
if [[ -n "$EXISTING_ID" ]]; then
  echo "job already exists: $JOB_NAME ($EXISTING_ID)"
  echo "to recreate: openclaw cron rm $EXISTING_ID && $0"
  exit 0
fi

openclaw cron add \
  --name "$JOB_NAME" \
  --description "每${INTERVAL}将 Cookie Keeper 快照同步到 KeePass 凭证库" \
  --every "$INTERVAL" \
  --session isolated \
  --tools exec \
  --light-context \
  --thinking off \
  --timeout-seconds 90 \
  --wake now \
  --no-deliver \
  --message "只用 exec 一次运行: $SYNC_SCRIPT 不要 read/write。成功只回 OK，失败只回一行错误信息。"

echo ""
echo "installed OpenClaw cron job: $JOB_NAME (every $INTERVAL)"
echo "verify: openclaw cron list | grep $JOB_NAME"
