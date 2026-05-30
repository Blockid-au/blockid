-- 0044: Evaluation Criteria — 13-criterion evidence collection layer
-- Each startup can store evidence (files, links, text) per evaluation criterion.
-- Maps to SVI dimensions for scoring integration.

CREATE TABLE IF NOT EXISTS evaluation_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES svi_accounts(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  criterion_key text NOT NULL,
  -- Valid keys: idea, market, founder_profile, code_git, website, team,
  --   customer_size, gtm_strategy, documents, dataroom, team_structure, roadmap, revenue

  -- Per-criterion evidence
  files jsonb NOT NULL DEFAULT '[]',
  links jsonb NOT NULL DEFAULT '[]',
  text_input text NOT NULL DEFAULT '',

  -- AI assessment (populated asynchronously)
  ai_score numeric(5,2),
  ai_summary text,
  ai_suggestions jsonb NOT NULL DEFAULT '[]',
  quality_level text NOT NULL DEFAULT 'incomplete',

  -- Dimension mapping (computed from criterion_key)
  primary_dimension text,
  secondary_dimension text,
  signals_extracted jsonb NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(account_id, criterion_key)
);

CREATE INDEX IF NOT EXISTS idx_eval_criteria_account ON evaluation_criteria(account_id);
CREATE INDEX IF NOT EXISTS idx_eval_criteria_project ON evaluation_criteria(project_id);
CREATE INDEX IF NOT EXISTS idx_eval_criteria_key ON evaluation_criteria(criterion_key);

-- Add check constraint for valid criterion keys
ALTER TABLE evaluation_criteria
  ADD CONSTRAINT chk_criterion_key CHECK (criterion_key IN (
    'idea', 'market', 'founder_profile', 'code_git', 'website', 'team',
    'customer_size', 'gtm_strategy', 'documents', 'dataroom',
    'team_structure', 'roadmap', 'revenue'
  ));

-- Add check constraint for quality levels
ALTER TABLE evaluation_criteria
  ADD CONSTRAINT chk_quality_level CHECK (quality_level IN (
    'incomplete', 'basic', 'good', 'strong', 'exceptional'
  ));
