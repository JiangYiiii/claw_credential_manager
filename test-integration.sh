#!/bin/bash
# Integration test script for Claw Credential Manager

set -e

API_KEY="claw_1776839434829992000"
BASE_URL="http://127.0.0.1:8765"

echo "=========================================="
echo "Claw Credential Manager - Integration Test"
echo "=========================================="

# Start server
echo -e "\n[1/6] Starting server..."
./claw-vault-server > /tmp/claw-vault-test.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 2

# Cleanup function
cleanup() {
    echo -e "\n[*] Cleaning up..."
    kill $SERVER_PID 2>/dev/null || true
    rm -f /tmp/claw-vault-test.log
}
trap cleanup EXIT

# Test 1: List entries
echo -e "\n[2/6] Testing list entries..."
RESPONSE=$(curl -s -H "Authorization: Bearer $API_KEY" $BASE_URL/entries)
echo "Response: $RESPONSE"
COUNT=$(echo $RESPONSE | grep -o '"count":[0-9]*' | cut -d: -f2)
echo "✓ Found $COUNT entries"

# Test 2: Create entry
echo -e "\n[3/6] Creating new entry..."
ENTRY_ID="test-openai-$(date +%s)"
curl -s -X POST -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$ENTRY_ID\",
    \"name\": \"OpenAI API Key\",
    \"type\": \"token\",
    \"password\": \"sk-test-key-123\",
    \"custom_fields\": {
      \"api_base\": \"https://api.openai.com/v1\"
    }
  }" $BASE_URL/entries > /dev/null
echo "✓ Entry created: $ENTRY_ID"

# Test 3: Get entry
echo -e "\n[4/6] Retrieving entry..."
RESPONSE=$(curl -s -H "Authorization: Bearer $API_KEY" $BASE_URL/entries/$ENTRY_ID)
echo "Response: $RESPONSE"
PASSWORD=$(echo $RESPONSE | grep -o '"password":"[^"]*"' | cut -d'"' -f4)
if [ "$PASSWORD" = "sk-test-key-123" ]; then
    echo "✓ Password matches"
else
    echo "✗ Password mismatch: expected 'sk-test-key-123', got '$PASSWORD'"
    exit 1
fi

# Test 4: Update entry
echo -e "\n[5/6] Updating entry..."
curl -s -X PUT -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"OpenAI API Key (Updated)\",
    \"password\": \"sk-updated-key-456\"
  }" $BASE_URL/entries/$ENTRY_ID > /dev/null
echo "✓ Entry updated"

# Verify update
RESPONSE=$(curl -s -H "Authorization: Bearer $API_KEY" $BASE_URL/entries/$ENTRY_ID)
PASSWORD=$(echo $RESPONSE | grep -o '"password":"[^"]*"' | cut -d'"' -f4)
if [ "$PASSWORD" = "sk-updated-key-456" ]; then
    echo "✓ Update verified"
else
    echo "✗ Update failed: expected 'sk-updated-key-456', got '$PASSWORD'"
    exit 1
fi

# Test 5: Delete entry
echo -e "\n[6/6] Deleting entry..."
curl -s -X DELETE -H "Authorization: Bearer $API_KEY" \
  $BASE_URL/entries/$ENTRY_ID > /dev/null
echo "✓ Entry deleted"

# Verify deletion
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  $BASE_URL/entries/$ENTRY_ID)
if [ "$STATUS" = "404" ]; then
    echo "✓ Deletion verified"
else
    echo "✗ Entry still exists (status: $STATUS)"
    exit 1
fi

echo -e "\n=========================================="
echo "✓ All tests passed!"
echo "=========================================="
