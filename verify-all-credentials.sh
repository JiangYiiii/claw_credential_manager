#!/bin/bash
# 验证所有凭证系统的状态

set -e

API_BASE="http://localhost:8002"
API_KEY="d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "    凭证管理系统完整性验证"
echo "=========================================="
echo ""

# 检查容器状态
echo "1. 检查容器状态..."
if podman ps | grep -q claw-credential-manager; then
  echo -e "  ${GREEN}✅ 容器运行正常${NC}"
else
  echo -e "  ${RED}❌ 容器未运行${NC}"
  exit 1
fi
echo ""

# 检查 MCP 工具
echo "2. 检查 MCP 工具列表..."
TOOLS=$(curl -s "$API_BASE/mcp" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | jq -r '.result.tools[] | .name' 2>/dev/null)

if echo "$TOOLS" | grep -q "get_credential"; then
  echo -e "  ${GREEN}✅ MCP 工具正常${NC}"
  echo "     - list_credentials"
  echo "     - get_credential"
else
  echo -e "  ${RED}❌ MCP 工具异常${NC}"
  exit 1
fi
echo ""

# 检查 Rhino 凭证
echo "3. 检查 Rhino 凭证..."
RHINO_CRED=$(curl -s "$API_BASE/mcp" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_credential","arguments":{"id":"rhino-cookies"}}}' \
  | jq -r '.result.content[0].text // "null"')

if [ "$RHINO_CRED" != "null" ]; then
  RHINO_TOKEN=$(echo "$RHINO_CRED" | jq -r '.password' | grep -o '"YQG_UNITE_TOKEN_PROD","value":"[^"]*"' | cut -d'"' -f6)
  if [ -n "$RHINO_TOKEN" ]; then
    echo -e "  ${GREEN}✅ Rhino 凭证存在${NC}"
    echo "     Token: ${RHINO_TOKEN:0:30}..."

    # 检查 token 前缀
    if [[ "$RHINO_TOKEN" == A1A22D06* ]]; then
      echo -e "     ${GREEN}✅ Token 是最新的${NC}"
    else
      echo -e "     ${YELLOW}⚠️  Token 可能过期${NC}"
    fi
  else
    echo -e "  ${YELLOW}⚠️  找到凭证但无法解析 token${NC}"
  fi
else
  echo -e "  ${RED}❌ Rhino 凭证不存在${NC}"
fi
echo ""

# 检查 Funding Admin 生产凭证
echo "4. 检查 Funding Admin 生产环境凭证..."
FUNDING_PROD=$(curl -s "$API_BASE/mcp" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_credential","arguments":{"id":"funding-admin-prod"}}}' \
  | jq -r '.result.content[0].text // "null"')

if [ "$FUNDING_PROD" != "null" ]; then
  FUNDING_PROD_TOKEN=$(echo "$FUNDING_PROD" | jq -r '.password')
  echo -e "  ${GREEN}✅ Funding Admin 生产凭证存在${NC}"
  echo "     Token: ${FUNDING_PROD_TOKEN:0:30}..."

  # 检查 Keychain
  KEYCHAIN_TOKEN=$(security find-generic-password -s "funding-admin-prod" -g 2>&1 | grep "password:" | cut -d'"' -f2 || echo "")
  if [ "$KEYCHAIN_TOKEN" == "$FUNDING_PROD_TOKEN" ]; then
    echo -e "     ${GREEN}✅ Keychain 同步正常${NC}"
  else
    echo -e "     ${YELLOW}⚠️  Keychain 与容器不一致${NC}"
    echo "        容器: ${FUNDING_PROD_TOKEN:0:30}..."
    echo "        Keychain: ${KEYCHAIN_TOKEN:0:30}..."
  fi
else
  echo -e "  ${RED}❌ Funding Admin 生产凭证不存在${NC}"
fi
echo ""

# 检查 Funding Admin 测试凭证
echo "5. 检查 Funding Admin 测试环境凭证..."
FUNDING_TEST=$(curl -s "$API_BASE/mcp" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_credential","arguments":{"id":"funding-admin-test"}}}' \
  | jq -r '.result.content[0].text // "null"')

if [ "$FUNDING_TEST" != "null" ]; then
  FUNDING_TEST_TOKEN=$(echo "$FUNDING_TEST" | jq -r '.password')
  echo -e "  ${GREEN}✅ Funding Admin 测试凭证存在${NC}"
  echo "     Token: ${FUNDING_TEST_TOKEN:0:30}..."
else
  echo -e "  ${RED}❌ Funding Admin 测试凭证不存在${NC}"
fi
echo ""

# 检查 OpenClaw 配置
echo "6. 检查 OpenClaw 配置..."
if [ -f "$HOME/.openclaw/openclaw.json" ]; then
  if grep -q "claw-plugin-manager" "$HOME/.openclaw/openclaw.json"; then
    echo -e "  ${GREEN}✅ OpenClaw 配置存在${NC}"

    # 检查是否还有旧的 claw-credentials 配置
    if grep -q '"claw-credentials"' "$HOME/.openclaw/openclaw.json"; then
      echo -e "  ${YELLOW}⚠️  检测到旧的 claw-credentials 配置${NC}"
      echo "     建议删除以避免冲突"
    fi
  else
    echo -e "  ${YELLOW}⚠️  OpenClaw 配置不完整${NC}"
  fi
else
  echo -e "  ${YELLOW}⚠️  OpenClaw 配置文件不存在${NC}"
fi
echo ""

# 检查 plugin-manager 配置
echo "7. 检查 plugin-manager 配置..."
CONFIG_PATH="$HOME/openclaw-data/claw-plugin-manager/config.yaml"
if [ -f "$CONFIG_PATH" ]; then
  if grep -q "claw-credentials:" "$CONFIG_PATH"; then
    echo -e "  ${GREEN}✅ plugin-manager 配置正常${NC}"

    # 检查 URL
    if grep -q "http://claw-credential-manager:8002/mcp" "$CONFIG_PATH"; then
      echo "     URL: http://claw-credential-manager:8002/mcp"
    else
      echo -e "  ${YELLOW}⚠️  URL 可能不正确${NC}"
    fi
  else
    echo -e "  ${YELLOW}⚠️  plugin-manager 配置不完整${NC}"
  fi
else
  echo -e "  ${YELLOW}⚠️  plugin-manager 配置文件不存在${NC}"
fi
echo ""

# 总结
echo "=========================================="
echo "           验证完成"
echo "=========================================="
echo ""

# 统计凭证数量
TOTAL_CREDS=$(curl -s "$API_BASE/entries" \
  -H "Authorization: Bearer $API_KEY" \
  | jq '. | length' 2>/dev/null || echo "0")

echo "📊 统计信息:"
echo "  - 凭证总数: $TOTAL_CREDS"
echo "  - Rhino: $([ "$RHINO_CRED" != "null" ] && echo "✅" || echo "❌")"
echo "  - Funding Admin 生产: $([ "$FUNDING_PROD" != "null" ] && echo "✅" || echo "❌")"
echo "  - Funding Admin 测试: $([ "$FUNDING_TEST" != "null" ] && echo "✅" || echo "❌")"
echo ""

echo "📚 相关文档:"
echo "  - 状态报告: ./CREDENTIAL_STATUS_REPORT.md"
echo "  - Chrome 插件调试: ./CHROME_EXTENSION_DEBUG.md"
echo "  - OpenClaw 配置: ./OPENCLAW_SETUP_COMPLETE.md"
echo ""

echo "🔧 维护命令:"
echo "  - 诊断问题: ./diagnose-funding-admin.sh"
echo "  - 导入 token: ./scripts/import-funding-admin-tokens.sh"
echo "  - 查看日志: podman logs -f claw-credential-manager"
echo ""
