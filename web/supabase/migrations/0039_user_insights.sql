CREATE TABLE IF NOT EXISTS public.user_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID,
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,
  relevance_score NUMERIC(3,2),
  source TEXT,
  read_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_insights_user ON public.user_insights(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_insights_unread ON public.user_insights(user_id) WHERE read_at IS NULL;
