-- Analyzer runs: Code/Website Analyzer results per startup.
--
-- One row per POST /api/analyzer/run invocation. `startup_id` is required so
-- multi-startup users always get scoped results (see MEMORY multi-startup rule).

CREATE TABLE IF NOT EXISTS analyzer_runs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id               UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id                  UUID,
  github_url               TEXT,
  website_url              TEXT,
  signals                  JSONB NOT NULL,
  sub_score                INTEGER NOT NULL CHECK (sub_score BETWEEN 0 AND 100),
  valuation_adjuster_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  rationale                JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analyzer_runs_startup_created_idx
  ON analyzer_runs (startup_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analyzer_runs_user_id_idx
  ON analyzer_runs (user_id);

ALTER TABLE analyzer_runs ENABLE ROW LEVEL SECURITY;

-- Users read their own runs. NULL user_id (system-owned) is readable when the
-- caller is service-role.
CREATE POLICY "Users read own analyzer runs"
  ON analyzer_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own analyzer runs"
  ON analyzer_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access analyzer_runs"
  ON analyzer_runs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

NOTIFY pgrst, 'reload schema';
