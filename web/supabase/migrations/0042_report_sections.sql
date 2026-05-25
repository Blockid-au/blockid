-- Stores unlocked report sections per SVI analysis.
-- Each row = one section (summary or full) that the user generated.
-- Allows users to revisit their unlocked content without re-generating.

CREATE TABLE IF NOT EXISTS report_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id   text NOT NULL,           -- references svi_analyses.id
  user_id       uuid NOT NULL,           -- references app_users.id
  section_id    text NOT NULL,           -- e.g. "executive", "market", "competitive"
  depth         text NOT NULL DEFAULT 'summary', -- "summary" | "full"
  content       text NOT NULL,           -- markdown content
  word_count    integer NOT NULL DEFAULT 0,
  credits_cost  numeric(6,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- One row per analysis + section + depth combination
  UNIQUE (analysis_id, section_id, depth)
);

-- Index for fast lookup: "get all sections for this analysis"
CREATE INDEX IF NOT EXISTS idx_report_sections_analysis ON report_sections(analysis_id);
-- Index for user's history: "get all reports by this user"
CREATE INDEX IF NOT EXISTS idx_report_sections_user ON report_sections(user_id, created_at DESC);
