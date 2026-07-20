#!/bin/bash
# BlockID.au — Backup Verify (daily)
#
# Runs 04:00 AEST (18:00 UTC). Confirms:
#   1. A DB dump under /data/backups (*.sql.gz | *.sql | *.dump) exists and is
#      less than 24h old.
#   2. A release snapshot dir under /data/blockid-releases/ exists (any age —
#      snapshots only rotate on deploy, so a quiet week is fine).
#
# Appends one line per run to web/content/reports/backup-health.jsonl.
# Also emits a cron-health.jsonl entry so cron-alarm.sh surfaces FAILs into
# cron-incidents.jsonl (dedup + Telegram happens there — this script never
# alerts directly).
#
# Exit 0 ALWAYS — cron mail is not the alerting channel.

set -u

REPO_ROOT="/home/dovanlong/blockid.au"
BACKUP_DIR="/data/backups"
RELEASES_DIR="/data/blockid-releases"
HEALTH_LOG="$REPO_ROOT/web/content/reports/backup-health.jsonl"
CRON_HEALTH="$REPO_ROOT/web/content/reports/cron-health.jsonl"

NOW_EPOCH=$(date -u +%s)
NOW_ISO=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
MAX_DB_AGE_HOURS=24

mkdir -p "$(dirname "$HEALTH_LOG")"

# ── 1. Latest DB dump ────────────────────────────────────────────────
db_latest=""
db_size=0
db_age_hours=-1
db_ok=false

if [ -d "$BACKUP_DIR" ]; then
  # newest matching file by mtime
  db_latest=$(find "$BACKUP_DIR" -type f \( -name '*.sql.gz' -o -name '*.sql' -o -name '*.dump' \) \
    -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)
fi

if [ -n "$db_latest" ] && [ -f "$db_latest" ]; then
  db_mtime=$(stat -c%Y "$db_latest" 2>/dev/null || echo 0)
  db_size=$(stat -c%s "$db_latest" 2>/dev/null || echo 0)
  db_age_hours=$(( (NOW_EPOCH - db_mtime) / 3600 ))
  if [ "$db_age_hours" -lt "$MAX_DB_AGE_HOURS" ] && [ "$db_size" -gt 0 ]; then
    db_ok=true
  fi
fi

# ── 2. Latest release snapshot ───────────────────────────────────────
rel_latest=""
rel_age_hours=-1
rel_ok=false

if [ -d "$RELEASES_DIR" ]; then
  rel_latest=$(find "$RELEASES_DIR" -maxdepth 1 -mindepth 1 -type d \
    -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)
fi

if [ -n "$rel_latest" ] && [ -d "$rel_latest" ]; then
  rel_mtime=$(stat -c%Y "$rel_latest" 2>/dev/null || echo 0)
  rel_age_hours=$(( (NOW_EPOCH - rel_mtime) / 3600 ))
  rel_ok=true
fi

# ── Emit backup-health.jsonl ─────────────────────────────────────────
db_latest_name="${db_latest##*/}"
rel_latest_name="${rel_latest##*/}"

if command -v jq >/dev/null 2>&1; then
  jq -nc \
    --arg ts "$NOW_ISO" \
    --arg dbf "$db_latest_name" --argjson dbh "$db_age_hours" --argjson dbz "$db_size" --argjson dbok "$db_ok" \
    --arg rlf "$rel_latest_name" --argjson rlh "$rel_age_hours" --argjson rlok "$rel_ok" \
    '{ts:$ts,
      db:{latest:$dbf, ageHours:$dbh, sizeBytes:$dbz, ok:$dbok},
      release:{latest:$rlf, ageHours:$rlh, ok:$rlok}}' \
    >> "$HEALTH_LOG"
else
  # jq-free fallback (should never hit — jq is on every box)
  printf '{"ts":"%s","db":{"latest":"%s","ageHours":%d,"sizeBytes":%d,"ok":%s},"release":{"latest":"%s","ageHours":%d,"ok":%s}}\n' \
    "$NOW_ISO" "$db_latest_name" "$db_age_hours" "$db_size" "$db_ok" \
    "$rel_latest_name" "$rel_age_hours" "$rel_ok" \
    >> "$HEALTH_LOG"
fi

# ── Mirror status into cron-health.jsonl so cron-alarm.sh catches FAILs ──
overall_ok=false
if [ "$db_ok" = "true" ] && [ "$rel_ok" = "true" ]; then
  overall_ok=true
fi
status="ok"
[ "$overall_ok" = "true" ] || status="fail"

detail="db=${db_ok}(age=${db_age_hours}h) release=${rel_ok}(age=${rel_age_hours}h)"
# Escape " and \ for JSON safety.
detail_escaped=$(printf '%s' "$detail" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')

mkdir -p "$(dirname "$CRON_HEALTH")"
printf '{"ts":"%s","endpoint":"backup-verify","status":"%s","duration_ms":0,"detail":"%s"}\n' \
  "$NOW_ISO" "$status" "$detail_escaped" \
  >> "$CRON_HEALTH"

exit 0
