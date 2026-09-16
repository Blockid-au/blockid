-- 0395_report_v2_columns.sql — G13-W1-R1 (S-R1) ReportV2 persistence.
--
-- Spec: docs/plans/investor-clarity-2026-09-15/12-product-ai-tbr-v2.md §A
-- ("One JSON document (ReportV2) is generated once per run and persisted in
-- svi_snapshots.report_v2 (jsonb) + assembled_reports.report_json").
--
-- Both columns are nullable and there is NO backfill: readers (web TBR,
-- /tbr/[token], /api/svi/report/[projectId]) build v2 on read from
-- dim_results / criterion_results via src/lib/report-v2/adapter.ts when the
-- column is null (risk R5 mitigation). Writers populate report_v2 /
-- report_json with a best-effort UPDATE after the row exists, so this
-- migration can be applied before or after the code deploy.
--
-- Apply by hand: scripts/db/apply-migration.sh web/supabase/migrations/0395_report_v2_columns.sql
-- (the script records the ledger row and sends NOTIFY pgrst, 'reload schema').
-- Idempotent: IF NOT EXISTS everywhere; safe to re-run.

ALTER TABLE public.svi_snapshots
  ADD COLUMN IF NOT EXISTS report_v2 jsonb;

COMMENT ON COLUMN public.svi_snapshots.report_v2 IS
  'ReportV2 (schemaVersion 2.0) — the one JSON contract every Trusted Business Report surface renders from. NULL for snapshots written before G13-W1-R1; the read-time adapter builds v2 from dim_results / criterion_results.';

ALTER TABLE public.assembled_reports
  ADD COLUMN IF NOT EXISTS report_json jsonb;

COMMENT ON COLUMN public.assembled_reports.report_json IS
  'ReportV2 projection of the assembled C-level report (src/lib/report-v2/adapter.ts fromAssembledReport). NULL for reports generated before G13-W1-R1.';

-- Partial index so "latest snapshot with a v2 document for this project"
-- stays cheap once the pipeline writes report_v2 (S-R3). Rows with NULL are
-- excluded, so old snapshots cost nothing here.
CREATE INDEX IF NOT EXISTS idx_svi_snapshots_report_v2_present
  ON public.svi_snapshots (project_id, created_at DESC)
  WHERE report_v2 IS NOT NULL;
