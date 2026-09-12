#!/usr/bin/env bash
# BlockID.au — daily Postgres backup (release QA-3 P0-4)
#
# What it does
#   1. pg_dump (custom format, -Fc) of the `postgres` database from INSIDE the
#      supabase-db container (host needs no pg_dump) → gzip → atomic rename to
#      /data/backups/db-<UTC ts>.dump.gz
#   2. Validates the archive TOC with `pg_restore -l` (catches truncated /
#      corrupt dumps before we trust them).
#   3. Writes a sha256 sidecar (<file>.sha256, sha256sum -c compatible).
#   4. Retention: newest 14 dailies in /data/backups; every Sunday the daily is
#      hard-linked into /data/backups/weekly/ where the newest 8 are kept.
#   5. Appends one JSON line to web/content/reports/backup-health.jsonl
#      ({job:"db-backup", status, file, sizeBytes, duration_ms, sha256, ...})
#      + a cron-health.jsonl row so cron-alarm / /api/status see it.
#   6. Telegram alert on any failure (scripts/lib/ops-alert.sh), exit 1.
#
# Cron: 02:20 UTC daily (web/scripts/crontab.production). Off-site copy is
# scripts/db-backup-offsite.mjs (02:40), restore drill scripts/db-restore-test.sh
# (Sun 03:00). Restore runbook: docs/runbooks/db-restore.md
#
# Usage: scripts/db-backup.sh [--dir /data/backups] [--keep-daily 14] [--keep-weekly 8]

set -uo pipefail
umask 077

REPO_ROOT="/home/dovanlong/blockid.au"
BACKUP_DIR="/data/backups"
KEEP_DAILY=14
KEEP_WEEKLY=8
CONTAINER="supabase-db"
DB_NAME="postgres"
DB_USER="postgres"
HEALTH_LOG="$REPO_ROOT/web/content/reports/backup-health.jsonl"

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) BACKUP_DIR="$2"; shift 2 ;;
    --keep-daily) KEEP_DAILY="$2"; shift 2 ;;
    --keep-weekly) KEEP_WEEKLY="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# shellcheck source=lib/ops-alert.sh
. "$REPO_ROOT/scripts/lib/ops-alert.sh"

# Single-flight: a slow dump must never stack with the next tick / restore test.
exec 9>"/tmp/blockid-db-backup.lock"
if ! flock -n 9; then
  echo "[db-backup] another backup is running — skipping" >&2
  exit 0
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/db-$TS.dump.gz"
TMP="$BACKUP_DIR/.db-$TS.dump.gz.partial"
START=$(date -u +%s%N)
STATUS="fail"
ERR=""
SIZE=0
SHA=""
WEEKLY=false

log() { echo "[db-backup] $(date -u '+%H:%M:%S') $*"; }

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\n'; }

finish() {
  local end dur
  end=$(date -u +%s%N)
  dur=$(( (end - START) / 1000000 ))
  mkdir -p "$(dirname "$HEALTH_LOG")"
  printf '{"ts":"%s","job":"db-backup","status":"%s","file":"%s","sizeBytes":%s,"duration_ms":%s,"sha256":"%s","weekly":%s,"keep_daily":%s,"keep_weekly":%s,"error":"%s"}\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$STATUS" "$OUT" "$SIZE" "$dur" "$SHA" "$WEEKLY" \
    "$KEEP_DAILY" "$KEEP_WEEKLY" "$(json_escape "$ERR")" >> "$HEALTH_LOG" 2>/dev/null || true
  ops_cron_health "db-backup" "$STATUS" "$dur" "file=$(basename "$OUT") size=$SIZE ${ERR:+err=$ERR}"
  if [ "$STATUS" != "ok" ]; then
    rm -f "$TMP"
    ops_alert "🛑 *DB backup FAILED*" "$(basename "$OUT")
$ERR
Runbook: docs/runbooks/db-restore.md"
    log "FAILED: $ERR"
    exit 1
  fi
  log "ok $OUT ($SIZE bytes, ${dur}ms, sha256 ${SHA:0:12}…)"
  exit 0
}

fail() { ERR="$1"; finish; }

mkdir -p "$BACKUP_DIR" "$BACKUP_DIR/weekly" || fail "cannot create $BACKUP_DIR"

docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || fail "container $CONTAINER not running"

# ── 1. dump (custom format, from inside the container) ────────────────────
log "pg_dump -Fc $DB_NAME → $OUT"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -Fc --no-owner --no-privileges "$DB_NAME" 2>"$TMP.err" \
  | gzip -c > "$TMP"
rc=("${PIPESTATUS[@]}")
if [ "${rc[0]}" != "0" ] || [ "${rc[1]}" != "0" ]; then
  fail "pg_dump exit ${rc[0]}, gzip exit ${rc[1]}: $(head -c 200 "$TMP.err" 2>/dev/null)"
fi
rm -f "$TMP.err"

SIZE=$(stat -c%s "$TMP" 2>/dev/null || echo 0)
[ "$SIZE" -gt 100000 ] || fail "dump suspiciously small ($SIZE bytes)"

# ── 2. validate the archive TOC before trusting it ─────────────────────────
# (pg_restore -l stops reading after the TOC → gunzip may get SIGPIPE; only
#  pg_restore's own exit status is meaningful here.)
gunzip -c "$TMP" 2>/dev/null | docker exec -i "$CONTAINER" pg_restore -l >/dev/null 2>"$TMP.err"
if [ "${PIPESTATUS[1]}" != "0" ]; then
  fail "pg_restore -l rejected archive: $(head -c 200 "$TMP.err" 2>/dev/null)"
fi
rm -f "$TMP.err"

mv -f "$TMP" "$OUT" || fail "rename failed"

# ── 3. sha256 sidecar (relative name so `sha256sum -c` works in-dir) ───────
SHA=$( (cd "$BACKUP_DIR" && sha256sum "$(basename "$OUT")" | tee "$(basename "$OUT").sha256") | cut -d' ' -f1)
[ -n "$SHA" ] || fail "sha256 failed"

# ── 4. weekly hard-link (Sunday) + retention ───────────────────────────────
if [ "$(date -u +%u)" = "7" ] || [ "${FORCE_WEEKLY:-0}" = "1" ]; then
  ln -f "$OUT" "$BACKUP_DIR/weekly/db-weekly-$TS.dump.gz" \
    && sed "s#db-$TS.dump.gz#db-weekly-$TS.dump.gz#" "$OUT.sha256" > "$BACKUP_DIR/weekly/db-weekly-$TS.dump.gz.sha256" \
    && WEEKLY=true
fi

prune() { # prune <dir> <glob> <keep>
  local dir="$1" glob="$2" keep="$3" f
  ls -1t "$dir"/$glob 2>/dev/null | tail -n +"$((keep + 1))" | while read -r f; do
    log "prune $f"; rm -f "$f" "$f.sha256"
  done
}
prune "$BACKUP_DIR" 'db-*.dump.gz' "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" 'db-weekly-*.dump.gz' "$KEEP_WEEKLY"
# Orphan sidecars (dump removed by hand)
for s in "$BACKUP_DIR"/*.sha256 "$BACKUP_DIR"/weekly/*.sha256; do
  [ -f "$s" ] && [ ! -f "${s%.sha256}" ] && rm -f "$s"
done

STATUS="ok"
finish
