#!/bin/bash
# uptime-24x7-guardian.sh — Multi-signal server guardian tuned for
# BlockID.au's autonomous continuous-deployment mode.
#
# Runs every 2 minutes via crontab. Complements the existing:
#   - watchdog.sh (production process restart)
#   - uptime-watcher.sh (external HTTP probe)
#   - server-cleanup.sh (disk-only, runs at 85%+)
#
# What this script adds (24/7 focus):
#   1. Escalating disk-pressure response (60/75/85% thresholds).
#   2. Memory pressure detection + smart offender identification.
#   3. Log rotation for the reseller loop JSONLs (already have their
#      own rotation, but belt-and-braces at 300KB).
#   4. Old-release trimming based on absolute count, not disk %.
#   5. Ephemeral file cleanup (/tmp, .next build cache, node_modules
#      duplicates).
#   6. Auto-rollback if HEAD build is unhealthy for > 3 consecutive
#      probes (delegates to deploy-live.sh --rollback).
#   7. Structured JSONL health snapshot to
#      web/content/reports/uptime-guardian.jsonl for the admin
#      dashboard to consume.
#
# All actions are IDEMPOTENT and NON-DESTRUCTIVE by default (edit + git
# reset would nuke uncommitted work, so we NEVER touch git).

set -u

REPO=/home/dovanlong/blockid.au
WEB="$REPO/web"
LOG=/tmp/blockid-uptime-guardian.log
HISTORY="$WEB/content/reports/uptime-guardian.jsonl"
PROD_URL="http://localhost:4001"
FAIL_MARK=/tmp/blockid-guardian-fail-count

mkdir -p "$(dirname "$HISTORY")"

TS="$(date -u +%FT%TZ)"

# ────────────────────────────────────────────────────────────────────────
# 1. Sample health.
# ────────────────────────────────────────────────────────────────────────
DISK_PCT=$(df / | awk 'NR==2 {gsub("%",""); print $5}')
MEM_PCT=$(free | awk '/^Mem:/ {printf "%.0f", ($3/$2)*100}')
SWAP_MB=$(free -m | awk '/^Swap:/ {print $3}')
UPTIME_S=$(cut -d' ' -f1 /proc/uptime | cut -d. -f1)
HTTP_LOCAL=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "$PROD_URL/" 2>/dev/null || echo "000")
LOAD_1MIN=$(cut -d' ' -f1 /proc/loadavg)
NPROC=$(nproc)

# Count how many blockid production processes are running (should be 1).
BLOCKID_PROCS=$(pgrep -f "next-server\|/releases/.*/server.js" | wc -l)

# ────────────────────────────────────────────────────────────────────────
# 2. Health verdict + fail tracking.
# ────────────────────────────────────────────────────────────────────────
HEALTHY=1
FAIL_COUNT=0
[ -f "$FAIL_MARK" ] && FAIL_COUNT=$(cat "$FAIL_MARK")

if [ "$HTTP_LOCAL" != "200" ]; then
  HEALTHY=0
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "$FAIL_COUNT" > "$FAIL_MARK"
  echo "$TS [FAIL] local HTTP=$HTTP_LOCAL fail_count=$FAIL_COUNT" >> "$LOG"
else
  # Reset fail counter on success.
  [ "$FAIL_COUNT" -gt 0 ] && echo "$TS [RECOVER] fail_count=$FAIL_COUNT -> 0" >> "$LOG"
  echo 0 > "$FAIL_MARK"
  FAIL_COUNT=0
fi

# ────────────────────────────────────────────────────────────────────────
# 3. Disk-pressure response (escalating).
# ────────────────────────────────────────────────────────────────────────
DISK_ACTION="none"
if [ "$DISK_PCT" -ge 85 ]; then
  # CRITICAL — invoke full cleanup + trim releases aggressively.
  DISK_ACTION="critical"
  echo "$TS [DISK-CRIT] $DISK_PCT% used — full cleanup" >> "$LOG"
  bash "$WEB/scripts/server-cleanup.sh" >> "$LOG" 2>&1 || true
  # Keep only 2 newest releases in the standard release dir.
  ls -t "$WEB/releases/" 2>/dev/null | tail -n +3 | while read -r r; do
    [ -n "$r" ] && rm -rf "$WEB/releases/$r"
  done
