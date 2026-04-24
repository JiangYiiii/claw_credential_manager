#!/bin/bash
# 诊断 Funding Admin 凭证问题

set -e

API_BASE="http://localhost:8002"
API_KEY="d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124"

echo "=== Funding Admin 凭证诊断 ==="
echo ""

echo "1. 检查容器状态..."
podman ps | grep claw-credential-manager || echo "❌ 容器未运行"
echo ""

echo "2. 检查所有可能的 funding-admin 相关凭证..."
for id in "funding-admin-prod" "funding-admin-test" "funding-admin-fintopia-tech-cookies"; do
  echo "  检查: $id"
  result=$(curl -s "$API_BASE/mcp" -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_credential\",\"arguments\":{\"id\":\"$id\"}}}" \
    | jq -r '.result.content[0].text // "null"')

  if [ "$result" != "null" ]; then
    echo "    ✅ 找到凭证"
    # 提取 token
    token=$(echo "$result" | jq -r '.password // empty' | grep -o 'YQG_UNITE_TOKEN_[^"]*":"[^"]*' | head -1 || echo "")
    if [ -n "$token" ]; then
      echo "    Token: ${token:0:50}..."
    fi
  else
    echo "    ❌ 未找到"
  fi
done
echo ""

echo "3. 检查 macOS Keychain..."
for service in "funding-admin-prod" "funding-admin-test"; do
  echo "  检查: $service"
  token=$(security find-generic-password -s "$service" -g 2>&1 | grep "password:" | cut -d'"' -f2 || echo "")
  if [ -n "$token" ]; then
    echo "    ✅ Keychain 中存在: ${token:0:50}..."
  else
    echo "    ❌ Keychain 中不存在"
  fi
done
echo ""

echo "4. 从你的 curl 命令提取实际 token..."
echo "  生产环境: c3d20409-73dd-4465-aa24-8bf24481b92a-00518-01"
echo "  测试环境: 95DEE528A28FBDAB57AB3E08473502EE7CCE060C987A63D94F2ED5B8EF4906F6DF547035DDA41648-01018-01"
echo ""

echo "5. Chrome 插件配置检查..."
if [ -f "$HOME/Documents/codedev/claw_credential_manager/chrome-extension/popup.js" ]; then
  echo "  ✅ Chrome 插件文件存在"
  echo "  默认 API Base: http://localhost:8002"
  echo "  默认 API Key: d59df52d... (已配置)"
else
  echo "  ❌ Chrome 插件文件不存在"
fi
echo ""

echo "6. 建议的修复步骤："
echo "  a) 手动在 funding-admin.fintopia.tech 页面点击插件导出"
echo "  b) 如果失败，检查 Chrome 开发者工具 Console 的错误信息"
echo "  c) 如果需要手动创建，运行以下命令："
echo ""
echo "     ./scripts/import-funding-admin-tokens.sh"
echo ""
