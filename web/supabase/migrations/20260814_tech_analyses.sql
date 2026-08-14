-- Tech Intelligence analyses table
-- Stores website + GitHub + LLM analysis results per startup
CREATE TABLE IF NOT EXISTS tech_analyses (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core scores
  tech_score              INTEGER NOT NULL CHECK (tech_score >= 0 AND tech_score <= 100),
  svi_contribution        INTEGER NOT NULL DEFAULT 0,
  valuation_multiplier_boost NUMERIC(5,4) NOT NULL DEFAULT 0, -- e.g. 0.2000 = 20%

  -- Input signals (JSONB for flexibility)
  website_url             TEXT,
  github_url              TEXT,
  website_signals         JSONB,
  github_signals          JSONB,
  llm_assessment          JSONB,

  -- Sub-scores for display
  tech_maturity           INTEGER,
  product_presence        INTEGER,
  developer_activity      INTEGER,
  scalability_score       INTEGER,

  -- Metadata
  analysis_version        TEXT NOT NULL DEFAULT '1.0',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Index for fast lookup by startup
  CONSTRAINT tech_analyses_startup_user UNIQUE (startup_id, user_id)
  -- Note: UNIQUE constraint means upsert replaces previous analysis per startup per user
);

-- Indexes
CREATE INDEX IF NOT EXISTS tech_analyses_startup_id_idx ON tech_analyses (startup_id);
CREATE INDEX IF NOT EXISTS tech_analyses_user_id_idx ON tech_analyses (user_id);
CREATE INDEX IF NOT EXISTS tech_analyses_created_at_idx ON tech_analyses (created_at DESC);

-- RLS
ALTER TABLE tech_analyses ENABLE ROW LEVEL SECURITY;

-- Users can only see their own analyses
CREATE POLICY "Users read own tech analyses"
  ON tech_analyses FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert/update for their own startups
CREATE POLICY "Users write own tech analyses"
  ON tech_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own tech analyses"
  ON tech_analyses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypass (for server-side writes)
CREATE POLICY "Service role full access tech analyses"
  ON tech_analyses FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Also add github_url column to projects table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'github_url'
  ) THEN
    ALTER TABLE projects ADD COLUMN github_url TEXT;
  END IF;
END $$;

-- Add tech_score column to svi_snapshots if that table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'svi_index_snapshots') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'svi_index_snapshots' AND column_name = 'tech_score'
    ) THEN
      ALTER TABLE svi_index_snapshots ADD COLUMN tech_score INTEGER;
      ALTER TABLE svi_index_snapshots ADD COLUMN tech_valuation_boost NUMERIC(5,4);
    END IF;
  END IF;
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
