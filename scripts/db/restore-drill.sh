#!/usr/bin/env bash
# BlockID.au — weekly restore drill (G15-R3, supersedes scripts/db-restore-test.sh)
#
# A backup nobody has restored is a hope, not a backup. This drill proves the
# newest dump is restorable AND complete:
#
#   1. Newest /data/backups/db-*.dump.gz, sha256 sidecar verified.
#   2. dropdb --if-exists + createdb `blockid_restore_drill` INSIDE the
#      supabase-db container (same cluster → same roles / extensions as prod;
#      the live `postgres` database is only ever READ).
#   3. gunzip | pg_restore -d blockid_restore_drill --no-owner --no-privileges
#      as supabase_admin (cluster SUPERUSER — see docs/runbooks/db-restore.md
#      § 2). A Supabase dump restored into the same cluster always emits a few
#      benign errors (pre-existing schemas, event triggers, vault / pg_net);
#      restore-drill-core.mjs allow-lists those and fails on anything else.
#   4. Row counts of 12 key tables in the drill DB vs live `postgres`:
#      PASS when every drill count ≥ 95 % of live (the dump is ≤ 24 h old)
#      and the drill's newest audit_events row carries prev_hash + curr_hash.
#   5. dropdb the scratch DB — also on every error path (trap).
#   6. Appends {job:"restore-drill", ...} to backup-health.jsonl + a
#      cron-health.jsonl row; Telegram on failure (scripts/lib/ops-alert.sh —
#      token read from web/.env at call time, never logged); exit 1 on failure.
#
# Cron: Sun 03:30 UTC (web/scripts/crontab.production, BACKUPS section).
# Manual: scripts/db/restore-drill.sh [--file <dump.gz>] [--dry-run] [--min-pct 95]
#   --dry-run prints the plan (dump, age, commands) and restores nothing.
# Env overrides (tests / worktrees): BLOCKID_REPO_ROOT, BACKUP_DIR, HEALTH_LOG.
# Full production restore procedure: docs/runbooks/db-restore.md

set -euo pipefail

REPO_ROOT="${BLOCKID_REPO_ROOT:-/home/dovanlong/blockid.au}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE="$SCRIPT_DIR/restore-drill-core.mjs"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
CONTAINER="supabase-db"
DB_USER="postgres"
RESTORE_USER="supabase_admin"
LIVE_DB="postgres"
SCRATCH_DB="blockid_restore_drill"
HEALTH_LOG="${HEALTH_LOG:-$REPO_ROOT/web/content/reports/backup-health.jsonl}"
LOCK_FILE="/tmp/blockid-restore-drill.lock"
MIN_PCT=95
FILE=""
DRY_RUN=0
TABLES=(app_users projects svi_snapshots evaluations funding_reports audit_events credit_transactions report_orders webhook_endpoints intake_submissions external_signals schema_migrations)

while [ $# -gt 0 ]; do
  case "$1" in
    --file) FILE="$2"; shift 2 ;;
    --min-pct) MIN_PCT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# shellcheck source=../lib/ops-alert.sh
OPS_REPO_ROOT="$REPO_ROOT"
. "$REPO_ROOT/scripts/lib/ops-alert.sh"

log() { echo "[restore-drill] $(date -u '+%H:%M:%S') $*"; }

exec 9>"$LOCK_FILE"
if ! flock -n 9; then log "another drill is running (lock $LOCK_FILE) — skipping"; exit 0; fi

START=$(date -u +%s%N)
ERRLOG="/tmp/blockid-restore-drill.$$.err"
INPUT_JSON="/tmp/blockid-restore-drill.$$.json"
RESTORE_EXIT=0

psql_db() { # psql_db <db> <sql>  → single value, empty on error
  docker exec "$CONTAINER" psql -U "$DB_USER" -d "$1" -Atqc "$2" 2>/dev/null || true
}

drop_scratch() {
  [ "$DRY_RUN" = "1" ] && return 0
  # FORCE (PG13+) kicks any lingering session so the drop never hangs.
  docker exec "$CONTAINER" psql -U "$DB_USER" -d "$LIVE_DB" -qc "DROP DATABASE IF EXISTS $SCRATCH_DB WITH (FORCE);" >/dev/null 2>&1 || true
}

