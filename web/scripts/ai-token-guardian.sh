#!/bin/bash
# AI Token Guardian — Always-on token refresh daemon
# Monitors Claude OAuth token and auto-refreshes before expiry.
# Run via cron every 10 minutes for always-on AI availability.
#
# Cron: */10 * * * * /home/dovanlong/blockid.au/web/scripts/ai-token-guardian.sh

LOG_PREFIX="[ai-guardian]"
CRED_FILE="$HOME/.claude/.credentials.json"
CODEX_FILE="$HOME/.codex/auth.json"
WEB_DIR="$HOME/blockid.au/web"

# ── 1. Claude OAuth check + refresh ─────────────────────────────────────
if [ -f "$CRED_FILE" ]; then
  EXPIRES_AT=$(python3 -c "import json;d=json.load(open('$CRED_FILE'));print(d.get('claudeAiOauth',{}).get('expiresAt',0))" 2>/dev/null)
  NOW_MS=$(python3 -c "import time;print(int(time.time()*1000))")
  REMAINING=$(( (EXPIRES_AT - NOW_MS) / 60000 ))

  if [ "$REMAINING" -lt 15 ]; then
    echo "$LOG_PREFIX Claude token expires in ${REMAINING}min — refreshing..."

    # Method 1: Try claude CLI internal refresh (triggers on any API call)
    REFRESH_OK=false

    # Use claude CLI to make a tiny API call — this triggers internal token refresh
    timeout 30 claude -p "respond with just OK" --max-turns 1 > /dev/null 2>&1

    # Check if token was refreshed
    NEW_EXPIRES=$(python3 -c "import json;d=json.load(open('$CRED_FILE'));print(d.get('claudeAiOauth',{}).get('expiresAt',0))" 2>/dev/null)
    NEW_REMAINING=$(( (NEW_EXPIRES - NOW_MS) / 60000 ))

    if [ "$NEW_REMAINING" -gt "$REMAINING" ]; then
      echo "$LOG_PREFIX Claude refreshed OK — ${NEW_REMAINING}min remaining"
      REFRESH_OK=true
    fi

    if [ "$REFRESH_OK" = false ]; then
      echo "$LOG_PREFIX Claude refresh via CLI failed. Token may expire soon."
      echo "$LOG_PREFIX Manual refresh: claude auth login"
    fi
  else
    echo "$LOG_PREFIX Claude OK — ${REMAINING}min remaining"
  fi
else
  echo "$LOG_PREFIX No Claude credentials found"
fi

# ── 2. Codex OAuth check + refresh ──────────────────────────────────────
if [ -f "$CODEX_FILE" ]; then
  CODEX_TOKEN=$(python3 -c "import json;d=json.load(open('$CODEX_FILE'));print(d.get('tokens',{}).get('access_token',''))" 2>/dev/null)

  # Test if token works (quick check)
  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://api.openai.com/v1/models" -H "Authorization: Bearer $CODEX_TOKEN" 2>/dev/null)

  if [ "$HTTP_CODE" != "200" ]; then
    echo "$LOG_PREFIX Codex token expired (HTTP $HTTP_CODE) — refreshing..."
    bash "$WEB_DIR/scripts/refresh-codex-oauth.sh" 2>&1
  else
    echo "$LOG_PREFIX Codex OK"
  fi
fi

# ── 3. Test AI health via the app ────────────────────────────────────────
if [ -f "$WEB_DIR/.env" ]; then
  CRON_SECRET=$(grep 'CRON_SECRET=' "$WEB_DIR/.env" | head -1 | cut -d= -f2)
  if [ -n "$CRON_SECRET" ]; then
    AI_STATUS=$(curl -s --max-time 15 -H "Authorization: Bearer $CRON_SECRET" "https://blockid.au/api/cron/ai-health" 2>/dev/null)
    AI_OK=$(echo "$AI_STATUS" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('ok',False))" 2>/dev/null)
    AI_PROVIDER=$(echo "$AI_STATUS" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('provider','?'))" 2>/dev/null)

    if [ "$AI_OK" = "True" ]; then
      echo "$LOG_PREFIX AI health OK — provider: $AI_PROVIDER"
    else
      echo "$LOG_PREFIX AI health FAILED — restarting container..."
      docker restart deploy-blockid-production 2>/dev/null
    fi
  fi
fi

echo "$LOG_PREFIX done at $(date)"
