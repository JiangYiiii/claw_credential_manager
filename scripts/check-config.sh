#!/bin/bash
# OpenClaw 生态系统配置验证脚本
# 在启动服务前运行，确保所有配置正确

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.openclaw"

echo "=========================================="
echo "OpenClaw 配置验证"
echo "=========================================="
echo ""

ERRORS=0
WARNINGS=0

# 1. 检查环境配置文件
echo "📋 检查配置文件..."
if [ -f "$ENV_FILE" ]; then
    echo "✅ 配置文件存在: $ENV_FILE"
    source "$ENV_FILE"
else
    echo "❌ 配置文件不存在: $ENV_FILE"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 2. 检查容器状态
echo "🐳 检查容器状态..."
if podman ps --format "{{.Names}}" | grep -q "claw-credential-manager"; then
    echo "✅ credential-manager 容器运行中"
else
    echo "❌ credential-manager 容器未运行"
    ERRORS=$((ERRORS + 1))
fi

if podman ps --format "{{.Names}}" | grep -q "claw-plugin-manager"; then
    echo "✅ plugin-manager 容器运行中"
else
    echo "❌ plugin-manager 容器未运行"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 3. 检查 credential-manager API
echo "🔐 检查 credential-manager API..."
if curl -s http://localhost:8002/health | grep -q '"status":"ok"'; then
    echo "✅ credential-manager API 正常 (localhost:8002)"
else
    echo "❌ credential-manager API 无法访问"
    ERRORS=$((ERRORS + 1))
fi

# 测试认证
if [ -n "$CLAW_API_KEY" ]; then
    ENTRY_COUNT=$(curl -s -H "Authorization: Bearer $CLAW_API_KEY" http://localhost:8002/entries | jq -r '.count' 2>/dev/null || echo "0")
    echo "✅ API 认证成功，凭证数量: $ENTRY_COUNT"
else
    echo "⚠️  CLAW_API_KEY 未配置"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# 4. 检查 plugin-manager 配置
echo "🔌 检查 plugin-manager 配置..."
PLUGIN_CONFIG="$HOME/openclaw-data/claw-plugin-manager/config.yaml"
if [ -f "$PLUGIN_CONFIG" ]; then
    echo "✅ plugin-manager 配置文件存在"

    # 检查是否配置了 credential-manager 的 API key
    if grep -q "claw-credentials:" "$PLUGIN_CONFIG"; then
        if grep -A 10 "claw-credentials:" "$PLUGIN_CONFIG" | grep -q "Authorization:"; then
            echo "✅ plugin-manager 已配置 credential-manager API key"
        else
            echo "❌ plugin-manager 缺少 credential-manager API key"
            echo "   请在 $PLUGIN_CONFIG 中的 claw-credentials 配置下添加："
            echo "   headers:"
            echo "     Authorization: \"Bearer $CLAW_API_KEY\""
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo "⚠️  plugin-manager 配置中未找到 claw-credentials"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "❌ plugin-manager 配置文件不存在: $PLUGIN_CONFIG"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 5. 检查 plugin-manager API
echo "🌐 检查 plugin-manager API..."
if curl -s http://localhost:8090/health | grep -q '"status":"ok"'; then
    echo "✅ plugin-manager API 正常 (localhost:8090)"
else
    echo "❌ plugin-manager API 无法访问"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 6. 检查凭证过期状态
echo "⏰ 检查凭证过期状态..."
if [ -n "$CLAW_API_KEY" ]; then
    NOW=$(date +%s)
    EXPIRED_COUNT=0
    EXPIRING_SOON_COUNT=0

    ENTRIES=$(curl -s -H "Authorization: Bearer $CLAW_API_KEY" http://localhost:8002/entries | jq -r '.entries[] | select(.metadata.token_expires_at != null) | "\(.id)|\(.metadata.token_expires_at)"' 2>/dev/null || echo "")

    if [ -n "$ENTRIES" ]; then
        while IFS='|' read -r ENTRY_ID EXPIRES_AT; do
            if [ -z "$EXPIRES_AT" ]; then
                continue
            fi

            EXPIRES_TS=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${EXPIRES_AT%.*}" "+%s" 2>/dev/null || echo "0")

            if [ "$EXPIRES_TS" -lt "$NOW" ]; then
                EXPIRED_COUNT=$((EXPIRED_COUNT + 1))
                echo "🔴 已过期: $ENTRY_ID"
            elif [ "$EXPIRES_TS" -lt "$((NOW + 86400))" ]; then
                EXPIRING_SOON_COUNT=$((EXPIRING_SOON_COUNT + 1))
                HOURS_LEFT=$(( (EXPIRES_TS - NOW) / 3600 ))
                echo "⚠️  24小时内过期: $ENTRY_ID (${HOURS_LEFT}h)"
            fi
        done <<< "$ENTRIES"

        if [ "$EXPIRED_COUNT" -gt 0 ]; then
            echo "❌ 有 $EXPIRED_COUNT 个凭证已过期"
            ERRORS=$((ERRORS + 1))
        elif [ "$EXPIRING_SOON_COUNT" -gt 0 ]; then
            echo "⚠️  有 $EXPIRING_SOON_COUNT 个凭证即将在 24 小时内过期"
            WARNINGS=$((WARNINGS + 1))
        else
            echo "✅ 所有凭证状态正常"
        fi
    fi
fi
echo ""

# 7. 检查 Cookie Keeper 快照
echo "🍪 检查 Cookie Keeper 快照..."
SNAPSHOT="${COOKIE_KEEPER_PATH:-$HOME/.agents/cookie-keeper/all-cookies.json}"
if [ -f "$SNAPSHOT" ]; then
    SNAPSHOT_AGE=$(( $(date +%s) - $(stat -f %m "$SNAPSHOT" 2>/dev/null || stat -c %Y "$SNAPSHOT" 2>/dev/null || echo 0) ))
    echo "✅ Cookie Keeper 快照存在: $SNAPSHOT"
    if [ "$SNAPSHOT_AGE" -gt 604800 ]; then
        echo "⚠️  快照超过 7 天未更新，请在浏览器中访问目标站点触发同步"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "⚠️  Cookie Keeper 快照不存在: $SNAPSHOT"
    echo "   请安装 Cookie Keeper 扩展并配置自动同步模式"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# 总结
echo "=========================================="
echo "验证完成"
echo "=========================================="
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ 所有检查通过！"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "⚠️  发现 $WARNINGS 个警告"
    exit 0
else
    echo "❌ 发现 $ERRORS 个错误, $WARNINGS 个警告"
    echo ""
    echo "请修复上述错误后再启动服务"
    exit 1
fi
