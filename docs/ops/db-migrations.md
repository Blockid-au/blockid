# DB migrations — apply, record, audit

Self-hosted Supabase Postgres in docker `supabase-db`. **Nothing applies
migrations automatically** — `deploy-live.sh` builds and swaps the app only.
Since 2026-09-12 (release QA-2 P0) every applied file is recorded in
`public.schema_migrations` and `/api/status` reports `schema_migrations: ok | pending:<n>`.

## Apply a migration (the only supported way)

```sh
cd web
scripts/db/apply-migration.sh supabase/migrations/0346_whatever.sql
```

What it does, per file: `ON_ERROR_STOP=1`, one transaction (`psql -1`, or the
file's own `BEGIN/COMMIT` if it has one), runs as `postgres` and retries as
`supabase_admin` on "must be owner" / "permission denied", upserts the ledger
row (`filename, applied_at, checksum=sha256, applied_by, notes`), `NOTIFY pgrst,
'reload schema'`, then refreshes `content/reports/schema-migrations.json`
(the manifest `/api/status` reads — **commit it**).

Flags: `--dry-run` (wrapped in a transaction and rolled back), `--as supabase_admin`,
`--record-only` (already applied by hand — just write the ledger row), `--force`
(re-run a file whose checksum is already in the ledger).

## See what is unapplied

```sh
node scripts/db/migration-status.mjs            # pending / deferred / drift / orphan
node scripts/db/migration-status.mjs --strict   # exit 1 if anything is pending (release gate)
```

`drift` = the file was edited after it was applied (checksum differs) — never
edit an applied migration; add a new one. `deferred` = intentionally not
applied yet, listed in `scripts/db/parity-exceptions.json` with `"deferred": true`.

## Audit the live schema against the files (no ledger needed)

```sh
node scripts/db/migration-parity.mjs              # partial / missing / unparsed only
node scripts/db/migration-parity.mjs --verbose    # everything, incl. waivers
node scripts/db/migration-parity.mjs --json
```

Parses every file (tables + columns, ADD COLUMN — including inside `DO $$`
guards — indexes, functions, triggers, policies, views, types/enum values,
extensions, RLS, constraints, and DROPs as "expect absent") and checks
`pg_catalog` / `information_schema`. Statuses: `applied`, `partial` (lists
what is missing), `missing`, `unparsed` (no verifiable DDL — data-only seeds,
`ALTER COLUMN TYPE`, dynamic-SQL DO blocks). Known, documented drift is waived
per object in `scripts/db/parity-exceptions.json`; every waiver is printed.

## Writing a migration

- One concern per file, next free `0NNN_` number (date-prefixed names are
  legacy — do not add more).
- Idempotent: `IF NOT EXISTS`, `OR REPLACE`, DO-guarded `CREATE POLICY`
  (`CREATE POLICY IF NOT EXISTS` is **not** valid Postgres), `ON CONFLICT`.
- User FKs reference `public.app_users(id)`, never `auth.users(id)` — this
  stack's users are not in `auth.users`, so such an FK rejects every insert.
- RLS on from day one; service_role bypasses it, so app writes still work.
- Do not put `BEGIN;/COMMIT;` in the file unless you need savepoints; the
  script wraps it.

## History (why this exists)

2026-08-15 → 2026-09-12: `20260814_tech_analyses.sql` (adds `projects.github_url`)
was never applied, so every project create/update 500'd. The parity audit
then found 15 more files that had never or only partly landed; 0344 repaired
them and 0345 created the ledger and backfilled it. Open items (see
`parity-exceptions.json`): `team_members` has two incompatible shapes in code
(0023 vs 0304); `20260822_investor_portal_core.sql` is deferred (no reader, no RLS).