# fail <message> — record a failed row without any counts, alert, exit 1.
fail() {
  local msg="$1" dur end
  end=$(date -u +%s%N); dur=$(( (end - START) / 1000000 ))
  log "FAILED: $msg"
  if [ "$DRY_RUN" = "1" ]; then exit 1; fi
  local esc
  esc=$(printf '%s' "$msg" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\n' | head -c 600)
  mkdir -p "$(dirname "$HEALTH_LOG")"
  printf '{"ts":"%s","job":"restore-drill","status":"fail","dump":"%s","file":"%s","dump_age_h":%s,"scratch_db":"%s","tables":{},"duration_ms":%s,"error":"%s"}\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$FILE" "$FILE" "${DUMP_AGE_H:-null}" "$SCRATCH_DB" "$dur" "$esc" >> "$HEALTH_LOG" 2>/dev/null || true
  ops_cron_health "db-restore-drill" "fail" "$dur" "file=$(basename "${FILE:-none}") err=$msg"
  ops_alert "🛑 *DB restore drill FAILED*" "$(basename "${FILE:-none}")
$msg
Runbook: docs/runbooks/db-restore.md § Restore drill"
  exit 1
}

cleanup() {
  drop_scratch
  rm -f "$ERRLOG" "$INPUT_JSON"
}
trap cleanup EXIT
trap 'log "interrupted"; exit 130' INT TERM

# ── 1. newest backup + sidecar ────────────────────────────────────────────
if [ -z "$FILE" ]; then
  FILE=$(ls -1 "$BACKUP_DIR"/db-*.dump.gz 2>/dev/null | sort | tail -1 || true)
fi
[ -n "$FILE" ] && [ -f "$FILE" ] || fail "no db-*.dump.gz in $BACKUP_DIR"
[ -f "$FILE.sha256" ] || fail "missing sidecar $FILE.sha256"
(cd "$(dirname "$FILE")" && sha256sum -c --quiet "$(basename "$FILE").sha256") || fail "sha256 mismatch for $(basename "$FILE")"
DUMP_MTIME=$(stat -c %Y "$FILE")
DUMP_AGE_H=$(awk -v m="$DUMP_MTIME" -v n="$(date -u +%s)" 'BEGIN{printf "%.1f", (n-m)/3600}')
DUMP_SIZE=$(stat -c %s "$FILE")
log "dump $(basename "$FILE") ($DUMP_SIZE bytes, ${DUMP_AGE_H} h old, sha256 ok)"

docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true || fail "container $CONTAINER not running"
command -v node >/dev/null 2>&1 || fail "node not on PATH"
[ -f "$CORE" ] || fail "missing $CORE"

if [ "$DRY_RUN" = "1" ]; then
  cat <<PLAN
[restore-drill] DRY RUN — nothing will be restored. Plan:
  1. docker exec $CONTAINER dropdb -U $DB_USER --if-exists $SCRATCH_DB
  2. docker exec $CONTAINER createdb -U $DB_USER $SCRATCH_DB
  3. gunzip -c $FILE | docker exec -i $CONTAINER pg_restore -U $RESTORE_USER -d $SCRATCH_DB --no-owner --no-privileges --no-comments
  4. count(*) in ${#TABLES[@]} tables: ${TABLES[*]}
     in $SCRATCH_DB and in $LIVE_DB (read-only) → node $CORE --evaluate (min ${MIN_PCT} %)
  5. audit chain head: newest public.audit_events row must have prev_hash + curr_hash
  6. dropdb $SCRATCH_DB (trap), append {job:"restore-drill"} → $HEALTH_LOG, Telegram on failure
PLAN
  exit 0
fi

# ── 2. scratch DB ─────────────────────────────────────────────────────────
log "recreating $SCRATCH_DB"
docker exec "$CONTAINER" dropdb -U "$DB_USER" --if-exists --force "$SCRATCH_DB" >/dev/null 2>&1 \
  || docker exec "$CONTAINER" psql -U "$DB_USER" -d "$LIVE_DB" -qc "DROP DATABASE IF EXISTS $SCRATCH_DB WITH (FORCE);" >/dev/null 2>&1 || true
docker exec "$CONTAINER" createdb -U "$DB_USER" "$SCRATCH_DB" || fail "createdb $SCRATCH_DB failed"

# ── 3. restore (stream gunzip → pg_restore inside the container) ──────────
log "pg_restore → $SCRATCH_DB as $RESTORE_USER"
set +e
gunzip -c "$FILE" | docker exec -i "$CONTAINER" pg_restore -U "$RESTORE_USER" -d "$SCRATCH_DB" \
  --no-owner --no-privileges --no-comments >/dev/null 2>"$ERRLOG"
RESTORE_EXIT=${PIPESTATUS[1]}
set -e
RESTORE_ERRORS=$(grep -c '^pg_restore: error:' "$ERRLOG" 2>/dev/null || true)
RESTORE_ERRORS=${RESTORE_ERRORS:-0}
log "pg_restore exit $RESTORE_EXIT, $RESTORE_ERRORS error line(s)"
[ "$RESTORE_ERRORS" -gt 0 ] && grep '^pg_restore: error:' "$ERRLOG" | head -8 | sed 's/^/    /'

# ── 4. counts: drill vs live (live is read-only) ──────────────────────────
json_counts() { # json_counts <db> → {"t":n|null,...}
  local db="$1" out="" t c
  for t in "${TABLES[@]}"; do
    c=$(psql_db "$db" "SELECT count(*) FROM public.$t;")
    [[ "$c" =~ ^[0-9]+$ ]] || c=null
    out="$out\"$t\":$c,"
  done
  printf '{%s}' "${out%,}"
}
LIVE_JSON=$(json_counts "$LIVE_DB")
DRILL_JSON=$(json_counts "$SCRATCH_DB")
log "live  $LIVE_JSON"
log "drill $DRILL_JSON"

AUDIT_ROWS=$(psql_db "$SCRATCH_DB" "SELECT count(*) FROM public.audit_events;")
[[ "$AUDIT_ROWS" =~ ^[0-9]+$ ]] || AUDIT_ROWS=null
AUDIT_HEAD=$(psql_db "$SCRATCH_DB" "SELECT (prev_hash IS NOT NULL)::int || '|' || (curr_hash IS NOT NULL)::int FROM public.audit_events ORDER BY id DESC LIMIT 1;")
PREV_PRESENT=false; CURR_PRESENT=false
[ "${AUDIT_HEAD%%|*}" = "1" ] && PREV_PRESENT=true
[ "${AUDIT_HEAD##*|}" = "1" ] && CURR_PRESENT=true
log "audit_events rows=$AUDIT_ROWS head prev_hash=$PREV_PRESENT curr_hash=$CURR_PRESENT"

# ── 5. verdict (pure, unit-tested) ────────────────────────────────────────
END=$(date -u +%s%N); DURATION_MS=$(( (END - START) / 1000000 ))
ERR_LINES_JSON=$({ grep '^pg_restore: error:' "$ERRLOG" 2>/dev/null || true; } | head -50 | python3 -c 'import sys,json; print(json.dumps([l.rstrip("\n") for l in sys.stdin]))' 2>/dev/null)
[ -n "$ERR_LINES_JSON" ] || ERR_LINES_JSON='[]'
cat > "$INPUT_JSON" <<EOF
{"dump":"$FILE","dump_age_h":$DUMP_AGE_H,"duration_ms":$DURATION_MS,"scratch_db":"$SCRATCH_DB",
 "pg_restore_exit":$RESTORE_EXIT,"pg_restore_error_lines":$ERR_LINES_JSON,
 "live":$LIVE_JSON,"drill":$DRILL_JSON,
 "audit":{"rows":$AUDIT_ROWS,"prev_hash_present":$PREV_PRESENT,"curr_hash_present":$CURR_PRESENT}}
EOF
set +e
ROW=$(node "$CORE" --evaluate --min-pct "$MIN_PCT" < "$INPUT_JSON")
VERDICT=$?
set -e
[ -n "$ROW" ] || fail "restore-drill-core produced no row (exit $VERDICT)"

mkdir -p "$(dirname "$HEALTH_LOG")"
printf '%s\n' "$ROW" >> "$HEALTH_LOG" 2>/dev/null || log "WARN: could not append to $HEALTH_LOG"

if [ "$VERDICT" != "0" ]; then
  ERR=$(printf '%s' "$ROW" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("error",""))' 2>/dev/null || echo "see backup-health.jsonl")
  ops_cron_health "db-restore-drill" "fail" "$DURATION_MS" "file=$(basename "$FILE") err=$ERR"
  ops_alert "🛑 *DB restore drill FAILED*" "$(basename "$FILE")
$ERR
Runbook: docs/runbooks/db-restore.md § Restore drill"
  log "FAILED: $ERR"
  exit 1
fi

ops_cron_health "db-restore-drill" "ok" "$DURATION_MS" "file=$(basename "$FILE") tables=${#TABLES[@]} benign_errors=$RESTORE_ERRORS"
log "ok — $(basename "$FILE") restored + verified in ${DURATION_MS} ms (${#TABLES[@]} tables ≥ ${MIN_PCT} %, audit chain head ok, $RESTORE_ERRORS benign pg_restore error(s))"
exit 0
