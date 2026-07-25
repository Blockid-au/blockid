-- Migration 0116 — ATO tax-invoice check snapshots (round P5-tax-invoice-checker-persist)
--
-- Persists the assessment output from the pure lib shipped in P5-tax-invoice-checker:
--   web/src/lib/compliance/tax-invoice-checker.ts
--     A New Tax System (Goods and Services Tax) Act 1999 (Cth) s 29-70(1)
--     ATO GSTR 2013/1 (waivers + recipient-created tax invoices)
--
-- Mirrors the compliance_wgea_status / compliance_modern_slavery_status
-- shape from migration 0112 so the CompliancePanel + the founder wizard
-- at /workspace/tax-invoice-checker (P5-tax-invoice-checker-ui) can
-- consume the latest row per (user_id, project_id) without recomputing.
--
-- Applied via (per project memory reference_db_migrations):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--        -v ON_ERROR_STOP=1 < 0116_compliance_tax_invoice_checks.sql
-- Then:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--        -c "NOTIFY pgrst, 'reload schema';"
--
-- Manual apply — never auto-applied on deploy.

BEGIN;

CREATE TABLE IF NOT EXISTS public.compliance_tax_invoice_checks (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id                  uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  input_json                  jsonb NOT NULL,
  result_json                 jsonb NOT NULL,
  ok                          boolean NOT NULL DEFAULT false,
  band                        text NOT NULL DEFAULT 'under_threshold'
                                CHECK (band IN ('under_threshold','standard','large')),
  gst_inclusive_total_aud     numeric(14,2) NOT NULL DEFAULT 0,
  computed_gst_component_aud  numeric(14,2) NOT NULL DEFAULT 0,
  missing_field_count         integer NOT NULL DEFAULT 0 CHECK (missing_field_count >= 0),
  warning_count               integer NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  computed_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_tax_invoice_user_project_idx
  ON public.compliance_tax_invoice_checks (user_id, project_id, computed_at DESC);

ALTER TABLE public.compliance_tax_invoice_checks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.compliance_tax_invoice_checks IS
  'ATO tax-invoice validity snapshots per user/project — GST Act s 29-70(1).';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
