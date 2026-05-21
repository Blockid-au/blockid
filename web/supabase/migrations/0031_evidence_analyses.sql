-- Evidence AI analysis results
-- Stores per-evidence analysis output from "Analyze with BlockID AI" button.
-- One evidence item can have multiple analyses (scan → standard → deep dive).

CREATE TABLE IF NOT EXISTS public.evidence_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES public.svi_evidence(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.svi_accounts(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('scan', 'standard', 'deep_dive')),
  dimension TEXT,
  feature_key TEXT NOT NULL,
  analysis_json JSONB NOT NULL DEFAULT '{}',
  signals_extracted JSONB DEFAULT '{}',
  svi_delta_applied INTEGER DEFAULT 0,
  credits_charged NUMERIC(10,2) NOT NULL DEFAULT 0,
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_analyses_evidence ON public.evidence_analyses (evidence_id);
CREATE INDEX idx_evidence_analyses_account ON public.evidence_analyses (account_id, created_at DESC);

ALTER TABLE public.evidence_analyses ENABLE ROW LEVEL SECURITY;
