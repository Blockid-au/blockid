#!/bin/bash
# BlockID.au — Autonomous Self-Upgrade Agent
#
# Uses the Claude Code SUBSCRIPTION (OAuth in ~/.claude/.credentials.json) — NOT
# API credits — to implement ONE high-value improvement per run, then deploys it
# through the gated pipeline (deploy-live.sh: tsc + lint + build + smoke +
# integrity + lock + last-known-good). Only a build that passes ALL gates is
# pushed to GitHub; a failing one is reverted locally and never reaches origin.
#
# Usage:
#   bash scripts/self-upgrade-agent.sh            # full: implement → deploy → push
#   bash scripts/self-upgrade-agent.sh --dry-run  # implement → revert (no deploy/push)
#
# Schedule: daily (cron). Safe to run from cron — skips if a deploy is in progress.

set -u

REPO="/home/dovanlong/blockid.au"
WEB_DIR="$REPO/web"
LOG="/tmp/blockid-self-upgrade.log"
DEPLOY_LOG="/tmp/blockid-self-upgrade-deploy.log"
LOCK="/tmp/blockid-deploy.lock"
TG_BOT="8866491988:AAF24ixnoNFzubydEARc28klTd0lw1V5fCk"
TG_CHAT="${TELEGRAM_CHAT_ID:-539796782}"
DRY_RUN="${1:-}"
TIMEOUT_S=1500   # 25 min cap for the Claude session

log()  { echo "$(date -u '+%m-%d %H:%M') self-upgrade: $1" >> "$LOG"; }
tg()   { curl -s "https://api.telegram.org/bot$TG_BOT/sendMessage" -d "chat_id=$TG_CHAT" --data-urlencode "text=$1" -d parse_mode=Markdown -d disable_web_page_preview=true >/dev/null 2>&1; }

# Rotate log at 200KB
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 200000 ] && { tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; }

cd "$REPO" || { log "repo missing"; exit 0; }

# Skip if a deploy is already running. NB: the lock FILE always exists after the
# first deploy; check whether it's actually HELD (flock), not just present.
if command -v flock >/dev/null 2>&1 && ! flock -n "$LOCK" -c true 2>/dev/null; then
  log "skip — deploy in progress (lock held)"; exit 0
fi

# Ensure the Claude OAuth subscription token is fresh (guardian also does this).
bash "$WEB_DIR/scripts/refresh-claude-oauth.sh" >/dev/null 2>&1 || true

# Sync to GitHub master so we build on the latest committed state.
git fetch origin master -q 2>/dev/null || true
git merge --ff-only origin/master -q 2>/dev/null || true
HEAD_BEFORE=$(git rev-parse HEAD 2>/dev/null)

log "starting Claude (subscription) self-upgrade run${DRY_RUN:+ [$DRY_RUN]}"

PROMPT='You are the BlockID.au autonomous self-improvement engineer. Repo root: /home/dovanlong/blockid.au (the Next.js app is in web/). Production deploys automatically via a gated pipeline after you commit.

GOAL: make exactly ONE concrete, high-value, LOW-RISK improvement to the codebase this run, then commit it.

STEP 1 — Read the CEO implementing plan and project state FIRST:
  cat /home/dovanlong/blockid.au/web/content/reports/implementing-plan.md
  cat /home/dovanlong/blockid.au/web/content/reports/project-state.json

STEP 2 — Pick the highest-priority PENDING task from project-state.json that is:
  (a) small enough to implement safely in 1-3 files, and
  (b) not blocked by another pending task.
  If no pending task is safe to ship alone, fall back to: bug fix → UX polish → SEO → test → copy improvement.

PRIORITY ORDER (from project-state.json pending tasks):
  T0010 — Berkus method + AU comparables in cfo-valuation.ts (add 5th valuation method for pre-revenue)
  T0012 — Onboarding wizard: 3-step welcome modal for new users after first login
  T0011 — Weekly SEO roundup post template for publish-insight cron
  T0003 — Pilot valuation model improvement (≥10% AI budget, per existing rationale)

Also look at: web/content/reports/*.md (agent research/insights) and recent git log for ideas.

HARD RULES:
- Keep the change FOCUSED and small (ideally 1-3 files). Do NOT do sweeping refactors.
- NEVER touch secrets/.env, auth, payments/Stripe, equity/cap-table math, or blockchain/contract core logic.
- NEVER implement, enable, schedule, or trigger anything that SPENDS MONEY — especially PAID ADVERTISING (Google/Meta/TikTok Ads, boosted or sponsored posts, paid campaigns, ad-account spend). Marketing must stay 100% organic (SEO, content, email we already own). No automated paid posts of any kind.
- It MUST compile and lint: run `cd /home/dovanlong/blockid.au/web && npx tsc --noEmit` and `npm run lint` and fix any errors you introduced before committing.
- Stage ONLY the files you changed (git add <those files>), then commit with a clear message prefixed `feat(auto):` or `fix(auto):`. Do NOT push and do NOT run any deploy script — the wrapper handles deploy.
- If you cannot find a safe, worthwhile improvement, make NO commit and stop.

Work autonomously end-to-end, then stop.'

timeout "$TIMEOUT_S" claude -p "$PROMPT" \
  --permission-mode bypassPermissions \
  --no-session-persistence >> "$LOG" 2>&1
CLAUDE_EXIT=$?
[ $CLAUDE_EXIT -ne 0 ] && log "claude exited $CLAUDE_EXIT (timeout/err) — continuing to check for commit"

HEAD_AFTER=$(git rev-parse HEAD 2>/dev/null)
if [ "$HEAD_BEFORE" = "$HEAD_AFTER" ]; then
  log "no improvement committed this run"
  exit 0
fi
MSG=$(git log -1 --pretty=%s)
log "agent committed: $MSG"

# Dry run: prove the agent works without touching production.
if [ "$DRY_RUN" = "--dry-run" ]; then
  git reset --hard "$HEAD_BEFORE" -q
  log "DRY RUN — reverted commit, no deploy"
  exit 0
fi

# Gated deploy. deploy-live.sh keeps the last-known-good build on any gate failure.
DEPLOY_NOTE="Auto-upgrade (Claude subscription): $MSG" bash "$WEB_DIR/scripts/deploy-live.sh" > "$DEPLOY_LOG" 2>&1
DEPLOY_EXIT=$?

if [ $DEPLOY_EXIT -eq 0 ] && grep -q "DEPLOY COMPLETE" "$DEPLOY_LOG"; then
  git push origin master -q 2>/dev/null && log "deployed + pushed to GitHub: $MSG"
  tg "🤖 *Auto-upgrade deployed*
✅ $MSG
(gates passed, pushed to GitHub)"
else
  GATE=$(grep -E "GATE FAILED|Build failed|errors" "$DEPLOY_LOG" | head -1)
  git reset --hard "$HEAD_BEFORE" -q
  log "deploy FAILED gates — reverted: $MSG | $GATE"
  tg "⚠️ *Auto-upgrade reverted* (failed gates)
❌ $MSG
$GATE"
fi
