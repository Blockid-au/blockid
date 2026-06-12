#!/bin/bash
# BlockID.au — Git Sync + Deploy
#
# Pulls latest from GitHub master, deploys if there are new commits.
# Also pushes any local-only commits to GitHub.
#
# Usage: bash scripts/git-sync-deploy.sh
# Safe to run from cron — skips if no changes or deploy lock exists.

set -u

WEB_DIR="/home/dovanlong/blockid.au/web"
LOCK="/tmp/blockid-deploy.lock"
LOG="/tmp/blockid-cron.log"
TELEGRAM_BOT="8866491988:AAF24ixnoNFzubydEARc28klTd0lw1V5fCk"
TELEGRAM_CHAT="${TELEGRAM_CHAT_ID:-539796782}"

log() { echo "$(date -u '+%m-%d %H:%M') git-sync: $1" >> "$LOG"; }

cd "$WEB_DIR" || exit 0

# Skip if deploy already in progress
if [ -f "$LOCK" ]; then
  log "skip — deploy lock exists"
  exit 0
fi

# Step 1: Push any local-only commits to GitHub
LOCAL_AHEAD=$(git rev-list github/master..HEAD 2>/dev/null | wc -l)
if [ "$LOCAL_AHEAD" -gt 0 ]; then
  log "pushing $LOCAL_AHEAD local commits to GitHub"
  if git push github master 2>/dev/null; then
    log "push OK ($LOCAL_AHEAD commits)"
  else
    log "push FAILED"
  fi
fi

# Step 2: Pull from GitHub (fast-forward only)
git fetch github master --quiet 2>/dev/null
REMOTE_AHEAD=$(git rev-list HEAD..github/master 2>/dev/null | wc -l)

if [ "$REMOTE_AHEAD" -eq 0 ]; then
  log "in sync — no new commits from GitHub"
  exit 0
fi

log "pulling $REMOTE_AHEAD new commits from GitHub"
if ! git merge github/master --ff-only 2>/dev/null; then
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