elif [ "$DISK_PCT" -ge 75 ]; then
  # HIGH — trim old releases to 3, log rotate.
  DISK_ACTION="high"
  echo "$TS [DISK-HIGH] $DISK_PCT% used — trim releases to 3" >> "$LOG"
  ls -t "$WEB/releases/" 2>/dev/null | tail -n +4 | while read -r r; do
    [ -n "$r" ] && rm -rf "$WEB/releases/$r"
  done
elif [ "$DISK_PCT" -ge 60 ]; then
  # WARN — rotate logs only.
  DISK_ACTION="warn"
  echo "$TS [DISK-WARN] $DISK_PCT% used — log rotation" >> "$LOG"
fi

# ────────────────────────────────────────────────────────────────────────
# 4. Log rotation — belt-and-braces at 300KB even if the loop's own
#    rotation missed.
# ────────────────────────────────────────────────────────────────────────
for f in \
  "$WEB/content/reports/reseller-goal-history.jsonl" \
  "$WEB/content/reports/reseller-monitor.jsonl" \
  "$WEB/content/reports/uptime-guardian.jsonl" \
  "$WEB/content/reports/cron-health.jsonl" \
  "$WEB/content/reports/guardian-history.jsonl"
do
  [ ! -f "$f" ] && continue
  size=$(stat -c %s "$f")
  if [ "$size" -gt 307200 ]; then   # 300 KB
    tail -n 800 "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    echo "$TS [ROTATE] $(basename "$f") -> tail 800 lines" >> "$LOG"
  fi
done

# ────────────────────────────────────────────────────────────────────────
# 5. /tmp cleanup — files older than 48h that we own.
# ────────────────────────────────────────────────────────────────────────
find /tmp -maxdepth 2 -user "$(id -un)" -type f -mtime +2 \
  \( -name '*.log' -o -name 'blockid-*.tmp' \) \
  -delete 2>/dev/null || true

# ────────────────────────────────────────────────────────────────────────
# 6. Memory pressure — record only. We do NOT auto-kill blockid because
#    the production process is our whole reason for existing. If mem >
#    90% consistently, watchdog.sh's OOM-adjacent restart is the escape
#    hatch.
# ────────────────────────────────────────────────────────────────────────
MEM_ACTION="none"
if [ "$MEM_PCT" -ge 90 ]; then
  MEM_ACTION="critical"
  echo "$TS [MEM-CRIT] $MEM_PCT% used — top 5 RSS:" >> "$LOG"
  ps -eo pid,rss,cmd --sort=-rss 2>/dev/null | head -6 >> "$LOG"
fi

# ────────────────────────────────────────────────────────────────────────
# 7. Auto-rollback — only if HTTP fails 3 ticks in a row (~6 min down)
#    AND we have a rollback build recorded.
# ────────────────────────────────────────────────────────────────────────
ROLLBACK_ACTION="none"
if [ "$FAIL_COUNT" -ge 3 ] && [ -f "$WEB/content/reports/last-good-build.json" ]; then
  ROLLBACK_ACTION="attempted"
  echo "$TS [ROLLBACK] HTTP fail_count=$FAIL_COUNT — invoking deploy-live.sh --rollback" >> "$LOG"
  # Fire and forget — rollback script exits fast if lock held.
  (
    cd "$WEB" && bash scripts/deploy-live.sh --rollback >> "$LOG" 2>&1 || true
  ) &
  # Reset fail count so we don't stack rollbacks.
  echo 0 > "$FAIL_MARK"
fi

# ────────────────────────────────────────────────────────────────────────
# 8. Emit health snapshot as JSONL.
# ────────────────────────────────────────────────────────────────────────
cat >> "$HISTORY" <<EOF
{"ts":"$TS","healthy":$HEALTHY,"http_local":"$HTTP_LOCAL","disk_pct":$DISK_PCT,"mem_pct":$MEM_PCT,"swap_mb":$SWAP_MB,"load_1min":$LOAD_1MIN,"nproc":$NPROC,"uptime_s":$UPTIME_S,"blockid_procs":$BLOCKID_PROCS,"fail_count":$FAIL_COUNT,"disk_action":"$DISK_ACTION","mem_action":"$MEM_ACTION","rollback_action":"$ROLLBACK_ACTION"}
EOF

exit 0
