#!/usr/bin/env bash
# BlockID.au — Supabase analytics (Logflare) DB hygiene. O1 / L1-5 (2026-10-20).
#
# The self-hosted Supabase stack keeps its log pipeline (vector → logflare
# `supabase-analytics`) in the `_supabase` database of the SAME Postgres
# cluster as the app (`supabase-db`). Two problems found 2026-10-20:
#
#  1. WAL retention. Logflare's PgPublisher (cainophile) holds a TEMPORARY
#     logical slot `cainophile_*` on `_supabase` (publication logflare_pub =
#     its config tables: users, sources, rules, plans, …). It only confirms an
#     LSN when a change to one of THOSE tables is decoded; PG15 pgoutput skips
#     empty transactions, so while the config is idle the slot never advances
#     and pins all WAL the cluster writes (3.9 GB with safe_wal_size ≈ 0 before
#     12:27 UTC; max_slot_wal_keep_size = 4 GB is the only cap).
#     `heartbeat`: a no-op UPDATE on _analytics.plans (one row,
#     updated_at = updated_at) gives the slot a commit to confirm, so
#     restart_lsn follows within one more heartbeat. Verified 2026-10-20:
#     retained WAL 100 MB → 2.6 MB after two heartbeats.
#  2. No retention on `_analytics.log_events_*` (2.6 GB, kong access logs since
#     May). `retention`: delete rows older than RETAIN_DAYS (14) in batches
#     (own transaction each, so the WAL burst and lock time stay small), then
#     VACUUM (ANALYZE) the touched tables (space is reused, not returned).
#
# Usage (as the deploy user; docker access, no password — local trust):
#   scripts/db/analytics-log-hygiene.sh heartbeat          # crontab */15
#   scripts/db/analytics-log-hygiene.sh retention          # crontab daily 04:47 UTC
#   scripts/db/analytics-log-hygiene.sh status             # read-only
#   scripts/db/analytics-log-hygiene.sh retention --dry-run
# Env: SUPABASE_DB_CONTAINER (supabase-db), RETAIN_DAYS (14), BATCH (50000),
#      SLOT_ALERT_MB (1024 — P1 ops alert when a cainophile slot still retains more).
# Never touches the app database `postgres`. Exit 0 unless docker/psql fails.

set -euo pipefail
export LC_ALL=C
CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
BATCH="${BATCH:-50000}"
SLOT_ALERT_MB="${SLOT_ALERT_MB:-1024}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODE="${1:-status}"
DRY=0
[ "${2:-}" = "--dry-run" ] && DRY=1

