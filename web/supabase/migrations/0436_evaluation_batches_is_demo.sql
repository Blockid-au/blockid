-- 0436_evaluation_batches_is_demo.sql
-- ---------------------------------------------------------------------------
-- G24-C (2026-09-21, docs/plans/g24-report-readability-demo-cohort-2026-09-21.md § 2 C)
-- The demo cohort for buyer demos: one `evaluation_batches` row per
-- evaluator (or organisation) flagged `is_demo`, holding five FICTIONAL
-- startups scored deterministically from the demo register fixture
-- (lib/evaluations/demo-cohort.ts) — no AI call, zero cost.
--
--   evaluation_batches.is_demo  boolean NOT NULL DEFAULT false (new column),
--                               partial index on the true rows
--
-- Why
--   A program buyer sees an empty cohort until they import their own CSV,
--   so the founder cannot run a 10-minute workflow demo and the advisor
--   plan's validation Level 2 ("3 workflow demos") needs a real cohort with
--   real founders. The flag lets every cohort surface (table, compare,
--   overrides, snapshots, cohort report, demo-day pack, feedback letters)
--   carry data while the demo stays OUT of: benchmarks and the assessment
--   pools (never written to svi_analyses / svi_snapshots — by construction),
--   the Startup Index, calibration, the organisation audit export and
--   retention (lib/org/scope.ts), the institutional API
--   (/api/v1/institutional/cohorts) and the /admin/validation "Cohort
--   scored" auto rows (a Level-2 "workflow demo run" row replaces them for
--   non-admin seats).
--
-- The demo projects / evaluations rows are ordinary evaluator-owned rows
-- (no ABN, names that cannot collide with a real AU company, "(demo)" in
-- the name) and are removed with the batch by DELETE /api/evaluations/batch/demo.
--
-- Idempotent: IF NOT EXISTS. Readers fall back on 42703 until this file is
-- applied; the demo create route answers 503 `migration_pending` before it.
--
-- Rollback
--   drop index if exists public.evaluation_batches_is_demo_idx;
--   alter table public.evaluation_batches drop column if exists is_demo;
--
-- Apply: scripts/db/apply-migration.sh web/supabase/migrations/0436_evaluation_batches_is_demo.sql
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE public.evaluation_batches
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- The demo lookups are "the demo batch of user X / org Y" — a partial index
-- on the (rare) true rows keeps them O(1) without touching the main list index.
CREATE INDEX IF NOT EXISTS evaluation_batches_is_demo_idx
  ON public.evaluation_batches (user_id, org_id)
  WHERE is_demo = true;

COMMENT ON COLUMN public.evaluation_batches.is_demo IS
  'G24-C: true for the fictional demo cohort (5 invented startups, deterministic scores, no AI). Excluded from benchmarks, the Startup Index, calibration, org export/retention, the institutional API and validation auto rows.';

COMMIT;

NOTIFY pgrst, 'reload schema';
