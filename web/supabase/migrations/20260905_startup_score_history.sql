-- =============================================================================
-- 20260905_startup_score_history.sql
--
-- Persistent startup profile history: every SVI score run, its full inputs,
-- AI analyses, and valuation estimates are stored here so users can track
-- progress over time and compare versions of their startup.
--
-- Tables:
--   startup_score_history  — one row per scoring run, per startup
--   startup_ai_analyses    — one row per AI agent output attached to a run
--
-- View:
--   startup_score_latest   — most recent run per (user_id, startup_id)
--
-- RLS: Enabled on both tables. No user-level policies are defined because
-- BlockID's server routes exclusively use the service-role key, which bypasses
-- RLS entirely. Enabling RLS without open policies ensures the anon/public
-- roles can never read or write this data — defence-in-depth.
--
-- Idempotent: safe to re-run; uses CREATE TABLE IF NOT EXISTS, CREATE INDEX
-- IF NOT EXISTS, and CREATE OR REPLACE VIEW.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- startup_score_history
-- One row per scoring run. startup_id is a derived key formatted as
-- "{user_id}:{slugified-company-name}" to scope scores to a specific startup
-- within a user's account while remaining human-readable.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.startup_score_history (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  startup_id          TEXT        NOT NULL,
  startup_name        TEXT        NOT NULL,

  -- Full ScoreInput object as submitted by the founder
  inputs              JSONB       NOT NULL,

  -- Full SviFullAnalysis object returned by the scoring pipeline (nullable
  -- because the row may be inserted before async analysis completes)
  svi_analysis        JSONB,

  -- Per-dimension sub-scores, keyed by dimension code (e.g. {"FTV": 72, ...})
  sub_scores          JSONB       NOT NULL DEFAULT '{}',

  -- Aggregate SVI total (integer, matches legacy /100 semantics; uncapped
  -- values may exceed 100 — see project_blockid_svi_uncapped memory entry)
  total_score         INTEGER     NOT NULL,

  -- AUD valuation range produced by the CFO valuation agent
  valuation_low_aud   BIGINT,
  valuation_high_aud  BIGINT,

  -- Scoring algorithm version (e.g. "v3.6.8") for forward compatibility
  score_version       TEXT,

  -- Pipeline confidence in the score given the completeness of inputs (0–100)
  confidence_score    NUMERIC(5,2),

  -- List of inputs that were absent or low-quality and reduced confidence
  missing_inputs      JSONB,

  -- Origin platform: 'blockid' (default) or 'svi' (startupvalueindex.com)
  source              TEXT        NOT NULL DEFAULT 'blockid',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index for the primary access pattern: all runs for a specific
-- startup, newest-first
CREATE INDEX IF NOT EXISTS idx_startup_score_history_startup
  ON public.startup_score_history (user_id, startup_id, created_at DESC);

-- Secondary index for listing all runs across all startups for a user
CREATE INDEX IF NOT EXISTS idx_startup_score_history_user
  ON public.startup_score_history (user_id, created_at DESC);

ALTER TABLE public.startup_score_history ENABLE ROW LEVEL SECURITY;

-- No RLS policies — service-role key bypasses RLS; anon/public roles are
-- intentionally denied by the default-deny RLS posture.

-- -----------------------------------------------------------------------------
-- startup_ai_analyses
-- Stores raw AI agent outputs for a given score run. Multiple agents may
-- produce outputs for the same run (CFO valuation, CMO market research, SVI
-- pipeline, etc.), each stored as a separate row keyed by agent_type.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.startup_ai_analyses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  history_id  UUID        NOT NULL REFERENCES public.startup_score_history(id) ON DELETE CASCADE,

  -- Identifies which agent produced this output, e.g.:
  --   'cfo_valuation', 'cmo_market_research', 'svi_analysis',
  --   'cto_tech_review', 'cro_growth_strategy'
  agent_type  TEXT        NOT NULL,

  -- Raw JSON output from the agent (structure varies by agent_type)
  output      JSONB       NOT NULL,

  -- Model identifier used for this output (e.g. 'groq/llama-3.3-70b')
  model_used  TEXT,

  -- Total tokens consumed (prompt + completion) for cost tracking
  tokens_used INTEGER,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index for fetching all agent outputs for a given run
CREATE INDEX IF NOT EXISTS idx_startup_ai_analyses_history_agent
  ON public.startup_ai_analyses (history_id, agent_type);

ALTER TABLE public.startup_ai_analyses ENABLE ROW LEVEL SECURITY;

-- No RLS policies — service-role key bypasses RLS; anon/public roles are
-- intentionally denied by the default-deny RLS posture.

-- -----------------------------------------------------------------------------
-- startup_score_latest (view)
-- Returns the single most recent scoring run per (user_id, startup_id).
-- Used by the workspace dashboard and profile pages to show current state
-- without requiring the application layer to filter.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.startup_score_latest AS
SELECT DISTINCT ON (user_id, startup_id) *
FROM public.startup_score_history
ORDER BY user_id, startup_id, created_at DESC;

-- Notify PostgREST to reload schema so new tables and the view are queryable
-- via the REST API without a service restart.
NOTIFY pgrst, 'reload schema';
