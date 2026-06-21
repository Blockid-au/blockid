#!/bin/bash
# weekly-disk-cleanup.sh — prune stale build artefacts, logs, and Docker state.
#
# Scope:
#   - /tmp/blockid-build-*.log and /tmp/blockid-deploy-*.log older than 7 days
#   - /tmp/blockid-cron.log truncated if > 5 MB (rotation also lives in cron-runner.sh)
#   - Docker: dangling images + stopped containers + unused build cache
#   - journalctl vacuum keeping last 14 days
#   - web/content/reports/*.jsonl truncated to last 5000 lines when over 10 MB
#   - .next-backup directories under web/ removed entirely
#   - web/releases/ kept to last 10 builds (Next.js standalone snapshots)
#
# Runs on the host (not in Docker). Idempotent — re-running is safe.
# Outputs a single summary line per section for the cron-runner log.

set -uo pipefail

PROJECT_DIR="/home/dovanlong/blockid.au"
WEB_DIR="$PROJECT_DIR/web"
LOG_DIR="$PROJECT_DIR/web/content/reports"
RUN_LOG="/tmp/weekly-disk-cleanup-$(date +%Y%m%d).log"
exec >>"$RUN_LOG" 2>&1

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
note() { echo "[$(ts)] $*"; }

note "── weekly-disk-cleanup start ──"
BEFORE_PCT=$(df / | awk 'NR==2 {sub("%",""); print $5}')
BEFORE_AVAIL=$(df -h / | awk 'NR==2 {print $4}')
note "root usage before: ${BEFORE_PCT}% (avail ${BEFORE_AVAIL})"

# ── 1. /tmp build/deploy logs older than 7d ─────────────────────────────────
TMP_REMOVED=$(find /tmp -maxdepth 1 -type f \( -name "blockid-build-*.log" -o -name "blockid-deploy-*.log" -o -name "weekly-disk-cleanup-*.log" \) -mtime +7 -print -delete 2>/dev/null | wc -l)
note "removed $TMP_REMOVED old /tmp/blockid-*.log files"

# Truncate the live cron log if it grew above 5 MB.
if [ -f /tmp/blockid-cron.log ]; then
  SIZE=$(stat -c %s /tmp/blockid-cron.log 2>/dev/null || echo 0)
  if [ "$SIZE" -gt 5242880 ]; then
    tail -c 1048576 /tmp/blockid-cron.log > /tmp/blockid-cron.log.tmp && mv /tmp/blockid-cron.log.tmp /tmp/blockid-cron.log
    note "truncated /tmp/blockid-cron.log (was ${SIZE} bytes)"
  fi
fi

# ── 2. Docker prune (safe: only dangling + unused build cache) ───────────────
if command -v docker >/dev/null 2>&1; then
  IMG_OUT=$(docker image prune -f 2>&1 | tail -1)
  note "docker image prune: $IMG_OUT"
  CTR_OUT=$(docker container prune -f 2>&1 | tail -1)
  note "docker container prune: $CTR_OUT"
  # Build cache untagged > 7 days
  BC_OUT=$(docker builder prune -f --filter "until=168h" 2>&1 | tail -1)
  note "docker builder prune: $BC_OUT"
fi

# ── 3. journalctl vacuum (keep 14d) ──────────────────────────────────────────
if command -v journalctl >/dev/null 2>&1; then
  JOUT=$(sudo -n journalctl --vacuum-time=14d 2>&1 | tail -1)
  note "journalctl: $JOUT"
fi

# ── 4. Trim big JSONL state files ────────────────────────────────────────────
if [ -d "$LOG_DIR" ]; then
  TRIM_COUNT=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    SIZE=$(stat -c %s "$f" 2>/dev/null || echo 0)
    if [ "$SIZE" -gt 10485760 ]; then
      tail -n 5000 "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"
      TRIM_COUNT=$((TRIM_COUNT + 1))
    fi
  done < <(find "$LOG_DIR" -maxdepth 1 -type f -name "*.jsonl" 2>/dev/null)
  note "trimmed $TRIM_COUNT large JSONL files in content/reports"
fi

# ── 5. Remove .next-backup directories ───────────────────────────────────────
BACKUP_REMOVED=0
while IFS= read -r d; do
  [ -z "$d" ] && continue
  rm -rf "$d" && BACKUP_REMOVED=$((BACKUP_REMOVED + 1))
done < <(find "$WEB_DIR" -maxdepth 2 -type d -name ".next-backup" 2>/dev/null)
note "removed $BACKUP_REMOVED .next-backup dirs"

# ── 6. web/releases — keep last 10 standalone snapshots ──────────────────────
if [ -d "$WEB_DIR/releases" ]; then
  RELEASE_REMOVED=0
  while IFS= read -r d; do
    [ -z "$d" ] && continue
    rm -rf "$d" && RELEASE_REMOVED=$((RELEASE_REMOVED + 1))
  done < <(ls -1dt "$WEB_DIR"/releases/*/ 2>/dev/null | tail -n +11)
  note "removed $RELEASE_REMOVED old release snapshots (kept latest 10)"
fi

AFTER_PCT=$(df / | awk 'NR==2 {sub("%",""); print $5}')
AFTER_AVAIL=$(df -h / | awk 'NR==2 {print $4}')
DELTA=$((BEFORE_PCT - AFTER_PCT))
note "root usage after:  ${AFTER_PCT}% (avail ${AFTER_AVAIL}) — freed ${DELTA}%"
note "── weekly-disk-cleanup done ──"

# Emit one JSON-line summary to content/reports for the daily-admin-report.
SUMMARY_FILE="$LOG_DIR/disk-cleanup-history.jsonl"
mkdir -p "$LOG_DIR"
cat <<EOF >>"$SUMMARY_FILE"
{"ts":"$(ts)","before_pct":${BEFORE_PCT},"after_pct":${AFTER_PCT},"delta_pct":${DELTA},"tmp_logs_removed":${TRIM_COUNT:-0},"backup_removed":${BACKUP_REMOVED},"releases_removed":${RELEASE_REMOVED:-0}}
EOF
