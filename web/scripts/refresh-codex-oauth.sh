#!/bin/sh
# Auto-refresh OpenAI Codex CLI OAuth token.
# Reads refresh_token from ~/.codex/auth.json, exchanges for new access_token.
# Run via cron every 3 hours alongside Claude OAuth refresh.

AUTH_FILE="$HOME/.codex/auth.json"
LOG_PREFIX="[codex-oauth-refresh]"

if [ ! -f "$AUTH_FILE" ]; then
  echo "$LOG_PREFIX auth file not found: $AUTH_FILE"
  exit 1
fi

REFRESH_TOKEN=$(python3 -c "import json;d=json.load(open('$AUTH_FILE'));print(d.get('tokens',{}).get('refresh_token',''))" 2>/dev/null)

if [ -z "$REFRESH_TOKEN" ]; then
  echo "$LOG_PREFIX no refresh token found"
  exit 1
fi

# Test if current token still works
ACCESS_TOKEN=$(python3 -c "import json;d=json.load(open('$AUTH_FILE'));print(d.get('tokens',{}).get('access_token',''))" 2>/dev/null)
TEST=$(curl -s -o /dev/null -w '%{http_code}' "https://api.openai.com/v1/models" -H "Authorization: Bearer $ACCESS_TOKEN" 2>/dev/null)
if [ "$TEST" = "200" ]; then
  echo "$LOG_PREFIX token still valid, skipping refresh"
  exit 0
fi

echo "$LOG_PREFIX token expired (HTTP $TEST), refreshing..."

# Exchange refresh_token for new tokens via OpenAI OAuth endpoint
RESPONSE=$(curl -s -X POST "https://auth.openai.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=$REFRESH_TOKEN" \
  -d "client_id=app_EMoamEEZ73f0CkXaXp7hrann" 2>&1)

NEW_ACCESS=$(echo "$RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('access_token',''))" 2>/dev/null)
NEW_REFRESH=$(echo "$RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('refresh_token',''))" 2>/dev/null)

if [ -z "$NEW_ACCESS" ]; then
  echo "$LOG_PREFIX refresh failed: $RESPONSE"
  # Try device auth flow as fallback
  echo "$LOG_PREFIX Use: codex auth login --device-auth"
  exit 1
fi

# Update auth.json
python3 -c "
import json, os

auth_file = '$AUTH_FILE'
with open(auth_file) as f:
    data = json.load(f)

tokens = data.get('tokens', {})
tokens['access_token'] = '$NEW_ACCESS'
if '$NEW_REFRESH':
    tokens['refresh_token'] = '$NEW_REFRESH'
data['tokens'] = tokens

tmp = auth_file + '.tmp'
with open(tmp, 'w') as f:
    json.dump(data, f, indent=2)
    f.flush()
    os.fsync(f.fileno())
os.rename(tmp, auth_file)
os.chmod(auth_file, 0o644)
print('$LOG_PREFIX token refreshed successfully')
" 2>&1

echo "$LOG_PREFIX done"
