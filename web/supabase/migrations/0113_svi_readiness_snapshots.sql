-- Migration 0113 — investor readiness snapshots per (user, project) (round P7b)
--
-- Persists the output of `computeNextSteps()` (web/src/lib/nudge/next-steps.ts)
-- so the founder-side weekly digest (P7a — follow-up) can compute a
-- score-delta versus the previous digest run without recomputing every
-- historic tick.
--
-- Contract: docs/plans/atlassian-standard-mapping-goal.md §P7 exit criteria
--   "digest section 'Your investor readiness this week' renders
--    {score band, delta vs last week, single next action, top-3 missing}"
--
-- Mirrors the compliance_gst_status shape from migration 0108 so the
-- read pattern (latest row per user_id, project_id, computed_at DESC)
-- is consistent with the other snapshot tables shipped in this file.
--
-- Applied via:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--        -v ON_ERROR_STOP=1 < 0113_svi_readiness_snapshots.sql
-- Then:
--   docker exec -i supabase-db psql -U postgres -d postgres \
--        -c "NOTIFY pgrst, 'reload schema';"
--
-- Manual apply — never auto-applied on deploy (project memory
-- reference_db_migrations).

BEGIN;

CREATE TABLE IF NOT EXISTS public.svi_readiness_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id            uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_slug            text NOT NULL,
  overall_score         smallint NOT NULL
                          CHECK (overall_score BETWEEN 0 AND 100),
  band                  text NOT NULL DEFAULT 'not-ready'
                          CHECK (band IN ('not-ready','warming-up','investor-ready')),
  readiness_by_phase    jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_top3          jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_action_title     text,
  source                text NOT NULL DEFAULT 'nudge_engine'
                          CHECK (source IN ('nudge_engine','manual','cron','digest')),
  computed_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS svi_readiness_snapshots_user_project_idx
  ON public.svi_readiness_snapshots (user_id, project_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS svi_readiness_snapshots_computed_at_idx
  ON public.svi_readiness_snapshots (computed_at DESC);

ALTER TABLE public.svi_readiness_snapshots ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.svi_readiness_snapshots IS
  'Investor readiness snapshots per (user, project) — feeds P7a founder-weekly-digest score-delta.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
