-- Migration 0112 — WGEA + Modern Slavery threshold snapshots (round P1n-persist)
--
-- Persists the assessment output from the pure detectors shipped in P1n:
--   web/src/lib/compliance/wgea-threshold.ts            (WGE Act 2012 (Cth) s3)
--   web/src/lib/compliance/modern-slavery-threshold.ts  (MSA 2018 (Cth) s5)
--
-- Mirrors the compliance_gst_status shape from migration 0108 so the
-- dashboard CompliancePanel can consume the latest row per
-- (user_id, project_id) without recomputing.
--
-- Applied via:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--        -v ON_ERROR_STOP=1 < 0112_compliance_wgea_modern_slavery.sql
-- Then:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--        -c "NOTIFY pgrst, 'reload schema';"
--
-- Manual apply — never auto-applied on deploy (project memory
-- reference_db_migrations).

BEGIN;

-- ---------------------------------------------------------------------------
-- compliance_wgea_status — WGEA 100-employee threshold snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.compliance_wgea_status (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id            uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  input_json            jsonb NOT NULL,
  result_json           jsonb NOT NULL,
  is_relevant_employer  boolean NOT NULL DEFAULT false,
  is_above_threshold    boolean NOT NULL DEFAULT false,
  action_required       text NOT NULL DEFAULT 'not_required'
                          CHECK (action_required IN (
                            'not_required','approaching_threshold',
                            'report_required','grace_period','already_reporting'
                          )),
  urgency               text NOT NULL DEFAULT 'ok'
                          CHECK (urgency IN ('ok','warning','critical')),
  computed_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_wgea_user_project_idx
  ON public.compliance_wgea_status (user_id, project_id, computed_at DESC);

ALTER TABLE public.compliance_wgea_status ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- compliance_modern_slavery_status — Modern Slavery A$100M snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.compliance_modern_slavery_status (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id            uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  input_json            jsonb NOT NULL,
  result_json           jsonb NOT NULL,
  is_reporting_entity   boolean NOT NULL DEFAULT false,
  is_above_threshold    boolean NOT NULL DEFAULT false,
  action_required       text NOT NULL DEFAULT 'not_required'
                          CHECK (action_required IN (
                            'not_required','approaching_threshold',
                            'statement_required','statement_due_soon',
                            'statement_overdue','already_lodged'
                          )),
  urgency               text NOT NULL DEFAULT 'ok'
                          CHECK (urgency IN ('ok','warning','critical')),
  computed_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_modern_slavery_user_project_idx
  ON public.compliance_modern_slavery_status (user_id, project_id, computed_at DESC);

ALTER TABLE public.compliance_modern_slavery_status ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.compliance_wgea_status IS
  'WGE Act 2012 (Cth) 100-employee threshold snapshots per user/project.';
COMMENT ON TABLE public.compliance_modern_slavery_status IS
  'Modern Slavery Act 2018 (Cth) A$100M consolidated-revenue threshold snapshots per user/project.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
