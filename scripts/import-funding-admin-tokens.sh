#!/bin/bash
# 手动导入 Funding Admin 的 token 到凭证管理器

set -e

API_BASE="http://localhost:8002"
API_KEY="d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124"

echo "=== 导入 Funding Admin Token ==="
echo ""

# 生产环境
echo "1. 导入生产环境 token..."
PROD_TOKEN="c3d20409-73dd-4465-aa24-8bf24481b92a-00518-01"

PROD_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/entries" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"id\": \"funding-admin-prod\",
    \"name\": \"Funding Admin Production\",
    \"type\": \"mixed\",
    \"password\": \"$PROD_TOKEN\",
    \"custom_fields\": {
      \"domain\": \"funding-admin.fintopia.tech\",
      \"environment\": \"production\",
      \"source\": \"manual-import\",
      \"user_agent\": \"Claude Code\"
    },
    \"metadata\": {
      \"imported_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"note\": \"从浏览器 cookie 中提取的最新 token\"
    }
  }")

HTTP_CODE=$(echo "$PROD_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$PROD_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  echo "  ✅ 生产环境 token 导入成功"
elif [ "$HTTP_CODE" = "400" ]; then
  # 尝试更新
  echo "  凭证已存在，尝试更新..."
  UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/entries/funding-admin-prod" -X PUT \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{
      \"name\": \"Funding Admin Production\",
      \"type\": \"mixed\",
      \"password\": \"$PROD_TOKEN\",
      \"custom_fields\": {
        \"domain\": \"funding-admin.fintopia.tech\",
        \"environment\": \"production\",
        \"source\": \"manual-import\",
        \"user_agent\": \"Claude Code\"
      },
      \"metadata\": {
        \"updated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
        \"note\": \"从浏览器 cookie 中提取的最新 token\"
      }
    }")

  UPDATE_CODE=$(echo "$UPDATE_RESPONSE" | tail -n1)
  if [ "$UPDATE_CODE" = "200" ]; then
    echo "  ✅ 生产环境 token 更新成功"
  else
    echo "  ❌ 更新失败: HTTP $UPDATE_CODE"
  fi
else
  echo "  ❌ 导入失败: HTTP $HTTP_CODE"
  echo "  $RESPONSE_BODY"
fi
echo ""

# 测试环境
echo "2. 导入测试环境 token..."
TEST_TOKEN="95DEE528A28FBDAB57AB3E08473502EE7CCE060C987A63D94F2ED5B8EF4906F6DF547035DDA41648-01018-01"

TEST_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/entries" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"id\": \"funding-admin-test\",
    \"name\": \"Funding Admin Test\",
    \"type\": \"mixed\",
    \"password\": \"$TEST_TOKEN\",
    \"custom_fields\": {
      \"domain\": \"funding-admin.fintopia.tech\",
      \"environment\": \"test\",
      \"source\": \"manual-import\",
      \"user_agent\": \"Claude Code\"
    },
    \"metadata\": {
      \"imported_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"note\": \"从浏览器 cookie 中提取的最新 token (test-env: true)\"
    }
  }")

HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$TEST_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
  echo "  ✅ 测试环境 token 导入成功"
elif [ "$HTTP_CODE" = "400" ]; then
  # 尝试更新
  echo "  凭证已存在，尝试更新..."
  UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/entries/funding-admin-test" -X PUT \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{
      \"name\": \"Funding Admin Test\",
      \"type\": \"mixed\",
      \"password\": \"$TEST_TOKEN\",
      \"custom_fields\": {
        \"domain\": \"funding-admin.fintopia.tech\",
        \"environment\": \"test\",
        \"source\": \"manual-import\",
        \"user_agent\": \"Claude Code\"
      },
      \"metadata\": {
        \"updated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
        \"note\": \"从浏览器 cookie 中提取的最新 token (test-env: true)\"
      }
    }")

  UPDATE_CODE=$(echo "$UPDATE_RESPONSE" | tail -n1)
  if [ "$UPDATE_CODE" = "200" ]; then
    echo "  ✅ 测试环境 token 更新成功"
  else
    echo "  ❌ 更新失败: HTTP $UPDATE_CODE"
  fi
else
  echo "  ❌ 导入失败: HTTP $HTTP_CODE"
  echo "  $RESPONSE_BODY"
fi
echo ""

# 同步到 macOS Keychain
echo "3. 同步到 macOS Keychain..."

# 删除旧的 keychain 记录
security delete-generic-password -s "funding-admin-prod" 2>/dev/null || true

# 添加新的
security add-generic-password -s "funding-admin-prod" -a "00518" -w "$PROD_TOKEN" -U

if [ $? -eq 0 ]; then
  echo "  ✅ Keychain 更新成功"
else
  echo "  ❌ Keychain 更新失败"
fi
echo ""

# 验证
echo "4. 验证导入结果..."
VERIFY=$(curl -s "$API_BASE/mcp" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_credential","arguments":{"id":"funding-admin-prod"}}}' \
  | jq -r '.result.content[0].text // "null"')

if [ "$VERIFY" != "null" ]; then
  echo "  ✅ 生产环境凭证验证成功"
  echo "  Token: $PROD_TOKEN"
else
  echo "  ❌ 生产环境凭证验证失败"
fi

VERIFY_TEST=$(curl -s "$API_BASE/mcp" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_credential","arguments":{"id":"funding-admin-test"}}}' \
  | jq -r '.result.content[0].text // "null"')

if [ "$VERIFY_TEST" != "null" ]; then
  echo "  ✅ 测试环境凭证验证成功"
  echo "  Token: $TEST_TOKEN"
else
  echo "  ❌ 测试环境凭证验证失败"
fi

echo ""
echo "=== 完成 ==="
echo ""
echo "现在你可以："
echo "1. 在 OpenClaw 中使用 get_credential 工具获取凭证"
echo "2. 使用脚本调用 Funding Admin API"
echo ""
