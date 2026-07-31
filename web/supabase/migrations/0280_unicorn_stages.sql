-- 0280_unicorn_stages.sql
-- Phase 6 Batch J · sub-J1 — Unicorn Standard Framework tables.
--
-- Master Upgrade Plan §17 (Unicorn Standard Framework from Day 0) + §17.6
-- (Repo structure). Introduces the four canonical tables that back the
-- Day-0 unicorn framework: a seeded stage catalogue (S0-S5), one active
-- progression row per business, per-stage dated milestones, and an
-- append-only stage_ai_runs ledger for nightly C-Level evaluations.
--
-- FK notes
-- --------
--   * business_id references public.projects(id) in this phase. The v3
--     first-class businesses(id) table lifts these FKs in a follow-up
--     migration (see 0202_business_profile_view.sql header).
--   * unicorn_stages is a fixed catalogue table (6 rows) — modelled as a
--     text-PK enum-like reference table so the framework can be extended
--     without a code deploy (e.g. an S6 introspection stage later).
--
-- Idempotency: every DDL uses IF NOT EXISTS. Single BEGIN/COMMIT.
-- Seed rows use ON CONFLICT DO UPDATE so re-runs pick up copy edits.
--
-- Reserved lane: this migration sits in the 02xx spec lane per Master
-- Upgrade Plan §5.2. CEO loop must not author files matching 02xx_*.sql.

BEGIN;

-- ─── Table 1: unicorn_stages (canonical catalogue) ──────────────────

CREATE TABLE IF NOT EXISTS public.unicorn_stages (
  id                       text PRIMARY KEY,
  stage_number             smallint NOT NULL
    CHECK (stage_number BETWEEN 0 AND 5),
  label                    text NOT NULL,
  window_days_min          integer NOT NULL,
  window_days_max          integer NOT NULL,
  exit_verification_level  smallint NOT NULL
    CHECK (exit_verification_level BETWEEN 0 AND 5),
  exit_trust_score         smallint NOT NULL
    CHECK (exit_trust_score BETWEEN 0 AND 100),
  mandatory_areas          text[] NOT NULL DEFAULT '{}',
  exit_output              text NOT NULL,
  CHECK (window_days_max >= window_days_min)
);

COMMENT ON TABLE public.unicorn_stages IS
  'Canonical Day-0 unicorn framework catalogue (S0-S5). Seeded from Master Upgrade Plan §17.3. One row per stage; PK is the stable stage code (S0/S1/...) so business_stage_progress can FK-reference it.';

INSERT INTO public.unicorn_stages
  (id, stage_number, label, window_days_min, window_days_max,
   exit_verification_level, exit_trust_score, mandatory_areas, exit_output)
VALUES
  ('S0', 0, 'Genesis',        0,   14,  1, 20,
   ARRAY['identity','ownership'],
   'Genesis Certificate PDF'),
  ('S1', 1, 'Foundation',     15,  60,  2, 40,
   ARRAY['identity','ownership','governance','finance_baseline','product'],
   'Foundation Trust Report (free preview)'),
  ('S2', 2, 'Traction',       61,  180, 3, 60,
   ARRAY['identity','ownership','governance','finance_baseline','product',
         'revenue','gtm','customers'],
   'Traction Trust Business Report (A$5 / credits)'),
  ('S3', 3, 'Scale',          181, 365, 3, 65,
   ARRAY['identity','ownership','governance','finance_baseline','product',
         'revenue','gtm','customers','compliance','risk','people','ip'],
   'Scale Trust Report v2 + investor share links'),
  ('S4', 4, 'Growth',         366, 730, 4, 75,
   ARRAY['identity','ownership','governance','finance_baseline','product',
         'revenue','gtm','customers','compliance','risk','people','ip',
         'sustainability','data_moat'],
   'Growth-Ready Trust Report + procurement export'),
  ('S5', 5, 'Unicorn-track',  731, 99999, 5, 85,
   ARRAY['identity','ownership','governance','finance_baseline','product',
         'revenue','gtm','customers','compliance','risk','people','ip',
         'sustainability','data_moat'],
   'Unicorn Track Certification (NFT badge)')
ON CONFLICT (id) DO UPDATE SET
  stage_number            = EXCLUDED.stage_number,
  label                   = EXCLUDED.label,
  window_days_min         = EXCLUDED.window_days_min,
  window_days_max         = EXCLUDED.window_days_max,
  exit_verification_level = EXCLUDED.exit_verification_level,
  exit_trust_score        = EXCLUDED.exit_trust_score,
  mandatory_areas         = EXCLUDED.mandatory_areas,
  exit_output             = EXCLUDED.exit_output;

