#!/bin/bash
# cURL examples for Claw Credential Manager API

API_KEY="your-api-key-here"
BASE_URL="http://127.0.0.1:8765"

echo "===== Claw Credential Manager API Examples ====="

# 1. Health check
echo -e "\n1. Health check:"
curl -s $BASE_URL/health | jq .

# 2. List all entries (no sensitive fields)
echo -e "\n2. List all entries:"
curl -s -H "Authorization: Bearer $API_KEY" \
  $BASE_URL/entries | jq .

# 3. Get specific entry (with password)
echo -e "\n3. Get specific entry:"
curl -s -H "Authorization: Bearer $API_KEY" \
  $BASE_URL/entries/github-token | jq .

# 4. Create new entry
echo -e "\n4. Create new entry:"
curl -s -X POST -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "slack-bot",
    "name": "Slack Bot Token",
    "type": "token",
    "password": "xoxb-your-token",
    "custom_fields": {
      "workspace": "my-workspace",
      "scopes": ["chat:write", "channels:read"]
    },
    "tags": ["slack", "bot"]
  }' $BASE_URL/entries | jq .

# 5. Update entry
echo -e "\n5. Update entry:"
curl -s -X PUT -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Slack Bot Token (Updated)",
    "password": "xoxb-new-token",
    "metadata": {
      "token_expires_at": "2026-12-31T23:59:59Z",
      "refresh_script_path": "/path/to/refresh-slack.sh",
      "refresh_interval_sec": 3600
    }
  }' $BASE_URL/entries/slack-bot | jq .

# 6. Delete entry
echo -e "\n6. Delete entry:"
curl -s -X DELETE -H "Authorization: Bearer $API_KEY" \
  $BASE_URL/entries/slack-bot

echo -e "\n===== Examples complete ====="
