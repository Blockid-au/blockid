-- Migration 0097 — reseller_report_files (Track A P7.2)
--
-- Metadata table for monthly KPI CSV artifacts uploaded to Supabase Storage.
-- See docs/plans/reseller-module-plan.md § C.6 (R9) + § P7_kpi_reports.
--
-- Design:
--   - One row per (reseller_id, month_key). Row is upserted by the
--     reseller-monthly-report cron after the CSV lands in Storage.
--   - storage_bucket + storage_path recorded so the signed-URL helper can
--     reproduce the object key without re-deriving from reseller code (which
--     could change over time; UUIDs are stable).
--   - Retention gate: /reseller/reports viewer only exposes files whose
--     month_key is within the last 12 calendar months. Cron purges rows +
--     objects whose month_key is >= 24 calendar months old (D4-CLO-07).
--
-- Applied via docker exec psql + NOTIFY pgrst 'reload schema'.
-- Not yet applied to production.

BEGIN;

CREATE TABLE public.reseller_report_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT,
  month_key text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'reseller-reports',
  storage_path text NOT NULL,
  size_bytes int NOT NULL CHECK (size_bytes >= 0),
  row_count int NOT NULL CHECK (row_count >= 0),
  generated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_reseller_report_files_month_key CHECK (
    month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  CONSTRAINT uq_reseller_report_files_scope UNIQUE (reseller_id, month_key)
);

CREATE INDEX idx_reseller_report_files_hot
  ON public.reseller_report_files (reseller_id, month_key DESC);

ALTER TABLE public.reseller_report_files ENABLE ROW LEVEL SECURITY;

-- Default-deny: only service_role reads. The reseller console uses the
-- typed resellerSupabase() wrapper which runs under the service role and
-- self-scopes on reseller_id. No RLS policies are added; PostgREST anon
-- + authenticated roles cannot read this table at all.

COMMENT ON TABLE public.reseller_report_files IS
  'Metadata for reseller monthly KPI CSV artifacts stored in Supabase Storage.';

NOTIFY pgrst, 'reload schema';

COMMIT;
