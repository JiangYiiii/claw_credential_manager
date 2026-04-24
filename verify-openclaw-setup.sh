#!/bin/bash
# OpenClaw 容器化凭证系统验证脚本

set -e

echo "========================================="
echo "OpenClaw 容器化凭证系统验证"
echo "========================================="
echo ""

# 1. 检查容器状态
echo "1. 检查容器状态..."
echo "   credential-manager:"
podman ps --filter name=claw-credential-manager --format "   - {{.Status}}"
echo "   plugin-manager:"
podman ps --filter name=claw-plugin-manager --format "   - {{.Status}}"
echo ""

# 2. 测试 credential-manager MCP 端点
echo "2. 测试 credential-manager MCP 端点..."
CRED_RESPONSE=$(curl -s -X POST http://localhost:8002/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')

CRED_TOOLS=$(echo "$CRED_RESPONSE" | jq -r '.result.tools[].name' 2>/dev/null | wc -l)
if [ "$CRED_TOOLS" -ge 2 ]; then
    echo "   ✅ 正常 - 发现 $CRED_TOOLS 个凭证工具"
    echo "$CRED_RESPONSE" | jq -r '.result.tools[] | "      - \(.name)"'
else
    echo "   ❌ 异常 - 未发现凭证工具"
    exit 1
fi
echo ""

# 3. 测试 plugin-manager
echo "3. 测试 plugin-manager 聚合..."
PM_RESPONSE=$(curl -s -X POST http://localhost:8090/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')

PM_CRED_TOOLS=$(echo "$PM_RESPONSE" | jq -r '.result.tools[] | select(.name | contains("credential")) | .name' 2>/dev/null)
if [ -n "$PM_CRED_TOOLS" ]; then
    echo "   ✅ 正常 - plugin-manager 暴露了凭证工具："
    echo "$PM_CRED_TOOLS" | sed 's/^/      - /'
else
    echo "   ❌ 异常 - plugin-manager 未暴露凭证工具"
    exit 1
fi
echo ""

# 4. 获取测试凭证
echo "4. 测试获取 rhino-cookies 凭证..."
RHINO_RESPONSE=$(curl -s -X POST http://localhost:8090/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"get_credential",
      "arguments":{"id":"rhino-cookies"}
    }
  }')

# 提取 token
TOKEN=$(echo "$RHINO_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.password' | jq -r '.[] | select(.name == "YQG_UNITE_TOKEN_PROD") | .value' | head -c 50)
if [ -n "$TOKEN" ]; then
    echo "   ✅ 正常 - 成功获取凭证"
    echo "      Token 前缀: ${TOKEN}..."

    # 检查是否是新 token
    if [[ "$TOKEN" == "A1A22D06A0BCD70EA5923717DCAD2A1C"* ]]; then
        echo "      ✅ 这是最新的 token（A1A22D06...）"
    else
        echo "      ⚠️  警告：这不是最新的 token"
        echo "         期望: A1A22D06..."
        echo "         实际: ${TOKEN:0:20}..."
    fi
else
    echo "   ❌ 异常 - 无法获取凭证"
    exit 1
fi
echo ""

# 5. 检查 OpenClaw 配置
echo "5. 检查 OpenClaw 配置..."
if grep -q "claw-credentials.*claw-vault-server" ~/.openclaw/openclaw.json 2>/dev/null; then
    echo "   ⚠️  警告：OpenClaw 配置中仍有本地 stdio vault-server"
    echo "      建议移除以避免使用旧数据"
else
    echo "   ✅ 正常 - 未发现本地 stdio vault-server 配置"
fi

if grep -q "claw-plugin-manager" ~/.openclaw/openclaw.json 2>/dev/null; then
    echo "   ✅ 正常 - 发现 plugin-manager 配置"
else
    echo "   ⚠️  警告：OpenClaw 配置中未找到 plugin-manager"
fi
echo ""

# 6. 检查是否有本地 vault-server 进程
echo "6. 检查本地进程..."
if ps aux | grep -q "[c]law-vault-server.*-mcp"; then
    echo "   ⚠️  警告：发现本地 vault-server MCP 进程"
    echo "      PID: $(ps aux | grep "[c]law-vault-server.*-mcp" | awk '{print $2}')"
    echo "      建议停止该进程"
else
    echo "   ✅ 正常 - 无本地 vault-server MCP 进程"
fi
echo ""

echo "========================================="
echo "验证完成！"
echo ""
echo "下一步："
echo "1. 在 OpenClaw 中测试获取凭证："
echo "   \"请获取 rhino-cookies 的凭证\""
echo ""
echo "2. 检查返回的 token 是否为："
echo "   A1A22D06A0BCD70EA5923717DCAD2A1C..."
echo ""
echo "3. 如果 token 正确，测试 Rhino API："
echo "   \"请调用 rhino API 处理工单 1234322\""
echo "========================================="
