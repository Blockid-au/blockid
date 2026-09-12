#!/usr/bin/env bash
# scripts/db/apply-migration.sh <migration.sql> [<migration.sql> ...]
#
# Apply one or more SQL migrations to the self-hosted Supabase Postgres
# (docker container `supabase-db`), record each in public.schema_migrations
# (created by 0345_schema_migrations_ledger.sql) and reload the PostgREST
# schema cache. This is THE way to apply a migration on this stack — there is
# no auto-apply on deploy (see web/AGENTS.md → "DB migrations").
#
#   scripts/db/apply-migration.sh supabase/migrations/0346_foo.sql
#   scripts/db/apply-migration.sh --as supabase_admin supabase/migrations/0346_foo.sql
#   scripts/db/apply-migration.sh --dry-run supabase/migrations/0346_foo.sql
#   scripts/db/apply-migration.sh --record-only supabase/migrations/0346_foo.sql   # already applied by hand
#
# Behaviour:
#   * ON_ERROR_STOP=1, one transaction per file (psql -1) unless the file
#     manages its own BEGIN/COMMIT, in which case it is run as-is.
#   * Runs as `postgres` (owner of ~90% of public tables). If Postgres answers
#     "must be owner" / "permission denied" the file is retried as
#     `supabase_admin` (superuser, owner of the Studio/CLI-made tables). The
#     first attempt rolled back, so the retry starts clean.
#   * Refuses to re-apply a file already in the ledger with the same checksum
#     (pass --force to re-run an idempotent file anyway).
#   * After every successful file: upsert into schema_migrations and
#     NOTIFY pgrst, 'reload schema'.
#   * Finally rewrites content/reports/schema-migrations.json (the manifest
#     /api/status reads) via scripts/db/migration-status.mjs --write.
#
# Env: SUPABASE_DB_CONTAINER (default supabase-db), PSQL (full psql command
# override, e.g. "psql postgres://…"; the script appends flags and reads stdin).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db}"
ROLE="postgres"
DRY_RUN=0
RECORD_ONLY=0
FORCE=0
FILES=()

while [ $# -gt 0 ]; do
  case "$1" in
    --as) ROLE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --record-only) RECORD_ONLY=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) FILES+=("$1"); shift ;;
  esac
done
[ ${#FILES[@]} -gt 0 ] || { echo "usage: $0 [--as role] [--dry-run] [--record-only] [--force] <file.sql> ..." >&2; exit 2; }

psql_as() { # psql_as <role> [psql args...]  (stdin → psql)
  local role="$1"; shift
  if [ -n "${PSQL:-}" ]; then
    # shellcheck disable=SC2086
    $PSQL "$@"
  else
    docker exec -i "$CONTAINER" psql -U "$role" -d postgres "$@"
  fi
}

sql_scalar() { # sql_scalar <role> <sql>
  printf '%s\n' "$2" | psql_as "$1" -At -v ON_ERROR_STOP=1
}

ledger_exists() {
  [ "$(sql_scalar postgres "select to_regclass('public.schema_migrations') is not null")" = "t" ]
}

sha256_of() { sha256sum "$1" | cut -d' ' -f1; }

# Does the file open its own transaction at top level?
manages_own_tx() {
  grep -Eiq '^[[:space:]]*begin[[:space:]]*;' "$1"
}

record() { # record <filename> <checksum> <applied_by> <notes>
  local f="$1" sum="$2" by="$3" notes="$4"
  if ! ledger_exists; then
    echo "  ⚠ schema_migrations ledger not present — apply 0345_schema_migrations_ledger.sql first; $f NOT recorded" >&2
    return 1
  fi
  sql_scalar postgres "insert into public.schema_migrations (filename, checksum, applied_by, notes)
    values ('$f', '$sum', '$by', $( [ -n "$notes" ] && printf "'%s'" "${notes//\'/\'\'}" || echo NULL ))
    on conflict (filename) do update set checksum = excluded.checksum, applied_at = now(), applied_by = excluded.applied_by, notes = coalesce(excluded.notes, public.schema_migrations.notes)" >/dev/null
}

apply_one() { # apply_one <path>
  local path="$1"
  [ -f "$path" ] || { echo "✗ no such file: $path" >&2; return 1; }
  local f; f="$(basename "$path")"
  local sum; sum="$(sha256_of "$path")"

  if ledger_exists && [ "$FORCE" = 0 ]; then
    local prev; prev="$(sql_scalar postgres "select coalesce((select checksum from public.schema_migrations where filename='$f'), '')")"
    if [ "$prev" = "$sum" ]; then
      echo "= $f already in ledger with identical checksum — skipping (use --force to re-run)"
      return 0
    elif [ -n "$prev" ]; then
      echo "  ⚠ $f is in the ledger with a DIFFERENT checksum (file edited after apply). Applying again; ledger checksum will be updated." >&2
    fi
  fi

  if [ "$RECORD_ONLY" = 1 ]; then
    record "$f" "$sum" "apply-migration.sh --record-only ($(whoami))" ""
    echo "✓ $f recorded (not executed)"
    return 0
  fi

  local -a flags=(-v ON_ERROR_STOP=1)
  if manages_own_tx "$path"; then
    echo "→ $f (file manages its own BEGIN/COMMIT)"
  else
    flags+=(-1)
    echo "→ $f (single transaction)"
  fi

  if [ "$DRY_RUN" = 1 ]; then
    # Wrap in our own transaction and ROLLBACK. A file's own top-level
    # BEGIN;/COMMIT; lines are commented out so its COMMIT cannot commit
    # the wrapper (nested BEGIN is a no-op warning, COMMIT is not).
    { echo "BEGIN;"; sed -E 's/^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$/-- dry-run: &/I' "$path"; echo "ROLLBACK;"; } \
      | psql_as "$ROLE" -v ON_ERROR_STOP=1 -q 2>&1 | sed 's/^/    /' || return 1
    echo "✓ $f dry-run OK as $ROLE (rolled back)"
    return 0
  fi

  local out rc used_role="$ROLE"
  set +e
  out="$(psql_as "$ROLE" "${flags[@]}" -q < "$path" 2>&1)"; rc=$?
  set -e
  if [ $rc -ne 0 ] && [ "$ROLE" = "postgres" ] && printf '%s' "$out" | grep -Eiq 'must be owner|permission denied'; then
    echo "  ↻ $f: $(printf '%s' "$out" | grep -Ei 'must be owner|permission denied' | head -1) — retrying as supabase_admin"
    used_role="supabase_admin"
    set +e
    out="$(psql_as supabase_admin "${flags[@]}" -q < "$path" 2>&1)"; rc=$?
    set -e
  fi
  if [ $rc -ne 0 ]; then
    echo "✗ $f FAILED (rolled back):" >&2
    printf '%s\n' "$out" | sed 's/^/    /' >&2
    return 1
  fi
  printf '%s\n' "$out" | grep -v '^NOTICE:' | sed 's/^/    /' || true
  local recorded="recorded"
  record "$f" "$sum" "apply-migration.sh as $used_role ($(whoami))" "" || recorded="NOT recorded"
  sql_scalar postgres "NOTIFY pgrst, 'reload schema'" >/dev/null
  echo "✓ $f applied as $used_role, $recorded, PostgREST reloaded"
}

status=0
for p in "${FILES[@]}"; do
  apply_one "$p" || { status=1; break; }
done

if [ "$DRY_RUN" = 0 ] && command -v node >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/migration-status.mjs" ]; then
  node "$SCRIPT_DIR/migration-status.mjs" --write --quiet || echo "  ⚠ could not refresh content/reports/schema-migrations.json" >&2
fi
exit $status
