#!/bin/bash
# AI Token Guardian — Claude CLI OAuth token refresh + AI health ping.
# Monitors the Claude OAuth token (~/.claude/.credentials.json) and asks the
# CLI to refresh it before expiry; pings /api/cron/ai-health.
#
# Cron: */30 * * * * /home/dovanlong/blockid.au/web/scripts/ai-token-guardian.sh
#
# W1 (pricing v5 §7.2 #6, 2026-10-20):
#   - the expiry math no longer prints "-29874690 min": a missing / 0 /
#     non-numeric expiresAt (the CLI rewrites the file in place) is "unknown",
#     re-read once, and never turned into minutes;
#   - `docker restart deploy-blockid-production` is gone (that container no
#     longer exists — the site runs from a release origin, see deploy-auto.sh);
#     a failed health ping is logged and /api/cron/ai-health alerts by itself;
#   - a failed CLI refresh alerts ops ONCE per UTC day (scripts/lib/ops-alert.sh
#     → Telegram, ops e-mail fallback) instead of logging the same three lines
#     every 30 min. The fix is a founder action: `claude auth login`.
#
# Test hooks (scripts/ai-token-guardian.test.mjs): CRED_FILE, WEB_DIR,
# GUARDIAN_STATE_DIR, GUARDIAN_NOW_MS, GUARDIAN_ALERT_CMD, GUARDIAN_REREAD_SLEEP.

LOG_PREFIX="[ai-guardian]"
CRED_FILE="${CRED_FILE:-$HOME/.claude/.credentials.json}"
WEB_DIR="${WEB_DIR:-$HOME/blockid.au/web}"
STATE_DIR="${GUARDIAN_STATE_DIR:-$HOME/.local/state/blockid-runtime}"
ALERT_STATE="$STATE_DIR/ai-token-guardian-alert.day"
REFRESH_BELOW_MIN=15

# Print expiresAt (epoch ms) as a positive integer, or nothing when it is
# missing / zero / not a number / the file is unreadable.
read_expires_at() {
  python3 - "$1" <<'PY' 2>/dev/null
import json, sys
try:
    with open(sys.argv[1]) as f:
        v = json.load(f).get("claudeAiOauth", {}).get("expiresAt")
    v = int(float(v))
    if v > 0:
        print(v)
except Exception:
    pass
PY
}

now_ms() {
  if [ -n "$GUARDIAN_NOW_MS" ]; then echo "$GUARDIAN_NOW_MS"; return; fi
  python3 -c "import time;print(int(time.time()*1000))"
}

# Alert ops at most once per UTC day. Returns 0 when an alert was sent now.
alert_once_per_day() {
  local subject="$1" body="$2" today
  today=$(date -u +%F)
  mkdir -p "$STATE_DIR" 2>/dev/null
  if [ -f "$ALERT_STATE" ] && [ "$(cat "$ALERT_STATE" 2>/dev/null)" = "$today" ]; then
    return 1
  fi
  printf '%s' "$today" > "$ALERT_STATE" 2>/dev/null
  if [ -n "$GUARDIAN_ALERT_CMD" ]; then
    "$GUARDIAN_ALERT_CMD" "$subject" "$body" >/dev/null 2>&1 || true
  elif [ -f /home/dovanlong/blockid.au/scripts/lib/ops-alert.sh ]; then
    # shellcheck disable=SC1091
    source /home/dovanlong/blockid.au/scripts/lib/ops-alert.sh
    ops_alert "$subject" "$body" || true
  elif [ -f "$WEB_DIR/scripts/ops-alert-email.mjs" ]; then
    printf '%s' "$body" | node "$WEB_DIR/scripts/ops-alert-email.mjs" "$subject" >/dev/null 2>&1 || true
  fi
  return 0
}

# ── 1. Claude OAuth check + refresh ─────────────────────────────────────
if [ -f "$CRED_FILE" ]; then
  EXPIRES_AT=$(read_expires_at "$CRED_FILE")
  if [ -z "$EXPIRES_AT" ]; then
    # The CLI may be rewriting the file — read once more before giving up.
    sleep "${GUARDIAN_REREAD_SLEEP:-2}"
    EXPIRES_AT=$(read_expires_at "$CRED_FILE")
  fi
  NOW_MS=$(now_ms)

  if [ -z "$EXPIRES_AT" ]; then
    echo "$LOG_PREFIX Claude token expiry unknown (no expiresAt in credentials) — skipped"
  else
    REMAINING=$(( (EXPIRES_AT - NOW_MS) / 60000 ))
    if [ "$REMAINING" -lt "$REFRESH_BELOW_MIN" ]; then
      if [ "$REMAINING" -lt 0 ]; then STATE="expired ${REMAINING#-}min ago"; else STATE="expires in ${REMAINING}min"; fi
      # A Claude CLI call refreshes the token internally.
      timeout 30 claude -p "respond with just OK" --max-turns 1 > /dev/null 2>&1
      NEW_EXPIRES=$(read_expires_at "$CRED_FILE")
      if [ -n "$NEW_EXPIRES" ] && [ "$NEW_EXPIRES" -gt "$EXPIRES_AT" ]; then
        echo "$LOG_PREFIX Claude token refreshed ($STATE) — $(( (NEW_EXPIRES - NOW_MS) / 60000 ))min remaining"
      elif alert_once_per_day "Claude CLI token refresh failed" "Claude CLI OAuth token $STATE and the CLI refresh did not extend it. The Claude subscription fallback tier is unavailable until a founder runs: claude auth login (on the server, as dovanlong). Alerted once per UTC day by web/scripts/ai-token-guardian.sh."; then
        echo "$LOG_PREFIX Claude token $STATE — CLI refresh failed; ops alerted (once today). Fix: claude auth login"
      fi
    else
      echo "$LOG_PREFIX Claude OK — ${REMAINING}min remaining"
    fi
  fi
else
  echo "$LOG_PREFIX No Claude credentials found"
fi

# ── 2. Test AI health via the app ────────────────────────────────────────
# (Codex refresh removed 2026-09-17. W1: no container restart — the route
#  alerts once per day itself; a non-representative answer is ok:false.)
if [ -f "$WEB_DIR/.env" ]; then
  CRON_SECRET=$(grep '^CRON_SECRET=' "$WEB_DIR/.env" | head -1 | cut -d= -f2-)
  if [ -n "$CRON_SECRET" ]; then
    AI_STATUS=$(curl -s --max-time 15 -H "Authorization: Bearer $CRON_SECRET" "https://blockid.au/api/cron/ai-health" 2>/dev/null)
    AI_OK=$(printf '%s' "$AI_STATUS" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('ok',False))" 2>/dev/null)
    AI_PROVIDER=$(printf '%s' "$AI_STATUS" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('provider','?'), d.get('model',''))" 2>/dev/null)

    if [ "$AI_OK" = "True" ]; then
      echo "$LOG_PREFIX AI health OK — provider: $AI_PROVIDER"
    else
      echo "$LOG_PREFIX AI health NOT OK — provider: ${AI_PROVIDER:-?} (see /api/cron/ai-health; it alerts ops once per day)"
    fi
  fi
fi

echo "$LOG_PREFIX done at $(date)"
