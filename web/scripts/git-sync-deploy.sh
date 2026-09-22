#!/bin/bash
# BlockID.au — Git Sync + Deploy
#
# Pulls latest from GitHub master, deploys if there are new commits.
# Also pushes any local-only commits to GitHub.
#
# Usage: bash scripts/git-sync-deploy.sh
# Safe to run from cron — skips if no changes or deploy lock exists.

set -u

# G30/P01: scheduled legacy writers yield to the approved implementation.
# Validate before env reads, logging, fetching or any workspace mutation.
# Missing/malformed control fails closed; only an explicit released handoff runs.
G30_CONTROL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/docs/plans/g30-execution-control.json"
g30_writer_guard() {
  local decision
  decision=$(python3 - "$G30_CONTROL" <<'G30_PY'
import json, sys
try:
    with open(sys.argv[1]) as handle:
        value = json.load(handle)
    valid = (isinstance(value, dict) and type(value.get("version")) is int
             and value["version"] == 1 and value.get("owner") == "g30"
             and value.get("source_of_truth") == "docs/plans/SOURCE-OF-TRUTH.md"
             and value.get("status") in ("active", "released"))
    print(value["status"] if valid else "invalid")
except Exception:
    print("invalid")
G30_PY
  ) || decision=invalid
  case "$decision" in
    released) return 0 ;;
    active) printf '%s\n' 'G30 owns implementation; legacy writer deferred.' >&2; exit 0 ;;
    *) printf '%s\n' 'G30 execution control unavailable/invalid; legacy writer refused.' >&2; exit 1 ;;
  esac
}
g30_writer_guard
# END G30 admission guard

WEB_DIR="/home/dovanlong/blockid.au/web"
LOCK="/tmp/blockid-deploy.lock"
LOG="/tmp/blockid-cron.log"
# Secret read from the gitignored .env (never hardcoded in committed scripts).
env_val() { grep -E "^$1=" "$WEB_DIR/.env" "$WEB_DIR/.env.runtime" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
TELEGRAM_BOT="${TELEGRAM_BOT_TOKEN:-$(env_val TELEGRAM_BOT_TOKEN)}"
TELEGRAM_CHAT="${TELEGRAM_CHAT_ID:-$(env_val TELEGRAM_CHAT_ID)}"

log() { echo "$(date -u '+%m-%d %H:%M') git-sync: $1" >> "$LOG"; }

cd "$WEB_DIR" || exit 0

# Skip if deploy already in progress
if [ -f "$LOCK" ]; then
  log "skip — deploy lock exists"
  exit 0
fi

# Step 1: Push any local-only commits to GitHub
LOCAL_AHEAD=$(git rev-list origin/master..HEAD 2>/dev/null | wc -l)
if [ "$LOCAL_AHEAD" -gt 0 ]; then
  log "pushing $LOCAL_AHEAD local commits to GitHub"
  g30_writer_guard
  if git push origin master 2>/dev/null; then
    log "push OK ($LOCAL_AHEAD commits)"
  else
    log "push FAILED"
  fi
fi

# Step 2: Pull from GitHub (fast-forward only)
g30_writer_guard
git fetch origin master --quiet 2>/dev/null
REMOTE_AHEAD=$(git rev-list HEAD..origin/master 2>/dev/null | wc -l)

if [ "$REMOTE_AHEAD" -eq 0 ]; then
  log "in sync — no new commits from GitHub"
  exit 0
fi

log "pulling $REMOTE_AHEAD new commits from GitHub"
g30_writer_guard
if ! git merge origin/master --ff-only 2>/dev/null; then
  log "merge FAILED — non-fast-forward, needs manual resolution"
  # Alert via Telegram
  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage" \
    -d "chat_id=$TELEGRAM_CHAT" \
    -d "text=⚠️ *Git Sync Failed*: Non-fast-forward merge from GitHub. Manual resolution needed." \
    -d "parse_mode=Markdown" > /dev/null 2>&1
  exit 0
fi

# Step 3: Deploy
log "deploying after GitHub sync ($REMOTE_AHEAD commits)"
g30_writer_guard
DEPLOY_NOTE="GitHub sync: $REMOTE_AHEAD commits" bash scripts/deploy-live.sh >> /tmp/blockid-sync-deploy.log 2>&1
DEPLOY_EXIT=$?

if [ $DEPLOY_EXIT -eq 0 ]; then
  log "deploy OK"
  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage" \
    -d "chat_id=$TELEGRAM_CHAT" \
    -d "text=🔄 *Git Sync Deploy*: Pulled $REMOTE_AHEAD commits from GitHub → deployed successfully." \
    -d "parse_mode=Markdown" > /dev/null 2>&1
else
  log "deploy FAILED (exit $DEPLOY_EXIT)"
  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage" \
    -d "chat_id=$TELEGRAM_CHAT" \
    -d "text=❌ *Git Sync Deploy Failed*: Pulled $REMOTE_AHEAD commits but deploy failed (exit $DEPLOY_EXIT)." \
    -d "parse_mode=Markdown" > /dev/null 2>&1
fi

exit 0