ALTER TABLE public.unicorn_stages ENABLE ROW LEVEL SECURITY;

-- SELECT open to any authenticated caller + service_role. INSERT/UPDATE
-- restricted to service_role (catalogue edits happen via migration).
DROP POLICY IF EXISTS unicorn_stages_read ON public.unicorn_stages;
CREATE POLICY unicorn_stages_read ON public.unicorn_stages
  FOR SELECT TO authenticated, service_role USING (true);

DROP POLICY IF EXISTS unicorn_stages_write ON public.unicorn_stages;
CREATE POLICY unicorn_stages_write ON public.unicorn_stages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Table 2: business_stage_progress (one active per business) ─────

CREATE TABLE IF NOT EXISTS public.business_stage_progress (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,
  current_stage_id      text NOT NULL
    REFERENCES public.unicorn_stages(id),
  stage_entered_at      timestamptz NOT NULL DEFAULT now(),
  stage_exit_target_at  timestamptz,
  stage_exited_at       timestamptz,
  on_track              boolean NOT NULL DEFAULT true,
  open_blockers         integer NOT NULL DEFAULT 0
    CHECK (open_blockers >= 0),
  last_evaluated_at     timestamptz,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- One active (not-yet-exited) progression row per business. Historical
-- rows carry stage_exited_at IS NOT NULL and coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS business_stage_progress_active_uniq
  ON public.business_stage_progress (business_id)
  WHERE stage_exited_at IS NULL;

CREATE INDEX IF NOT EXISTS business_stage_progress_stage_entered_idx
  ON public.business_stage_progress (current_stage_id, stage_entered_at);

CREATE INDEX IF NOT EXISTS business_stage_progress_business_idx
  ON public.business_stage_progress (business_id);

ALTER TABLE public.business_stage_progress ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.business_stage_progress IS
  'One row per (business, stage) progression. Active row has stage_exited_at IS NULL (partial UNIQUE enforces one active per business). Historical rows preserve the stage timeline for the /id/[slug] badge history and the nightly on-track calculation.';

-- ─── Table 3: stage_milestones (dated deliverables per stage) ───────

CREATE TABLE IF NOT EXISTS public.stage_milestones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id          text NOT NULL
    REFERENCES public.unicorn_stages(id),
  code              text NOT NULL,          -- e.g. 'abn_verified', 'mvp_linked'
  label             text NOT NULL,
  due_at            timestamptz,
  completed_at      timestamptz,
  owner_agent       text,                   -- e.g. 'ceo', 'cfo', 'clo'
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS stage_milestones_business_stage_code_uniq
  ON public.stage_milestones (business_id, stage_id, code);

CREATE INDEX IF NOT EXISTS stage_milestones_business_stage_idx
  ON public.stage_milestones (business_id, stage_id);

ALTER TABLE public.stage_milestones ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stage_milestones IS
  'Dated deliverables per (business, stage). UNIQUE on (business_id, stage_id, code) so re-seeding from the framework catalogue is idempotent. owner_agent slot lets the dashboard render a C-Level avatar next to each milestone card.';

-- ─── Table 4: stage_ai_runs (append-only nightly ledger) ────────────

CREATE TABLE IF NOT EXISTS public.stage_ai_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id              text NOT NULL
    REFERENCES public.unicorn_stages(id),
  ran_at                timestamptz NOT NULL DEFAULT now(),
  agent                 text,                    -- 'ceo', 'cfo', 'llm-auditor', ...
  verification_level    smallint,
  trust_score           smallint,
  covered_areas         text[] NOT NULL DEFAULT '{}',
  blocker_count         integer NOT NULL DEFAULT 0,
  on_track              boolean,
  can_advance           boolean,
  critical_findings     jsonb NOT NULL DEFAULT '[]'::jsonb,
  eval_snapshot         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS stage_ai_runs_business_ran_idx
  ON public.stage_ai_runs (business_id, ran_at DESC);

CREATE INDEX IF NOT EXISTS stage_ai_runs_stage_ran_idx
  ON public.stage_ai_runs (stage_id, ran_at DESC);

ALTER TABLE public.stage_ai_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stage_ai_runs IS
  'Append-only ledger of nightly CEO-agent evaluations per business (§17.8). Feeds the UnicornPathDashboard blocker queue and the cohort/investor histogram. Never updated in place — a fresh row per tick.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
