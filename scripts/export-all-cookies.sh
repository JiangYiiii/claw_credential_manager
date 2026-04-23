#!/bin/bash
# 批量导出所有域名的 cookies 到凭证管理器

API_KEY="${CLAW_API_KEY:-d59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124}"
API_BASE="${CLAW_API_BASE:-http://127.0.0.1:8002}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=========================================="
echo "批量导出 Cookies"
echo "=========================================="
echo ""

# 获取所有域名
echo "正在获取所有域名..."
DOMAINS=$(node "$SCRIPT_DIR/list-all-domains.js" 2>/dev/null | grep -E "^[0-9]+\." | awk '{print $2}')

if [ -z "$DOMAINS" ]; then
    echo "❌ 没有找到任何 cookies"
    echo ""
    echo "请先在 Debug Chrome 中访问并登录网站"
    exit 1
fi

echo "找到以下域名："
echo "$DOMAINS" | nl
echo ""

# 逐个导出
SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

for domain in $DOMAINS; do
    # 跳过一些不需要的域名
    if [[ "$domain" == "www."* ]]; then
        echo "⏭️  跳过 $domain (子域名)"
        SKIP_COUNT=$((SKIP_COUNT + 1))
        continue
    fi

    echo "----------------------------------------"
    echo "导出: $domain"
    echo ""

    # 导出 cookies
    OUTPUT=$(node "$SCRIPT_DIR/export-from-main-chrome.js" "$domain" 2>&1)
    EXIT_CODE=$?

    if [ $EXIT_CODE -ne 0 ]; then
        echo "⚠️  导出失败"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        continue
    fi

    # 提取 JSON
    JSON_LINE=$(echo "$OUTPUT" | tail -1)

    if ! echo "$JSON_LINE" | jq empty 2>/dev/null; then
        echo "⚠️  JSON 格式错误"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        continue
    fi

    TOKEN=$(echo "$JSON_LINE" | jq -r '.token')
    EXPIRES=$(echo "$JSON_LINE" | jq -r '.expires_at')
    COOKIE_COUNT=$(echo "$TOKEN" | jq '. | length')

    echo "✅ 导出成功 ($COOKIE_COUNT cookies)"

    # 保存到凭证管理器
    ENTRY_ID="${domain%%.*}-cookies"
    USER_AGENT="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"

    # 转义 TOKEN
    ESCAPED_TOKEN=$(echo "$TOKEN" | jq -Rs .)

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST $API_BASE/entries \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"id\": \"$ENTRY_ID\",
        \"name\": \"$domain Cookies\",
        \"type\": \"mixed\",
        \"password\": $ESCAPED_TOKEN,
        \"custom_fields\": {
          \"source\": \"main-chrome\",
          \"user_agent\": \"$USER_AGENT\",
          \"domain\": \"$domain\"
        },
        \"metadata\": {
          \"token_expires_at\": \"$EXPIRES\"
        }
      }")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "201" ]; then
        echo "💾 已保存到凭证管理器: $ENTRY_ID"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    elif ([ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "500" ]) && echo "$BODY" | grep -q "already exists"; then
        echo "⚠️  已存在，尝试更新..."

        UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT $API_BASE/entries/$ENTRY_ID \
          -H "Authorization: Bearer $API_KEY" \
          -H "Content-Type: application/json" \
          -d "{
            \"name\": \"$domain Cookies\",
            \"type\": \"mixed\",
            \"password\": $ESCAPED_TOKEN,
            \"custom_fields\": {
              \"source\": \"main-chrome\",
              \"user_agent\": \"$USER_AGENT\",
              \"domain\": \"$domain\"
            },
            \"metadata\": {
              \"token_expires_at\": \"$EXPIRES\"
            }
          }")

        UPDATE_CODE=$(echo "$UPDATE_RESPONSE" | tail -n1)

        if [ "$UPDATE_CODE" = "200" ]; then
            echo "✅ 更新成功: $ENTRY_ID"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            echo "❌ 更新失败"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    else
        echo "❌ 保存失败 (HTTP $HTTP_CODE)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    echo ""
done

echo "=========================================="
echo "导出完成"
echo "=========================================="
echo ""
echo "✅ 成功: $SUCCESS_COUNT"
echo "❌ 失败: $FAIL_COUNT"
echo "⏭️  跳过: $SKIP_COUNT"
echo ""
echo "查看凭证: http://127.0.0.1:8080"
echo "=========================================="
