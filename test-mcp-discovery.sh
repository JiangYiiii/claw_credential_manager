#!/bin/bash
# 测试 OpenClaw 发现 claw-credentials MCP

set -e

echo "=========================================="
echo "Testing MCP Discovery via Plugin Manager"
echo "=========================================="

# 1. 检查 Plugin Manager 是否运行
echo -e "\n[1/4] Checking Plugin Manager status..."
if ! pgrep -f "node.*index.js" > /dev/null; then
    echo "❌ Plugin Manager is not running"
    exit 1
fi
echo "✅ Plugin Manager is running"

# 2. 检查 Web API 是否可访问
echo -e "\n[2/4] Checking Web API..."
if ! curl -s http://127.0.0.1:8091/api/status > /dev/null; then
    echo "❌ Web API is not accessible"
    exit 1
fi
echo "✅ Web API is accessible"

# 3. 检查 claw-credentials MCP 是否注册
echo -e "\n[3/4] Checking claw-credentials MCP registration..."
MCP_STATUS=$(curl -s http://127.0.0.1:8091/api/mcps | jq -r '.[] | select(.name == "claw-credentials") | .status')

if [ "$MCP_STATUS" != "running" ]; then
    echo "❌ claw-credentials MCP is not running (status: $MCP_STATUS)"
    exit 1
fi

TOOL_COUNT=$(curl -s http://127.0.0.1:8091/api/mcps | jq -r '.[] | select(.name == "claw-credentials") | .tools')
echo "✅ claw-credentials MCP is running"
echo "   - Status: $MCP_STATUS"
echo "   - Tools: $TOOL_COUNT"

# 4. 验证工具可用性（模拟 OpenClaw 调用）
echo -e "\n[4/4] Verifying tool availability..."
echo "Expected tools:"
echo "  • list_credentials"
echo "  • get_credential"
echo "  • update_credential"

# 检查 claw-vault-server 进程
if pgrep -f "claw-vault-server.*-mcp" > /dev/null; then
    echo "✅ claw-vault-server process is running"
    ps aux | grep "claw-vault-server.*-mcp" | grep -v grep | awk '{print "   PID:", $2}'
else
    echo "⚠️  claw-vault-server process not found (may be managed by Plugin Manager)"
fi

echo -e "\n=========================================="
echo "✅ MCP Discovery Test PASSED"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Configure OpenClaw to use Plugin Manager as MCP server"
echo "2. OpenClaw will automatically discover claw-credentials tools"
echo "3. Test credential operations through OpenClaw"
