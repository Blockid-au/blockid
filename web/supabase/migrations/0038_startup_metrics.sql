-- Phase 3 MVP: Add additional metric columns to startup_metrics table
-- for the metrics input form (users, NPS, notes).

-- New columns for the form
ALTER TABLE public.startup_metrics ADD COLUMN IF NOT EXISTS users_total INTEGER;
ALTER TABLE public.startup_metrics ADD COLUMN IF NOT EXISTS users_new INTEGER;
ALTER TABLE public.startup_metrics ADD COLUMN IF NOT EXISTS nps INTEGER;
ALTER TABLE public.startup_metrics ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.startup_metrics ADD COLUMN IF NOT EXISTS revenue NUMERIC(12,2);
ALTER TABLE public.startup_metrics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Index for email lookups (the main query pattern)
CREATE INDEX IF NOT EXISTS idx_startup_metrics_email
  ON public.startup_metrics (email, metric_date DESC);
