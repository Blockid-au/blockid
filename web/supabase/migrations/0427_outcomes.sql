-- 0427_outcomes.sql
-- ---------------------------------------------------------------------------
-- G21 P3-A (2026-09-20, docs/plans/g21-fi-upgrade-2026-09-20.md § P3-A;
-- docs/product/score-governance.md § 13 "Outcome calibration").
-- The outcome ledger: what actually happened to a company after it was
-- assessed. Every row is an OBSERVATION (a round closed, revenue grew, the
-- company survived, moved stage, won a grant, was selected by a program,
-- grew headcount, shipped a release) with the date it was observed, the
-- source that reported it and a confidence. Proposals derived from existing
-- signals (external registers, connector revenue deltas, stage changes,
-- cohort decisions) are written with status "proposed" and NEVER
-- auto-confirmed — a person confirms or rejects. Confirmed outcomes are the
-- only rows the calibration script (scripts/calibration/run.ts) reads, and
-- calibration publishes rates per band with n and intervals — it never
-- claims to forecast an individual company.
--
--   project_id    the startup (projects, CASCADE — projects-only FKs)
--   kind          funding_raised | revenue_growth | survival | next_stage |
--                 grant_success | accelerator_selection | headcount_growth |
--                 product_release
--   observed_at   when the outcome happened (not when it was recorded)
--   value         structured detail per kind, e.g. {"amount_aud": 500000,
--                 "round": "pre-seed", "source_url": "…"}; {"mrr_from_aud",
--                 "mrr_to_aud", "growth_pct"}; {"from_stage", "to_stage"};
--                 {"program", "agency", "amount_aud"}; {"tag", "repo"}
--   source        founder | evaluator | connector | external_signal | admin
--   confidence    0–100 — the reporter's confidence (founder 60, evaluator
--                 70, connector 85, external register 90, admin 95 by
--                 default; a confirmation does not change it)
--   recorded_by   who recorded / proposed the row (app_users, SET NULL on
--                 erasure; NULL for cron proposals)
--   status        proposed | confirmed | rejected
--   confirmed_by  who confirmed / rejected (app_users, SET NULL)
--   confirmed_at  when the status left "proposed"
--   note          free text (≤ 2 000 chars) — the reporter's or reviewer's
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS). NOT applied by the
-- lane — the merging session applies via scripts/db/apply-migration.sh and
-- commits content/reports/schema-migrations.json. The two app_users FKs are
-- mapped in src/lib/privacy/erasure-map.ts and erase_account() is
-- re-emitted by 0429_erasure_map_outcomes.sql.
--
-- Rollback
--   DROP TABLE IF EXISTS public.startup_outcomes;

CREATE TABLE IF NOT EXISTS public.startup_outcomes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN (
                  'funding_raised',
                  'revenue_growth',
                  'survival',
                  'next_stage',
                  'grant_success',
                  'accelerator_selection',
                  'headcount_growth',
                  'product_release'
                )),
  observed_at   timestamptz NOT NULL,
  value         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(value) = 'object'),
  source        text NOT NULL CHECK (source IN ('founder', 'evaluator', 'connector', 'external_signal', 'admin')),
  confidence    numeric(5,2) NOT NULL DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  recorded_by   uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  confirmed_by  uuid NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  confirmed_at  timestamptz NULL,
  note          text NULL CHECK (note IS NULL OR char_length(note) <= 2000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT startup_outcomes_unique_observation UNIQUE (project_id, kind, observed_at, source)
);

CREATE INDEX IF NOT EXISTS startup_outcomes_project_observed_idx
  ON public.startup_outcomes (project_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS startup_outcomes_proposed_idx
  ON public.startup_outcomes (status, created_at DESC)
  WHERE status = 'proposed';

CREATE INDEX IF NOT EXISTS startup_outcomes_confirmed_kind_idx
  ON public.startup_outcomes (kind, observed_at DESC)
  WHERE status = 'confirmed';

COMMENT ON TABLE public.startup_outcomes IS
  'G21 P3-A: the outcome ledger — dated, sourced observations of what happened to a startup after assessment (funding, revenue growth, survival, stage, grants, program selection, headcount, releases). Proposals from signals land as status=proposed and are confirmed by a person, never automatically. Only confirmed rows feed calibration. project_id FKs projects (CASCADE); user FKs app_users (SET NULL).';

COMMENT ON COLUMN public.startup_outcomes.confidence IS
  'The reporter''s confidence 0–100 in the observation (default by source: founder 60, evaluator 70, connector 85, external_signal 90, admin 95). Confirmation records who and when; it does not rewrite the confidence.';

-- ─── RLS: the project owner reads + inserts; every status change is service-role ──

ALTER TABLE public.startup_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS startup_outcomes_owner_select ON public.startup_outcomes;
CREATE POLICY startup_outcomes_owner_select ON public.startup_outcomes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = startup_outcomes.project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS startup_outcomes_owner_insert ON public.startup_outcomes;
CREATE POLICY startup_outcomes_owner_insert ON public.startup_outcomes
  FOR INSERT WITH CHECK (
    recorded_by = auth.uid()
    AND source = 'founder'
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = startup_outcomes.project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS startup_outcomes_service_all ON public.startup_outcomes;
CREATE POLICY startup_outcomes_service_all ON public.startup_outcomes
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
