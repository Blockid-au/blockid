-- 0415_assembled_reports_analysis_id_text.sql
-- ---------------------------------------------------------------------------
-- G19-S46 (2026-09-20, docs/plans/g19-report-quality-2026-09-20.md § 0 row 6)
-- Found by BlockID's own report run: `assembled_reports.analysis_id` is
-- `uuid` but `svi_analyses.id` is `text` — every analysis id is a 12-char
-- slug (lib/slug newSlug: "WJM57gf49KKf", "4GmrFM7TPJZr", …), so EVERY
-- `assembled_reports` insert from run-for-project / the founder route has
-- failed with 22P02 ("invalid input syntax for type uuid") since the slug
-- ids arrived: the live table holds 0 rows, the `agent_report_tasks` insert
-- then fails its FK, and `assembled_reports.report_json` (S45 paid view /
-- DOCX / e-mail readers) was never written. The pipeline logged the error
-- and carried on (best effort), which is why nothing alerted.
--
-- Fix: the column becomes `text` (the same type as svi_analyses.id). No FK
-- is added — the historical rows (none) and the evaluator path's synthesised
-- analyses must never block a report. Idempotent: no-op when already text.
--
-- Rollback
--   ALTER TABLE public.assembled_reports
--     ALTER COLUMN analysis_id TYPE uuid USING NULLIF(analysis_id, '')::uuid;
--   (only safe while every stored value is uuid-shaped).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assembled_reports'
      AND column_name = 'analysis_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.assembled_reports
      ALTER COLUMN analysis_id TYPE text USING analysis_id::text;
  END IF;
END $$;

COMMENT ON COLUMN public.assembled_reports.analysis_id IS
  'svi_analyses.id (text slug) the report was generated from — G19-S46 0415 widened from uuid';

NOTIFY pgrst, 'reload schema';
