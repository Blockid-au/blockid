-- 0290_programme_cohorts.sql
-- Phase 5 Batch I sub-task I1 — Programme + Cohort + Participant domain.
--
-- Master Upgrade Plan §19 (Programme surface for accelerators, universities,
-- grants, corporate partners). This migration introduces the DB backing for
-- an owning "programme organisation" (still scaffolded on projects until an
-- orgs table lands) that runs one or more time-boxed cohorts of participating
-- businesses, tracking each participant's application lifecycle plus baseline /
-- midpoint / exit Trust Scores for the programme's outcome reporting.
--
-- FK notes:
--   * owner_org_id references public.projects(id) — a programme is owned by a
--     project row (typically the accelerator or university's own workspace)
--     until the Phase 6 first-class orgs(id) table lands. A follow-up migration
--     will re-point without data loss.
--   * business_id (programme_participants) references public.projects(id) —
--     each participating startup is represented by its project row today.
--   * consent_id references public.consents(id) — every participant grants a
--     consent record permitting the programme to read their profile per §9.4.
--
-- Idempotency: every DDL uses IF NOT EXISTS. Single BEGIN/COMMIT.
--
-- RLS: enabled defense-in-depth (mirrors 0250/0270). The app writes via the
-- service-role key with BYPASSRLS; per-owner policies land in Phase 6 with the
-- orgs table cutover.
--
-- Reserved lane: 02xx spec lane per Master Upgrade Plan §5.2. CEO loop must
-- not author files matching 02xx_*.sql.

BEGIN;

-- ─── programmes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Programme owner. Scaffolded on projects.id until the orgs table lands.
  owner_org_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,

  name text NOT NULL,

  -- programme_kind narrows the enrolment UX + reporting shape:
  --   accelerator  → cohort-based intake with demo-day exit
  --   university   → academic-year cadence, coursework outcomes
  --   grant        → application-driven, single-milestone outcome
  --   corporate    → supplier / procurement onboarding
  --   other        → escape-hatch for future programme kinds
  programme_kind text NOT NULL
    CHECK (programme_kind IN ('accelerator','university','grant','corporate','other')),

  description text,

  -- Intake window. `intake_open` is the source-of-truth boolean the
  -- public directory reads; intake_opens_at / intake_closes_at drive
  -- the automated flip via cron (Phase 5 Batch J).
  intake_open       boolean NOT NULL DEFAULT false,
  intake_opens_at   timestamptz,
  intake_closes_at  timestamptz,

  -- Framework version — pins the evaluation criteria snapshot used by
  -- this programme (references prompt_versions.version for LLM-scored
  -- cohorts or a bespoke framework identifier for manually-scored ones).
  framework_version text,

  -- Free-form programme settings (branding, custom evaluation weights,
  -- exit criteria). JSONB so schema evolves without DDL.
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS programmes_owner_org_idx
  ON public.programmes (owner_org_id);

-- Partial index — the public directory query filters `intake_open=true`
-- and scans stay proportional to the currently-open set.
CREATE INDEX IF NOT EXISTS programmes_intake_open_idx
  ON public.programmes (intake_open)
  WHERE intake_open = true;

ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.programmes IS
  'Master Upgrade Plan §19 — accelerator/university/grant/corporate programme owning one or more cohorts of participating businesses. owner_org_id scaffolded on projects.id until the orgs table lands.';

-- ─── programme_cohorts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.programme_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  programme_id uuid NOT NULL
    REFERENCES public.programmes(id) ON DELETE CASCADE,

  -- Human-friendly cohort label unique within the programme, e.g. "S1 2027".
  label text NOT NULL,

  start_date date NOT NULL,
  end_date   date NOT NULL,

  -- Optional cap on cohort size. NULL = uncapped.
  max_participants integer,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT programme_cohorts_end_after_start
    CHECK (end_date > start_date),
  CONSTRAINT programme_cohorts_max_participants_positive
    CHECK (max_participants IS NULL OR max_participants > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS programme_cohorts_programme_label_uniq
  ON public.programme_cohorts (programme_id, label);

CREATE INDEX IF NOT EXISTS programme_cohorts_programme_start_idx
  ON public.programme_cohorts (programme_id, start_date);

ALTER TABLE public.programme_cohorts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.programme_cohorts IS
  'Time-boxed cohort within a programme (e.g. accelerator batch "S1 2027"). Unique label per programme. Master Upgrade Plan §19.';

-- ─── programme_participants ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.programme_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  cohort_id uuid NOT NULL
    REFERENCES public.programme_cohorts(id) ON DELETE CASCADE,

  -- Participating business. Scaffolded on projects.id until the Phase 2
  -- businesses(id) cutover.
  business_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Application lifecycle. The programme dashboard filters on this.
  --   invited      → programme reached out; not yet actioned
  --   draft        → participant started but hasn't submitted
  --   submitted    → application in review
  --   shortlisted  → advanced past initial screen
  --   accepted     → joined the cohort (sets joined_at)
  --   declined     → programme rejected
  --   withdrawn    → participant pulled out (sets withdrew_at)
  application_status text NOT NULL DEFAULT 'invited'
    CHECK (application_status IN ('invited','draft','submitted','shortlisted','accepted','declined','withdrawn')),

  -- Every participant grants a consent to the programme to read their
  -- profile / evidence per §9.4. Nullable at invite time — set when the
  -- participant clicks "Grant".
  consent_id uuid REFERENCES public.consents(id),

  -- Trust-Score outcome snapshots for the programme's KPI reporting.
  baseline_score integer,
  midpoint_score integer,
  exit_score     integer,

  notes text,

  -- Lifecycle timestamps. joined_at set on accept; withdrew_at set on
  -- withdraw. Both nullable so the intake funnel is queryable pre-accept.
  joined_at   timestamptz,
  withdrew_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS programme_participants_cohort_business_uniq
  ON public.programme_participants (cohort_id, business_id);

CREATE INDEX IF NOT EXISTS programme_participants_cohort_status_idx
  ON public.programme_participants (cohort_id, application_status);

ALTER TABLE public.programme_participants ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.programme_participants IS
  'Master Upgrade Plan §19 — one row per (cohort, business) participant. Tracks application lifecycle + baseline/midpoint/exit Trust Score for programme outcome reporting. consent_id references the consent the participant granted the programme.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
