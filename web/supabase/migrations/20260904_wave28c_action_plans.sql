-- Wave 28C: Personalised 30-Day Action Plan — persistence + task tracking.
--
-- Founders see a 5-task AI-generated plan below the SVI result on `/score` and
-- `/workspace/business-report`. Each task targets the two weakest SVI
-- dimensions (score < 60), quotes the relevant W23 criterion, and carries a
-- `target_delta_points` estimate anchored to the sector's 75th percentile
-- benchmark from Wave 27B (`svi_sector_benchmarks`). Progress persists per
-- `svi_snapshots.id` (treated here as the canonical svi_run_id) so the next
-- re-score (deck-hash cache miss path) can render delta actual-vs-target.
--
-- Additive only — no existing tables or columns are modified.
--
--   svi_action_plans   — one row per svi_run_id (UNIQUE); stores the raw AI
--                        `plan` JSON envelope (model, provider, sector,
--                        weakest_dims, generated_at). Rows keyed on svi_run_id
--                        so the generate endpoint is idempotent.
--   svi_action_tasks   — five rows per plan (order_index 0-4). Each row is
--                        individually checkable; `completed_at` is nullable
--                        (null = open, timestamp = done). `evidence_url` is
--                        optional and lets founders attach a proof link on
--                        toggle.

CREATE TABLE IF NOT EXISTS public.svi_action_plans (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL,
  startup_id   UUID,
  svi_run_id   UUID NOT NULL,
  plan         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (svi_run_id)
);

CREATE INDEX IF NOT EXISTS idx_svi_action_plans_user_created
  ON public.svi_action_plans (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_svi_action_plans_startup
  ON public.svi_action_plans (startup_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.svi_action_tasks (
  id                  BIGSERIAL PRIMARY KEY,
  plan_id             BIGINT NOT NULL REFERENCES public.svi_action_plans(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  detail              TEXT,
  criterion           TEXT,
  dim                 TEXT,
  target_delta_points NUMERIC(5,2),
  completed_at        TIMESTAMPTZ,
  evidence_url        TEXT,
  order_index         INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_svi_action_tasks_plan
  ON public.svi_action_tasks (plan_id, order_index);

-- Notify PostgREST to reload schema so the new tables are queryable via the
-- REST API without a service restart.
NOTIFY pgrst, 'reload schema';
