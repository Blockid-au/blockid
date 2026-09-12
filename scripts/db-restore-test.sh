#!/usr/bin/env bash
# BlockID.au — weekly restore drill (release QA-3 P0-4)
#
# Proves the newest backup is actually restorable — a backup nobody has ever
# restored is a hope, not a backup.
#
#   1. Picks newest /data/backups/db-*.dump.gz, verifies its sha256 sidecar.
#   2. Creates scratch DB `blockid_restore_test` INSIDE the supabase-db
#      container (same cluster → same roles/extensions as prod, zero impact on
#      the `postgres` DB PostgREST serves).
#   3. gunzip | pg_restore --no-owner --no-privileges into the scratch DB.
#      Supabase dumps always emit a handful of benign errors (pre-existing
#      `public`/`extensions` schemas, event triggers, vault) — those are
#      counted, not fatal. Fatal = pg_restore exit code without any data OR
#      a sanity query failing.
#   4. Sanity: row counts of public.app_users / projects / plans in the scratch
#      DB vs live prod (must match within DRIFT_PCT, default 5%).
#   5. Drops the scratch DB (also on any error path — trap).
#   6. Appends {job:"restore_test", ...} to backup-health.jsonl + cron-health
#      row; Telegram on failure; exit 1 on failure.
#
# Cron: Sun 03:00 UTC. Manual: scripts/db-restore-test.sh [--file <dump.gz>]
# Full production restore procedure: docs/runbooks/db-restore.md

set -uo pipefail

REPO_ROOT="/home/dovanlong/blockid.au"
BACKUP_DIR="/data/backups"
CONTAINER="supabase-db"
DB_USER="postgres"
# supabase_admin is the cluster SUPERUSER (postgres is not) — restoring as it
# avoids the vault.secrets / SET log_min_messages permission errors and is
# exactly what docs/runbooks/db-restore.md uses for a real restore.
RESTORE_USER="supabase_admin"
SCRATCH_DB="blockid_restore_test"
HEALTH_LOG="$REPO_ROOT/web/content/reports/backup-health.jsonl"
DRIFT_PCT=5
FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --file) FILE="$2"; shift 2 ;;
    --drift-pct) DRIFT_PCT="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# shellcheck source=lib/ops-alert.sh
. "$REPO_ROOT/scripts/lib/ops-alert.sh"

exec 9>"/tmp/blockid-db-restore-test.lock"
if ! flock -n 9; then echo "[restore-test] already running — skipping" >&2; exit 0; fi

log() { echo "[restore-test] $(date -u '+%H:%M:%S') $*"; }
psql_scratch() { docker exec "$CONTAINER" psql -U "$DB_USER" -d "$SCRATCH_DB" -Atqc "$1" 2>/dev/null; }
psql_admin()   { docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -Atqc "$1"; }

START=$(date -u +%s%N)
STATUS="fail"; ERR=""; RESTORE_ERRORS=0; RESTORE_EXIT=0
declare -A SCRATCH PROD
TABLES=(app_users projects plans)

drop_scratch() {
  # FORCE (PG13+) kicks any lingering session so the drop never hangs.
  docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -qc "DROP DATABASE IF EXISTS $SCRATCH_DB WITH (FORCE);" >/dev/null 2>&1 || true
}

finish() {
  drop_scratch
  local end dur counts prod
  end=$(date -u +%s%N); dur=$(( (end - START) / 1000000 ))
  counts=""; prod=""
  for t in "${TABLES[@]}"; do
    counts="$counts\"$t\":${SCRATCH[$t]:-null},"; prod="$prod\"$t\":${PROD[$t]:-null},"
  done
  counts="{${counts%,}}"; prod="{${prod%,}}"
  mkdir -p "$(dirname "$HEALTH_LOG")"
  printf '{"ts":"%s","job":"restore_test","status":"%s","file":"%s","scratch_db":"%s","duration_ms":%s,"pg_restore_exit":%s,"pg_restore_errors":%s,"counts":%s,"prod_counts":%s,"error":"%s"}\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$STATUS" "$FILE" "$SCRATCH_DB" "$dur" "$RESTORE_EXIT" "$RESTORE_ERRORS" \
    "$counts" "$prod" "$(printf '%s' "$ERR" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\n')" >> "$HEALTH_LOG" 2>/dev/null || true
  ops_cron_health "db-restore-test" "$STATUS" "$dur" "file=$(basename "$FILE") counts=$counts ${ERR:+err=$ERR}"
  if [ "$STATUS" != "ok" ]; then
    ops_alert "🛑 *DB restore drill FAILED*" "$(basename "$FILE")
