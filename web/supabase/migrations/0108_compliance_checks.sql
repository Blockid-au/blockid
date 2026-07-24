-- Migration 0108 — AU compliance checks (round 5.5a)
--
-- Adds four tables that back the P0 raise-blocker compliance features
-- described in docs/plans/atlassian-standard-mapping-goal.md Phase 6, 9, 10:
--
--   compliance_esic_assessments   — Div 360 ITAA97 Early Stage Innovation
--                                   Company self-assessment history.
--                                   ATO ref:
--                                   https://www.ato.gov.au/business/tax-incentives-for-innovation/in-detail/tax-incentives-for-early-stage-investors/qualifying-as-an-early-stage-innovation-company/
--   compliance_s708_certs         — Sophisticated / wholesale investor
--                                   certificates under s708(8) Corporations
--                                   Act 2001, capped 2yr validity.
--                                   ASIC ref: https://asic.gov.au/regulatory-resources/financial-services/giving-financial-product-advice/wholesale-and-retail-clients-adviser-obligations/
--   compliance_gst_status         — GST A$75k threshold detector snapshot
--                                   per user/project. ATO ref:
--                                   https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst
--   compliance_rd_registrations   — R&D Tax Incentive registration status
--                                   per FY, tracking the 10-month post-FY
--                                   AusIndustry deadline. Ref:
--                                   https://business.gov.au/grants-and-programs/research-and-development-tax-incentive
--
-- Applied via:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--        -v ON_ERROR_STOP=1 < 0108_compliance_checks.sql
-- Then:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--        -c "NOTIFY pgrst, 'reload schema';"
--
-- IMPORTANT: Manual apply — never auto-applied on deploy (project memory
-- reference_db_migrations).

BEGIN;

-- ---------------------------------------------------------------------------
-- compliance_esic_assessments — Div 360 ITAA97 ESIC self-assessments
-- ---------------------------------------------------------------------------
--
-- Each POST /api/compliance/esic writes one row. The most-recent row per
-- (user_id, project_id) is the "current" assessment surfaced in the panel.
-- input_json and result_json use the shapes exported from
-- web/src/lib/compliance/esic-eligibility.ts.

CREATE TABLE IF NOT EXISTS public.compliance_esic_assessments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  input_json    jsonb NOT NULL,
  result_json   jsonb NOT NULL,
  is_esic       boolean NOT NULL DEFAULT false,
  points_100    integer NOT NULL DEFAULT 0,
  assessed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_esic_user_project_idx
  ON public.compliance_esic_assessments (user_id, project_id, assessed_at DESC);

ALTER TABLE public.compliance_esic_assessments ENABLE ROW LEVEL SECURITY;

-- Default-deny: only service-role writes/reads. Founders reach the data
-- through the /api/compliance/esic route which authorises with
-- getCurrentUser() before returning.

-- ---------------------------------------------------------------------------
-- compliance_s708_certs — sophisticated / wholesale investor cert intake
-- ---------------------------------------------------------------------------
--
-- One row per (project, investor, cert_date). Founders upload the
-- accountant's certificate; expiry is auto-computed as cert_date + 2 years
-- per Corporations Act s708(8). Also wired to dataroom_files by the POST
-- handler (SVI dimension "Compliance").

CREATE TABLE IF NOT EXISTS public.compliance_s708_certs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id                uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  investor_email            text NOT NULL,
  certifying_accountant_name text NOT NULL,
  certifying_accountant_firm text NOT NULL,
  cert_type                 text NOT NULL CHECK (cert_type IN ('net_assets','gross_income')),
  cert_date                 date NOT NULL,
  expiry_date               date NOT NULL,
  evidence_url              text,
  dataroom_file_id          uuid REFERENCES public.dataroom_files(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_s708_user_project_idx
  ON public.compliance_s708_certs (user_id, project_id, cert_date DESC);

CREATE INDEX IF NOT EXISTS compliance_s708_expiry_idx
  ON public.compliance_s708_certs (expiry_date);

ALTER TABLE public.compliance_s708_certs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- compliance_gst_status — GST A$75k threshold snapshots
-- ---------------------------------------------------------------------------
--
-- One row per POST /api/compliance/gst-threshold. Latest row per
-- (user_id, project_id) is the "current" state. Stores both the input
-- projection and the derived result so the panel and nudge engine can
-- render without recomputing.

CREATE TABLE IF NOT EXISTS public.compliance_gst_status (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id            uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  input_json            jsonb NOT NULL,
  result_json           jsonb NOT NULL,
  is_above_threshold    boolean NOT NULL DEFAULT false,
  registered_for_gst    boolean NOT NULL DEFAULT false,
  urgency               text NOT NULL DEFAULT 'ok'
                          CHECK (urgency IN ('ok','warning','critical')),
  computed_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_gst_user_project_idx
  ON public.compliance_gst_status (user_id, project_id, computed_at DESC);

ALTER TABLE public.compliance_gst_status ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- compliance_rd_registrations — R&D Tax Incentive per-FY deadlines
-- ---------------------------------------------------------------------------
--
-- One row per (user_id, project_id, fy_label). fy_label is human-readable
-- ("FY 2024-25"). registration_deadline is activity_end + 10 months. Status
-- is derived from days-until-deadline vs registration_date; when the
-- founder registers, POST future may update registration_status +
-- registration_date so the panel can show "Registered" once done.

CREATE TABLE IF NOT EXISTS public.compliance_rd_registrations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id             uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  fy_label               text NOT NULL,
  activity_start         date NOT NULL,
  activity_end           date NOT NULL,
  registration_deadline  date NOT NULL,
  registration_status    text NOT NULL DEFAULT 'not_registered'
                           CHECK (registration_status IN (
                             'not_registered','registered','not_applicable','overdue'
                           )),
  registration_date      date,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id, fy_label)
);

CREATE INDEX IF NOT EXISTS compliance_rd_user_project_idx
  ON public.compliance_rd_registrations (user_id, project_id, registration_deadline);

ALTER TABLE public.compliance_rd_registrations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.compliance_rd_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compliance_rd_touch_updated_at
  ON public.compliance_rd_registrations;

CREATE TRIGGER trg_compliance_rd_touch_updated_at
  BEFORE UPDATE ON public.compliance_rd_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.compliance_rd_touch_updated_at();

COMMENT ON TABLE public.compliance_esic_assessments IS
  'Div 360 ITAA97 ESIC eligibility self-assessments. Not tax advice — see route handler for disclaimer.';
COMMENT ON TABLE public.compliance_s708_certs IS
  'Corporations Act s708(8) wholesale investor certificates. Validity 2 years from cert_date.';
COMMENT ON TABLE public.compliance_gst_status IS
  'GST A$75k threshold snapshots per user/project.';
COMMENT ON TABLE public.compliance_rd_registrations IS
  'R&D Tax Incentive registration status per FY. Deadline = activity_end + 10 months (AusIndustry).';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
