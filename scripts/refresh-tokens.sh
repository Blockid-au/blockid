#!/bin/bash
# ═══════════════════════════════════════════════════════════
# BlockID.au — Auto-refresh OAuth tokens
#
# Refreshes Claude CLI + Codex OAuth tokens before they expire.
# Run via cron every 4 hours:
#   0 */4 * * * /home/dovanlong/blockid.au/scripts/refresh-tokens.sh >> /tmp/blockid-token-refresh.log 2>&1
# ═══════════════════════════════════════════════════════════

set -euo pipefail
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M')]"

# ── 1. Claude CLI OAuth refresh ──────────────────────────

CLAUDE_CREDS="/home/dovanlong/.claude/.credentials.json"

if [ -f "$CLAUDE_CREDS" ]; then
  EXPIRES_AT=$(python3 -c "
import json, time
d = json.load(open('$CLAUDE_CREDS'))
print(d.get('claudeAiOauth', {}).get('expiresAt', 0))
" 2>/dev/null || echo "0")

  NOW_MS=$(python3 -c "import time; print(int(time.time() * 1000))")
  REMAINING_MIN=$(( (EXPIRES_AT - NOW_MS) / 1000 / 60 ))

  if [ "$REMAINING_MIN" -lt 120 ]; then
    echo "$LOG_PREFIX Claude token expires in ${REMAINING_MIN}min — refreshing..."

    # Claude CLI handles its own token refresh internally.
    # Running any claude command triggers the refresh if token is near expiry.
    if command -v claude &>/dev/null; then
      claude auth status &>/dev/null
      # Re-read expiry after potential refresh
      NEW_EXPIRES=$(python3 -c "
import json, time
d = json.load(open('$CLAUDE_CREDS'))
exp = d.get('claudeAiOauth', {}).get('expiresAt', 0)
remaining = (exp - time.time() * 1000) / 1000 / 60
print(f'{remaining:.0f}')
" 2>/dev/null || echo "0")
      if [ "$NEW_EXPIRES" -gt 120 ]; then
        echo "$LOG_PREFIX ✓ Claude token refreshed via CLI (${NEW_EXPIRES}min remaining)"
      else
        echo "$LOG_PREFIX ⚠ Claude token still near expiry (${NEW_EXPIRES}min) — run: claude auth login"
      fi
    else
      echo "$LOG_PREFIX ⚠ claude CLI not found — install or run: claude auth login"
    fi
  else
    echo "$LOG_PREFIX Claude token valid (${REMAINING_MIN}min remaining)"
  fi
else
  echo "$LOG_PREFIX ✗ No Claude credentials at $CLAUDE_CREDS"
fi

# ── 2. Codex OAuth refresh ───────────────────────────────

CODEX_AUTH="/home/dovanlong/.codex/auth.json"

if [ -f "$CODEX_AUTH" ]; then
  REFRESH_TOKEN=$(python3 -c "
import json
d = json.load(open('$CODEX_AUTH'))
print(d.get('tokens', {}).get('refresh_token', ''))
" 2>/dev/null || echo "")

  if [ -n "$REFRESH_TOKEN" ]; then
    # Codex uses OpenAI's OAuth endpoint with single-use refresh tokens.
    # If refresh fails (token already used), try device auth flow silently.
    RESP=$(curl -s -X POST "https://auth.openai.com/oauth/token" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "grant_type=refresh_token&refresh_token=${REFRESH_TOKEN}&client_id=app_EMoamEEZ73f0CkXaXp7hrann" 2>/dev/null || echo "")

    NEW_ACCESS=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")

    if [ -n "$NEW_ACCESS" ]; then
      python3 << 'PYEOF'
import json
d = json.load(open("CODEX_AUTH_PLACEHOLDER"))
resp = json.loads("""RESP_PLACEHOLDER""")
d['tokens']['access_token'] = resp['access_token']
if 'refresh_token' in resp:
    d['tokens']['refresh_token'] = resp['refresh_token']
if 'id_token' in resp:
    d['tokens']['id_token'] = resp['id_token']
json.dump(d, open("CODEX_AUTH_PLACEHOLDER", 'w'), indent=2)
print('OK')
PYEOF
      echo "$LOG_PREFIX ✓ Codex token refreshed"
    else
      # Check if current access token still works (JWT may be long-lived)
      TEST=$(curl -s -H "Authorization: Bearer $(python3 -c "import json; print(json.load(open('$CODEX_AUTH')).get('tokens',{}).get('access_token',''))")" \
        "https://api.openai.com/v1/models" --max-time 5 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if 'data' in d else d.get('error',{}).get('message','FAIL'))" 2>/dev/null || echo "FAIL")
      if [ "$TEST" = "OK" ]; then
        echo "$LOG_PREFIX Codex refresh token expired but access token still valid"
      else
        echo "$LOG_PREFIX ⚠ Codex tokens expired — run: npx codex --login"
      fi
    fi
  else
    echo "$LOG_PREFIX ✗ No Codex refresh token available"
  fi
else
  echo "$LOG_PREFIX ✗ No Codex auth at $CODEX_AUTH"
fi

echo "$LOG_PREFIX Done"
