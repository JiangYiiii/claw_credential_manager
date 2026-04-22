#!/bin/bash
# Example: Refresh GitHub OAuth token
# This demonstrates a real-world token refresh flow

set -e

# Environment variables provided by the scheduler:
# - ENTRY_ID: The credential entry ID
# - ENTRY_NAME: The credential name
# - ENTRY_USERNAME: The username field
# - ENTRY_PASSWORD: The current token/password

# GitHub OAuth refresh endpoint
REFRESH_TOKEN="${ENTRY_PASSWORD}"
CLIENT_ID="${GITHUB_CLIENT_ID:-your-client-id}"
CLIENT_SECRET="${GITHUB_CLIENT_SECRET:-your-client-secret}"

# Refresh the token
RESPONSE=$(curl -s -X POST https://github.com/login/oauth/access_token \
  -H "Accept: application/json" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=$REFRESH_TOKEN")

# Extract new access token
NEW_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')
EXPIRES_IN=$(echo "$RESPONSE" | jq -r '.expires_in')

if [ "$NEW_TOKEN" = "null" ] || [ -z "$NEW_TOKEN" ]; then
  echo "Error: Failed to refresh token" >&2
  echo "$RESPONSE" >&2
  exit 1
fi

# Calculate expiry time
EXPIRES_AT=$(date -u -v+${EXPIRES_IN}S +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
             date -u -d "+${EXPIRES_IN} seconds" +"%Y-%m-%dT%H:%M:%SZ")

# Output JSON format
cat <<EOF
{
  "token": "$NEW_TOKEN",
  "expires_at": "$EXPIRES_AT"
}
EOF
