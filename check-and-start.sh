#!/bin/bash
# OpenClaw 统一启动脚本 - 在启动前进行配置验证

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=========================================="
echo "OpenClaw 启动检查"
echo "=========================================="
echo ""

# 1. 运行配置检查
echo "🔍 运行配置验证..."
"$SCRIPT_DIR/scripts/check-config.sh"

CHECK_EXIT_CODE=$?

if [ $CHECK_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "❌ 配置验证失败，请修复后再启动"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ 所有检查通过，服务正常运行中"
echo "=========================================="
echo ""
echo "服务地址："
echo "  - Credential Manager API: http://localhost:8002"
echo "  - Credential Manager Web: http://localhost:8003"
echo "  - Plugin Manager Web:     http://localhost:9000"
echo "  - Plugin Manager MCP:     http://localhost:8090"
echo ""
echo "常用命令："
echo "  - 手动刷新 Cookie:    cd $SCRIPT_DIR && ./scripts/export-all-cookies.sh"
echo "  - 自动检查并刷新:      cd $SCRIPT_DIR && ./scripts/auto-refresh-cookies.sh"
echo "  - 重新验证配置:        cd $SCRIPT_DIR && ./scripts/check-config.sh"
echo ""
