-- =============================================================================
-- BlockID — Investor Heat Scoring & Enhanced View Tracking
--
-- Adds engagement depth columns to score_views and a new investor_heat table
-- that aggregates repeat visits into a 0-100 heat score per viewer.
-- =============================================================================

-- Enhanced view tracking columns
ALTER TABLE public.score_views ADD COLUMN IF NOT EXISTS time_spent_seconds integer;
ALTER TABLE public.score_views ADD COLUMN IF NOT EXISTS sections_viewed text[];
ALTER TABLE public.score_views ADD COLUMN IF NOT EXISTS scroll_depth_pct integer;
ALTER TABLE public.score_views ADD COLUMN IF NOT EXISTS device_type text; -- 'desktop', 'mobile', 'tablet'
ALTER TABLE public.score_views ADD COLUMN IF NOT EXISTS referrer text;

-- Investor heat scores — one row per (slug, viewer_hash) pair
CREATE TABLE IF NOT EXISTS public.investor_heat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  viewer_hash text NOT NULL,
  heat_score integer NOT NULL DEFAULT 0, -- 0-100
  total_views integer NOT NULL DEFAULT 1,
  total_time_seconds integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(slug, viewer_hash)
);

CREATE INDEX IF NOT EXISTS idx_investor_heat_slug ON public.investor_heat(slug, heat_score DESC);
ALTER TABLE public.investor_heat ENABLE ROW LEVEL SECURITY;
