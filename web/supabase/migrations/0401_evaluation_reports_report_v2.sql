-- 0401_evaluation_reports_report_v2.sql — G13-W4-R4 (S-R4) evaluator TBR persistence.
--
-- Spec: docs/plans/investor-clarity-2026-09-15/12-product-ai-tbr-v2.md §F S-R4
-- ("Migration: evaluation_reports.report_v2 jsonb (or FK to snapshot)").
--
-- Every Trust BizReport an evaluator runs (POST /api/evaluations/[id]/report,
-- kind=full) now stores the ReportV2 document the run produced, next to the
-- billing/quota row, so the Investor Dossier and the evaluator's PDF/DOCX
-- render exactly what was on screen when the assessment was written — even
-- after the founder re-scores (svi_snapshots moves on, this row does not).
--
-- Nullable, no backfill: rows written before this migration keep reading the
-- snapshot's report_v2 (0395) or the read-time adapter. The writer
-- (src/lib/report-v2/storage.ts writeEvaluationReportV2) is a best-effort
-- UPDATE after the insert, so the migration can land before or after the
-- code deploy.
--
-- Apply by hand: scripts/db/apply-migration.sh web/supabase/migrations/0401_evaluation_reports_report_v2.sql
-- (records the ledger row and sends NOTIFY pgrst, 'reload schema').
-- Idempotent: IF NOT EXISTS everywhere; safe to re-run.

ALTER TABLE public.evaluation_reports
  ADD COLUMN IF NOT EXISTS report_v2 jsonb;

COMMENT ON COLUMN public.evaluation_reports.report_v2 IS
  'ReportV2 (schemaVersion 2.0) produced by the run this row bills — the document the evaluator saw. NULL for rows before G13-W4-R4 or when the write failed; readers fall back to svi_snapshots.report_v2 / the adapter.';

-- "Latest evaluator report with a v2 document for this evaluation" stays an
-- index walk; NULL rows (all history before S-R4) cost nothing here.
CREATE INDEX IF NOT EXISTS idx_evaluation_reports_report_v2_present
  ON public.evaluation_reports (evaluation_id, created_at DESC)
  WHERE report_v2 IS NOT NULL;
