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
# Codex tokens last ~10 days. Refresh when <48h remaining.
# Strategy: use JWT expiry check → codex CLI refresh → alert if failed.

CODEX_AUTH="/home/dovanlong/.codex/auth.json"

if [ -f "$CODEX_AUTH" ]; then
  # Check JWT expiry
  CODEX_REMAINING=$(python3 -c "
import json, time, base64
d = json.load(open('$CODEX_AUTH'))
token = d.get('tokens', {}).get('access_token', '')
if not token:
    print('-1')
else:
    payload = token.split('.')[1] + '==='
    jwt = json.loads(base64.urlsafe_b64decode(payload))
    remaining_h = (jwt.get('exp', 0) - time.time()) / 3600
    print(f'{remaining_h:.1f}')
" 2>/dev/null || echo "-1")

  if [ "$(echo "$CODEX_REMAINING < 0" | bc -l 2>/dev/null || echo 1)" = "1" ] && [ "$CODEX_REMAINING" = "-1" ]; then
    echo "$LOG_PREFIX ✗ Codex: no valid token"
  elif python3 -c "exit(0 if float('$CODEX_REMAINING') < 48 else 1)" 2>/dev/null; then
    echo "$LOG_PREFIX Codex token expires in ${CODEX_REMAINING}h — refreshing..."

    # Method 1: codex CLI internal refresh (triggers on any command)
    if command -v codex &>/dev/null; then
      codex login status &>/dev/null 2>&1

      # Re-check expiry
      NEW_REMAINING=$(python3 -c "
import json, time, base64
d = json.load(open('$CODEX_AUTH'))
token = d.get('tokens', {}).get('access_token', '')
payload = token.split('.')[1] + '==='
jwt = json.loads(base64.urlsafe_b64decode(payload))
print(f'{(jwt.get(\"exp\", 0) - time.time()) / 3600:.1f}')
" 2>/dev/null || echo "0")

      if python3 -c "exit(0 if float('$NEW_REMAINING') > float('$CODEX_REMAINING') else 1)" 2>/dev/null; then
        echo "$LOG_PREFIX ✓ Codex refreshed via CLI (${NEW_REMAINING}h remaining)"
      else
        # Method 2: direct refresh token exchange
        REFRESH_TOKEN=$(python3 -c "import json; print(json.load(open('$CODEX_AUTH')).get('tokens',{}).get('refresh_token',''))" 2>/dev/null)
        if [ -n "$REFRESH_TOKEN" ]; then
          RESP=$(curl -s -X POST "https://auth.openai.com/oauth/token" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "grant_type=refresh_token&refresh_token=${REFRESH_TOKEN}&client_id=app_EMoamEEZ73f0CkXaXp7hrann" 2>/dev/null)

          NEW_ACCESS=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
          if [ -n "$NEW_ACCESS" ]; then
            python3 << PYEOF
import json
d = json.load(open("$CODEX_AUTH"))
resp = json.loads('''$RESP''')
d['tokens']['access_token'] = resp['access_token']
if 'refresh_token' in resp: d['tokens']['refresh_token'] = resp['refresh_token']
if 'id_token' in resp: d['tokens']['id_token'] = resp['id_token']
json.dump(d, open("$CODEX_AUTH", 'w'), indent=2)
PYEOF
            echo "$LOG_PREFIX ✓ Codex refreshed via API"
          else
            echo "$LOG_PREFIX ⚠ Codex refresh failed (${CODEX_REMAINING}h left) — run: codex login --device-auth"
          fi
        else
          echo "$LOG_PREFIX ⚠ Codex no refresh token — run: codex login --device-auth"
        fi
      fi
    else
      echo "$LOG_PREFIX ⚠ codex CLI not found"
    fi
  else
    echo "$LOG_PREFIX Codex token valid (${CODEX_REMAINING}h remaining)"
  fi
else
  echo "$LOG_PREFIX ✗ No Codex auth at $CODEX_AUTH"
fi

echo "$LOG_PREFIX Done"
