#!/bin/bash
# 自动检查并刷新即将过期的 cookies
# 使用方法：
#   1. 手动运行: ./auto-refresh-cookies.sh
#   2. cron job: 0 */6 * * * cd /path/to/project && ./scripts/auto-refresh-cookies.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.openclaw"

# 加载配置
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo "❌ 配置文件不存在: $ENV_FILE"
    exit 1
fi

API_BASE="${CLAW_API_BASE:-http://localhost:8002}"
API_KEY="${CLAW_API_KEY}"
WARNING_HOURS="${COOKIE_EXPIRY_WARNING_HOURS:-48}"
LOG_FILE="${LOG_FILE:-/tmp/openclaw-cookie-refresh.log}"

echo "=========================================="
echo "OpenClaw Cookie 自动刷新"
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 检查是否需要刷新
NOW=$(date +%s)
WARNING_THRESHOLD=$((NOW + WARNING_HOURS * 3600))

# 获取所有凭证
ENTRIES=$(curl -s -H "Authorization: Bearer $API_KEY" "$API_BASE/entries" | jq -r '.entries[] | select(.metadata.token_expires_at != null) | "\(.id)|\(.metadata.token_expires_at)"')

NEED_REFRESH=false
CRITICAL_DOMAINS=""

while IFS='|' read -r ENTRY_ID EXPIRES_AT; do
    if [ -z "$EXPIRES_AT" ]; then
        continue
    fi

    # 转换过期时间为时间戳
    EXPIRES_TS=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${EXPIRES_AT%.*}" "+%s" 2>/dev/null || echo "0")

    if [ "$EXPIRES_TS" -lt "$NOW" ]; then
        echo "🔴 已过期: $ENTRY_ID (过期于 $EXPIRES_AT)"
        NEED_REFRESH=true
        CRITICAL_DOMAINS="$CRITICAL_DOMAINS $ENTRY_ID"
    elif [ "$EXPIRES_TS" -lt "$WARNING_THRESHOLD" ]; then
        HOURS_LEFT=$(( (EXPIRES_TS - NOW) / 3600 ))
        echo "⚠️  即将过期: $ENTRY_ID (还剩 ${HOURS_LEFT}h)"
        NEED_REFRESH=true
    else
        HOURS_LEFT=$(( (EXPIRES_TS - NOW) / 3600 ))
        echo "✅ 正常: $ENTRY_ID (还剩 ${HOURS_LEFT}h)"
    fi
done <<< "$ENTRIES"

echo ""

if [ "$NEED_REFRESH" = true ]; then
    echo "🔄 检测到凭证即将过期或已过期，开始刷新..."
    echo ""

    # 检查 Chrome Debug 是否在运行
    if ! curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
        echo "❌ Chrome Debug 未运行（端口 9222）"
        echo ""
        echo "请启动 Chrome Debug："
        echo "  1. 使用 Alfred 搜索 'Chrome Debug'"
        echo "  2. 或运行: open -a 'Google Chrome' --args --remote-debugging-port=9222"
        echo ""
        exit 1
    fi

    echo "✅ Chrome Debug 已运行，开始导出 cookies..."
    echo ""

    # 执行导出
    cd "$SCRIPT_DIR"
    ./export-all-cookies.sh

    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
        echo ""
        echo "✅ Cookie 刷新成功"

        # 如果有关键域名过期，发送通知（可选）
        if [ -n "$CRITICAL_DOMAINS" ]; then
            echo ""
            echo "⚠️  以下域名之前已过期，已刷新:"
            echo "$CRITICAL_DOMAINS" | tr ' ' '\n' | sed 's/^/   - /'
        fi
    else
        echo ""
        echo "❌ Cookie 刷新失败 (exit code: $EXIT_CODE)"
        exit 1
    fi
else
    echo "✅ 所有凭证均正常，无需刷新"
fi

echo ""
echo "=========================================="
echo "完成时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 记录日志
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cookie refresh completed" >> "$LOG_FILE"