case "$RETAIN_DAYS" in ''|*[!0-9]*) echo "RETAIN_DAYS must be an integer" >&2; exit 2 ;; esac
case "$BATCH" in ''|*[!0-9]*) echo "BATCH must be an integer" >&2; exit 2 ;; esac
[ "$RETAIN_DAYS" -ge 7 ] || { echo "RETAIN_DAYS < 7 refused" >&2; exit 2; }

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
psql_sb() { docker exec -i "$CONTAINER" psql -U supabase_admin -d _supabase -v ON_ERROR_STOP=1 -qAt "$@"; }
psql_pg() { docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

slot_report() {
  psql_pg -c "select slot_name || ' active=' || active || ' retained_mb=' || (pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) / 1048576)::bigint || ' safe_wal_mb=' || coalesce((safe_wal_size / 1048576)::bigint::text, 'n/a') || ' wal_status=' || coalesce(wal_status, '?') from pg_replication_slots where slot_name like 'cainophile%'"
}

slot_max_mb() {
  psql_pg -c "select coalesce(max((pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) / 1048576)::bigint), 0) from pg_replication_slots where slot_name like 'cainophile%'"
}

case "$MODE" in
  status)
    echo "[$(ts)] cainophile slots:"; slot_report | sed 's/^/  /'
    echo "[$(ts)] _supabase size: $(psql_pg -c "select pg_size_pretty(pg_database_size('_supabase'))")"
    psql_sb -c "select c.relname || ' ' || pg_size_pretty(pg_total_relation_size(c.oid)) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = '_analytics' and c.relkind = 'r' and c.relname like 'log\_events\_%' order by pg_total_relation_size(c.oid) desc limit 5" | sed 's/^/  /'
    ;;

  heartbeat)
    # One-row no-op UPDATE in logflare's own config table → a decoded commit
    # the slot consumer acknowledges. Harmless to logflare (it re-reads the plan).
    if [ "$DRY" = 1 ]; then echo "[$(ts)] heartbeat (dry-run)"; slot_report; exit 0; fi
    psql_sb -c "update _analytics.plans set updated_at = updated_at where id = (select min(id) from _analytics.plans)" >/dev/null
    mb="$(slot_max_mb || echo 0)"
    if [ "${mb:-0}" -gt "$SLOT_ALERT_MB" ] 2>/dev/null; then
      # Two heartbeats 15 min apart should have released it — something is wrong.
      if [ -f "$REPO_ROOT/scripts/lib/ops-alert.sh" ]; then
        # shellcheck source=/dev/null
        source "$REPO_ROOT/scripts/lib/ops-alert.sh"
        ops_alert "[P1] Logflare replication slot retains ${mb} MB WAL" "$(slot_report)
Runbook: scripts/db/analytics-log-hygiene.sh header; restart supabase-analytics if the slot is inactive." || true
      fi
      echo "[$(ts)] heartbeat: WARN cainophile slot retains ${mb} MB (> ${SLOT_ALERT_MB})"
    else
      echo "[$(ts)] heartbeat ok (cainophile retained ${mb} MB)"
    fi
    ;;

  retention)
    cutoff_sql="(now() at time zone 'utc') - interval '${RETAIN_DAYS} days'"
    mapfile -t TABLES < <(psql_sb -c "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid and a.attname = 'timestamp' and not a.attisdropped where n.nspname = '_analytics' and c.relkind = 'r' and c.relname like 'log\_events\_%' order by 1")
    before="$(psql_pg -c "select pg_size_pretty(pg_database_size('_supabase'))")"
    total=0
    for t in "${TABLES[@]}"; do
      [[ "$t" =~ ^log_events_[0-9a-f_]+$ ]] || { echo "skip unexpected table name: $t"; continue; }
      if [ "$DRY" = 1 ]; then
        n="$(psql_sb -c "select count(*) from _analytics.\"$t\" where \"timestamp\" < $cutoff_sql")"
        [ "$n" -gt 0 ] && echo "  would delete $n rows from $t"
        total=$((total + n)); continue
      fi
      deleted=0
      while :; do
        n="$(psql_sb -c "with d as (delete from _analytics.\"$t\" where ctid = any (array(select ctid from _analytics.\"$t\" where \"timestamp\" < $cutoff_sql limit $BATCH)) returning 1) select count(*) from d")"
        deleted=$((deleted + n))
        [ "$n" -lt "$BATCH" ] && break
      done
      if [ "$deleted" -gt 0 ]; then
        psql_sb -c "vacuum (analyze) _analytics.\"$t\"" >/dev/null
        echo "  $t: deleted $deleted rows (older than ${RETAIN_DAYS} d), vacuumed"
      fi
      total=$((total + deleted))
    done
    after="$(psql_pg -c "select pg_size_pretty(pg_database_size('_supabase'))")"
    label=""; [ "$DRY" = 1 ] && label=" (dry-run)"
    echo "[$(ts)] retention${label}: ${total} rows older than ${RETAIN_DAYS} d across ${#TABLES[@]} log_events tables; _supabase ${before} → ${after} (space is reused; VACUUM FULL is a one-off manual step)"
    ;;

  *)
    echo "usage: $0 status|heartbeat|retention [--dry-run]" >&2; exit 2 ;;
esac
