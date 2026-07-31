#!/usr/bin/env bash
# apply-v3-migrations.sh
# ------------------------------------------------------------------------------
# Apply the v3 platform migrations (0202..0296) to the self-hosted Supabase
# Postgres container. All migrations are idempotent (IF NOT EXISTS, CREATE OR
# REPLACE), so re-runs are safe.
#
# Usage:
#   scripts/db/apply-v3-migrations.sh              # apply all
#   scripts/db/apply-v3-migrations.sh --dry-run    # list what would be applied
#
# Env overrides:
#   PG_CONTAINER   Docker container name (default: supabase-db)
#   PG_USER        psql user            (default: postgres)
#   PG_DB          psql database        (default: postgres)
#   MIG_DIR        migrations directory (default: web/supabase/migrations)
#   LOG_FILE       jsonl log path       (default: web/content/reports/migration-apply-log.jsonl)
# ------------------------------------------------------------------------------
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-supabase-db}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-postgres}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG_DIR="${MIG_DIR:-$REPO_ROOT/web/supabase/migrations}"
LOG_FILE="${LOG_FILE:-$REPO_ROOT/web/content/reports/migration-apply-log.jsonl}"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# Collect target migrations: 02*.sql and 029*.sql in numeric order.
# shellcheck disable=SC2207
MIGRATIONS=($(ls "$MIG_DIR"/02*.sql 2>/dev/null | sort -V))
if [[ ${#MIGRATIONS[@]} -eq 0 ]]; then
  echo "no v3 migrations found in $MIG_DIR" >&2
  exit 1
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "DRY RUN — would apply ${#MIGRATIONS[@]} migration(s) against ${PG_CONTAINER}:${PG_DB} as ${PG_USER}:"
  for m in "${MIGRATIONS[@]}"; do
    printf '  %s\n' "$(basename "$m")"
  done
  exit 0
fi

# Sanity check container is up.
if ! docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
  echo "docker container '$PG_CONTAINER' not found" >&2
  exit 3
fi

mkdir -p "$(dirname "$LOG_FILE")"

declare -a RESULTS=()
OK=0
FAIL=0

for path in "${MIGRATIONS[@]}"; do
  name="$(basename "$path")"
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'applying %s ... ' "$name"

  # Copy file into container's /tmp
  if ! docker cp "$path" "$PG_CONTAINER:/tmp/mig.sql" >/dev/null 2>&1; then
    status="copy-failed"; rowcount=0; err="docker cp failed"
  else
    # Apply. Capture combined output. -v ON_ERROR_STOP=1 aborts on first error.
    if out="$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -f /tmp/mig.sql 2>&1)"; then
      status="ok"
      rowcount=$(printf '%s\n' "$out" | grep -cE '^(CREATE|ALTER|INSERT|COMMENT|GRANT|NOTIFY|DROP|UPDATE|DELETE)' || true)
      err=""
    else
      status="failed"
      rowcount=0
      err="$(printf '%s' "$out" | tail -n 3 | tr '\n' ' ' | sed 's/"/\\"/g')"
    fi
  fi

  # Log
  printf '{"ts":"%s","migration":"%s","status":"%s","rowcount":%d,"error":"%s"}\n' \
    "$ts" "$name" "$status" "$rowcount" "${err:-}" >> "$LOG_FILE"

  if [[ "$status" == "ok" ]]; then
    echo "ok ($rowcount stmts)"
    RESULTS+=("ok    $name")
    OK=$((OK+1))
  else
    echo "FAIL — $err"
    RESULTS+=("FAIL  $name  — $err")
    FAIL=$((FAIL+1))
  fi
done

# Reload PostgREST schema cache so new tables/views appear immediately.
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" \
  -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1 || true

echo
echo "=================== summary ==================="
printf '%s\n' "${RESULTS[@]}"
echo "-----------------------------------------------"
echo "total: ${#MIGRATIONS[@]}   ok: $OK   failed: $FAIL"
echo "log:   $LOG_FILE"
echo "==============================================="

[[ $FAIL -eq 0 ]]