$ERR
Runbook: docs/runbooks/db-restore.md"
    log "FAILED: $ERR"; exit 1
  fi
  log "ok — $(basename "$FILE") restored in ${dur}ms; counts $counts (prod $prod); pg_restore benign errors: $RESTORE_ERRORS"
  exit 0
}
fail() { ERR="$1"; finish; }
trap 'drop_scratch' INT TERM

# ── 1. newest backup + sidecar ────────────────────────────────────────────
if [ -z "$FILE" ]; then
  FILE=$(ls -1 "$BACKUP_DIR"/db-*.dump.gz 2>/dev/null | sort | tail -1)
fi
[ -n "$FILE" ] && [ -f "$FILE" ] || fail "no db-*.dump.gz in $BACKUP_DIR"
[ -f "$FILE.sha256" ] || fail "missing sidecar $FILE.sha256"
(cd "$(dirname "$FILE")" && sha256sum -c --quiet "$(basename "$FILE").sha256") || fail "sha256 mismatch for $(basename "$FILE")"
log "restoring $(basename "$FILE") ($(stat -c%s "$FILE") bytes) into $SCRATCH_DB"

docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true || fail "container $CONTAINER not running"

# ── 2. scratch DB ─────────────────────────────────────────────────────────
drop_scratch
psql_admin "CREATE DATABASE $SCRATCH_DB;" >/dev/null || fail "CREATE DATABASE $SCRATCH_DB failed"

# ── 3. restore ────────────────────────────────────────────────────────────
ERRLOG="/tmp/blockid-restore-test.$$.err"
gunzip -c "$FILE" | docker exec -i "$CONTAINER" pg_restore -U "$RESTORE_USER" -d "$SCRATCH_DB" \
  --no-owner --no-privileges --no-comments 2>"$ERRLOG" >/dev/null
RESTORE_EXIT=${PIPESTATUS[1]}
RESTORE_ERRORS=$(grep -c '^pg_restore: error:' "$ERRLOG" 2>/dev/null || echo 0)
if [ "$RESTORE_EXIT" != "0" ]; then
  # exit 1 with only benign errors is normal for a Supabase dump — show them
  # in the log and let the sanity queries decide.
  log "pg_restore exit $RESTORE_EXIT, $RESTORE_ERRORS error line(s):"
  grep '^pg_restore: error:' "$ERRLOG" | sed 's/^/    /' | head -12
  # anything that is NOT a known-benign pattern is fatal
  if grep '^pg_restore: error:' "$ERRLOG" | grep -v -E 'already exists|must be owner of|permission denied for (schema|table|extension)|permission denied to set parameter|event trigger|supabase_vault|pg_net|does not exist' | grep -q .; then
    fail "pg_restore reported non-benign errors (see $ERRLOG)"
  fi
fi
rm -f "$ERRLOG"

# ── 4. sanity queries: scratch vs prod ────────────────────────────────────
for t in "${TABLES[@]}"; do
  c=$(psql_scratch "SELECT count(*) FROM public.$t;")
  [[ "$c" =~ ^[0-9]+$ ]] || fail "sanity query failed: public.$t not readable in $SCRATCH_DB"
  SCRATCH[$t]="$c"
  p=$(psql_admin "SELECT count(*) FROM public.$t;" 2>/dev/null); [[ "$p" =~ ^[0-9]+$ ]] || p=null
  PROD[$t]="$p"
  if [ "$p" != "null" ] && [ "$p" -gt 0 ]; then
    diff=$(( c > p ? c - p : p - c ))
    if [ $(( diff * 100 )) -gt $(( p * DRIFT_PCT )) ]; then
      fail "public.$t drift too large: scratch=$c prod=$p (> ${DRIFT_PCT}%)"
    fi
  fi
  log "public.$t: scratch=$c prod=$p"
done

STATUS="ok"
finish
