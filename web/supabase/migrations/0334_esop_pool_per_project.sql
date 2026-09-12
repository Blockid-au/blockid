-- 0334_esop_pool_per_project.sql — S18-A review P2-4
-- ---------------------------------------------------------------------------
-- `esop_pool` (0029) was created with `account_id uuid not null unique` —
-- ONE pool per founder account — before 0036 added `project_id`. The
-- cap-table `setup_esop` upsert conflicts on `account_id` while stamping
-- `project_id`, so the second project's setup silently OVERWROTE the first
-- project's pool and relabelled it; the project-filtered GET then hid it
-- from project A.
--
-- Fix: one pool per (account_id, project_id).
--   * drop the per-account unique constraint;
--   * unique index on (account_id, project_id) NULLS NOT DISTINCT — the same
--     pattern as data_rooms (0123) — so PostgREST can upsert with
--     `onConflict: "account_id,project_id"` (ON CONFLICT inference needs a
--     non-partial unique index) AND a legacy null-project row cannot be
--     duplicated (Postgres treats NULLs as distinct by default);
--   * an explicit partial unique on (account_id) WHERE project_id IS NULL
--     documents the legacy invariant (at most one pre-project pool per
--     account) even if the composite index is ever rebuilt without
--     NULLS NOT DISTINCT.
--
-- Data: under the old constraint the table holds at most one row per
-- account, so no existing rows can violate the new indexes; nothing to
-- de-duplicate. Existing project-stamped rows keep working (they already
-- carry the project_id GET filters on).
--
-- Apply (NOT auto-applied on deploy — see memory/reference_db_migrations):
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     -f /path/to/0334_esop_pool_per_project.sql
--   (if "must be owner of table esop_pool": rerun with -U supabase_admin)
--   then: NOTIFY pgrst, 'reload schema';
--
-- Idempotent: DROP … IF EXISTS / CREATE … IF NOT EXISTS, safe to re-run.
-- Requires PostgreSQL ≥ 15 (NULLS NOT DISTINCT) — prod is 15.8.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. The 0029 inline `unique` → constraint `esop_pool_account_id_key`
--    (plus its backing index). Drop both forms defensively.
ALTER TABLE public.esop_pool DROP CONSTRAINT IF EXISTS esop_pool_account_id_key;
DROP INDEX IF EXISTS public.esop_pool_account_id_key;

-- 2. One pool per (account, project); NULL project counts as a value so the
--    legacy row is also unique per account and upsertable via ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS esop_pool_account_project_uidx
  ON public.esop_pool (account_id, project_id) NULLS NOT DISTINCT;

-- 3. Legacy invariant, stated explicitly.
CREATE UNIQUE INDEX IF NOT EXISTS esop_pool_account_legacy_uidx
  ON public.esop_pool (account_id) WHERE project_id IS NULL;

COMMENT ON INDEX public.esop_pool_account_project_uidx IS
  'S18-A review P2-4: one ESOP pool per (account_id, project_id); NULLS NOT DISTINCT so the pre-project (NULL) pool is unique too and cap-table setup_esop can upsert onConflict account_id,project_id.';

COMMIT;

NOTIFY pgrst, 'reload schema';
