#!/bin/bash
# BlockID.au — SCN Goal Auto-Builder
#
# Autonomously implements the SCN "Startup Navigation System" goal end-to-end:
# each iteration uses the Claude Code SUBSCRIPTION (OAuth, not API) to build the
# NEXT unfinished SCN feature, then runs the gated pipeline (tsc+lint+build+smoke
# +integrity) and — only if all gates pass — deploys live and pushes to GitHub.
# A failing build is reverted locally and never reaches origin. Telegram per step.
#
# The goal/spec: .claude/goals/scn-startup-navigation-system.md
# The C-level plan (already merged): web/content/reports/ceo-current-plan.json
#
# Usage: bash scripts/scn-build-agent.sh [maxFeatures]   (default 4)

set -u
REPO="/home/dovanlong/blockid.au"
WEB_DIR="$REPO/web"
LOG="/tmp/blockid-scn-build.log"
DEPLOY_LOG="/tmp/blockid-scn-deploy.log"
LOCK="/tmp/blockid-deploy.lock"
TG_BOT="8866491988:AAF24ixnoNFzubydEARc28klTd0lw1V5fCk"
TG_CHAT="${TELEGRAM_CHAT_ID:-539796782}"
MAX="${1:-4}"
TIMEOUT_S=1500

log(){ echo "$(date -u '+%m-%d %H:%M') scn-build: $1" >> "$LOG"; }
tg(){ curl -s "https://api.telegram.org/bot$TG_BOT/sendMessage" -d "chat_id=$TG_CHAT" --data-urlencode "text=$1" -d parse_mode=Markdown -d disable_web_page_preview=true >/dev/null 2>&1; }

cd "$REPO" || exit 0
bash "$WEB_DIR/scripts/refresh-claude-oauth.sh" >/dev/null 2>&1 || true
tg "🧭 *SCN auto-build started* — implementing up to $MAX features (gated deploy + push)."

PROMPT='You are the BlockID.au autonomous engineer building the SCN "Startup Navigation System" goal. Read the spec at /home/dovanlong/blockid.au/.claude/goals/scn-startup-navigation-system.md and the C-level plan at /home/dovanlong/blockid.au/web/content/reports/ceo-current-plan.json.

Implement the SINGLE highest-value SCN feature that is NOT yet built, end-to-end, then commit. Priority order: (1) POSITION hero — Startup Index + Stage + "Top X% of AU startups" percentile placed above valuation; (2) DIRECTION Next-Best-Action navigation (You are here → Next → Then), Google-Maps style, driven by weakest SCN layer + stage; (3) VALIDATION panel for early startups; (4) Funding Readiness % gauge; (5) reframe copy to "Startup Navigation System". The Next.js app is in web/.

HARD RULES:
- Keep the change FOCUSED (a few files). One feature per run. Reuse existing SVI/dashboard components and data.
- NEVER touch secrets/.env, auth, payments/Stripe, equity/cap-table math, or blockchain core.
- NEVER add anything that spends money / paid ads.
- It MUST compile + lint: run `cd /home/dovanlong/blockid.au/web && npx tsc --noEmit` and `npm run lint` and fix what you introduced before committing.
- Stage ONLY the files you changed and commit with a clear message prefixed `feat(scn):`. Do NOT push and do NOT run any deploy script — the wrapper deploys.
- If ALL SCN features already exist, make NO commit and reply exactly: SCN_COMPLETE.

Work autonomously end-to-end, then stop.'

BUILT=0
for n in $(seq 1 "$MAX"); do
  # Skip if a deploy is genuinely in progress.
  if command -v flock >/dev/null 2>&1 && ! flock -n "$LOCK" -c true 2>/dev/null; then
    log "iteration $n: deploy lock held — waiting 60s"; sleep 60
  fi
  git fetch origin master -q 2>/dev/null || true
  git merge --ff-only origin/master -q 2>/dev/null || true
  HEAD_BEFORE=$(git rev-parse HEAD)

  log "iteration $n/$MAX — Claude implementing next SCN feature"
  OUT=$(timeout "$TIMEOUT_S" claude -p "$PROMPT" --permission-mode bypassPermissions --no-session-persistence 2>&1)
  echo "$OUT" | tail -3 >> "$LOG"

  if echo "$OUT" | grep -q "SCN_COMPLETE"; then
    log "Claude reports SCN_COMPLETE — stopping"; tg "✅ *SCN auto-build:* all features built ($BUILT this session)."; break
  fi

  HEAD_AFTER=$(git rev-parse HEAD)
  if [ "$HEAD_BEFORE" = "$HEAD_AFTER" ]; then
    log "iteration $n: no commit made — stopping"; break
  fi
  MSG=$(git log -1 --pretty=%s)
  log "committed: $MSG — deploying (gated)"

  DEPLOY_NOTE="SCN auto-build: $MSG" bash "$WEB_DIR/scripts/deploy-live.sh" > "$DEPLOY_LOG" 2>&1
  if [ $? -eq 0 ] && grep -q "DEPLOY COMPLETE" "$DEPLOY_LOG"; then
    git push origin master -q 2>/dev/null && { BUILT=$((BUILT+1)); log "LIVE + pushed: $MSG"; tg "🚀 *SCN live:* $MSG"; }
  else
    GATE=$(grep -E "GATE FAILED|Build failed|error TS" "$DEPLOY_LOG" | head -1)
    git reset --hard "$HEAD_BEFORE" -q
    log "deploy FAILED — reverted: $MSG | $GATE"; tg "⚠️ *SCN reverted* (gates): $MSG"
  fi
done

log "SCN auto-build finished — $BUILT feature(s) shipped this session"
tg "🧭 *SCN auto-build done* — $BUILT feature(s) shipped live this session."
