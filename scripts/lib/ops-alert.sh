#!/usr/bin/env bash
# BlockID.au — shared ops alert helper (sourced by scripts/db-*.sh).
#
# Same posting pattern as web/scripts/cron-runner.sh: token + chat id are read
# from the gitignored web/.env at call time (an exported env var wins), never
# echoed, never written to any log. Silent no-op when either is missing so a
# missing token can never turn a backup failure into a script crash.
#
# Usage:
#   source /home/dovanlong/blockid.au/scripts/lib/ops-alert.sh
#   ops_alert "⚠️ *DB backup failed*" "detail line"

OPS_REPO_ROOT="${OPS_REPO_ROOT:-/home/dovanlong/blockid.au}"

ops_env_val() {
  grep -E "^$1=" "$OPS_REPO_ROOT/web/.env" "$OPS_REPO_ROOT/web/.env.runtime" 2>/dev/null \
    | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

ops_alert() {
  local title="$1" detail="${2:-}"
  local bot chat
  bot="${TELEGRAM_BOT_TOKEN:-$(ops_env_val TELEGRAM_BOT_TOKEN)}"
  chat="${TELEGRAM_CHAT_ID:-$(ops_env_val TELEGRAM_CHAT_ID)}"
  [ -z "$bot" ] || [ -z "$chat" ] && return 0
  local msg
  msg="$title
⏰ $(date -u '+%Y-%m-%dT%H:%M:%SZ')
🖥️ $(hostname -s 2>/dev/null || echo blockid)
$(printf '%s' "$detail" | head -c 400)"
  curl -s --max-time 15 "https://api.telegram.org/bot${bot}/sendMessage" \
    -d "chat_id=$chat" \
    --data-urlencode "text=$msg" \
    -d "parse_mode=Markdown" \
    -d "disable_web_page_preview=true" > /dev/null 2>&1 || true
}

# Append one row to cron-health.jsonl so cron-alarm.sh / /api/status crons
# catalogue see file-based jobs exactly like HTTP crons.
ops_cron_health() {
  local endpoint="$1" status="$2" duration_ms="${3:-0}" detail="${4:-}"
  local f="$OPS_REPO_ROOT/web/content/reports/cron-health.jsonl"
  mkdir -p "$(dirname "$f")"
  local esc
  esc=$(printf '%s' "$detail" | head -c 300 | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\n')
  printf '{"ts":"%s","endpoint":"%s","status":"%s","duration_ms":%s,"detail":"%s"}\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$endpoint" "$status" "$duration_ms" "$esc" >> "$f" 2>/dev/null || true
}
