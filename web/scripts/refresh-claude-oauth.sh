#!/bin/sh
# Auto-refresh Claude CLI OAuth token.
# Reads refresh_token from ~/.claude/.credentials.json, exchanges for new access_token.
# Run via cron every 3 hours to keep AI services running.

CRED_FILE="$HOME/.claude/.credentials.json"
LOG_PREFIX="[claude-oauth-refresh]"

if [ ! -f "$CRED_FILE" ]; then
  echo "$LOG_PREFIX credentials file not found: $CRED_FILE"
  exit 1
fi

# Extract tokens
REFRESH_TOKEN=$(python3 -c "import json;d=json.load(open('$CRED_FILE'));print(d.get('claudeAiOauth',{}).get('refreshToken',''))" 2>/dev/null)
EXPIRES_AT=$(python3 -c "import json;d=json.load(open('$CRED_FILE'));print(d.get('claudeAiOauth',{}).get('expiresAt',0))" 2>/dev/null)
NOW_MS=$(python3 -c "import time;print(int(time.time()*1000))")

if [ -z "$REFRESH_TOKEN" ]; then
  echo "$LOG_PREFIX no refresh token found"
  exit 1
fi

# Check if token still has > 30 min left
REMAINING=$(( (EXPIRES_AT - NOW_MS) / 60000 ))
if [ "$REMAINING" -gt 30 ]; then
  echo "$LOG_PREFIX token still valid ($REMAINING min left), skipping refresh"
  exit 0
fi

echo "$LOG_PREFIX token expires in $REMAINING min, refreshing..."

# Call Anthropic OAuth token endpoint
RESPONSE=$(curl -s -X POST "https://api.anthropic.com/v1/oauth/token" \
  -H "Content-Type: application/json" \
  -H "anthropic-beta: oauth-2025-04-20" \
  -H "User-Agent: blockid-auto-refresh/1.0" \
  -d "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"$REFRESH_TOKEN\"}" 2>&1)

# Check response
NEW_ACCESS=$(echo "$RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('access_token',''))" 2>/dev/null)
NEW_REFRESH=$(echo "$RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('refresh_token',''))" 2>/dev/null)
NEW_EXPIRES=$(echo "$RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('expires_at',''))" 2>/dev/null)

if [ -z "$NEW_ACCESS" ]; then
  echo "$LOG_PREFIX refresh failed: $RESPONSE"
  # Fallback: try `claude auth status` which may trigger internal refresh
  claude auth status > /dev/null 2>&1
  exit 1
fi

# Update credentials file
python3 -c "
import json, os, time

cred_file = '$CRED_FILE'
with open(cred_file) as f:
    creds = json.load(f)

oauth = creds.get('claudeAiOauth', {})
oauth['accessToken'] = '$NEW_ACCESS'
if '$NEW_REFRESH':
    oauth['refreshToken'] = '$NEW_REFRESH'
if '$NEW_EXPIRES':
    try:
        # expires_at from API is ISO string or epoch seconds
        exp = '$NEW_EXPIRES'
        if exp.isdigit():
            oauth['expiresAt'] = int(exp) * 1000  # to ms
        else:
            from datetime import datetime
            oauth['expiresAt'] = int(datetime.fromisoformat(exp.replace('Z','+00:00')).timestamp() * 1000)
    except:
        # Default: 4 hours from now
        oauth['expiresAt'] = int(time.time() * 1000) + 4 * 60 * 60 * 1000

creds['claudeAiOauth'] = oauth

# Atomic write
tmp = cred_file + '.tmp'
with open(tmp, 'w') as f:
    json.dump(creds, f)
    f.flush()
    os.fsync(f.fileno())
os.rename(tmp, cred_file)
os.chmod(cred_file, 0o644)
print('Token refreshed successfully')
" 2>&1

echo "$LOG_PREFIX done"
