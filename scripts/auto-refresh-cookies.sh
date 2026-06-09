#!/bin/bash
# 自动将 Cookie Keeper 快照同步到 KeePass 凭证库
# 使用方法：
#   1. 手动运行: ./scripts/sync-cookie-keeper-to-vault.sh
#   2. cron job: */15 * * * * cd /path/to/project && ./scripts/sync-cookie-keeper-to-vault.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.openclaw"
LOG_FILE="${LOG_FILE:-/tmp/openclaw-cookie-refresh.log}"

if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
fi

SNAPSHOT="${COOKIE_KEEPER_PATH:-$HOME/.agents/cookie-keeper/all-cookies.json}"

echo "=========================================="
echo "Cookie Keeper -> KeePass 自动同步"
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

if [ ! -f "$SNAPSHOT" ]; then
    echo "❌ 快照不存在: $SNAPSHOT"
    echo ""
    echo "请确认："
    echo "  1. Cookie Keeper 扩展已安装"
    echo "  2. 同步模式为「自动」且 Host 已连接"
    echo "  3. 已在目标网站登录"
    exit 1
fi

echo "✅ 快照存在: $SNAPSHOT"
echo ""

cd "$SCRIPT_DIR"
./sync-cookie-keeper-to-vault.sh
EXIT_CODE=$?

echo ""
echo "=========================================="
echo "完成时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cookie sync completed (exit=$EXIT_CODE)" >> "$LOG_FILE"
exit $EXIT_CODE
