-- 0045: Agent Reports — Multi-agent report generation + knowledge base
-- Tracks per-agent contributions to orchestrated reports, assembled output,
-- and agent self-research knowledge base.

-- Agent task tracking per report
CREATE TABLE IF NOT EXISTS agent_report_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES svi_accounts(id) ON DELETE CASCADE,
  agent_role text NOT NULL,
  criteria_keys text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',

  -- Output
  analysis_markdown text,
  analysis_json jsonb DEFAULT '{}',
  charts_generated jsonb DEFAULT '[]',
  word_count integer DEFAULT 0,
  score numeric(5,2),

  -- Timing & cost
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  ai_provider text,
  ai_model text,
  credits_charged numeric(6,2) DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_report ON agent_report_tasks(report_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_account ON agent_report_tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_report_tasks(status);

ALTER TABLE agent_report_tasks
  ADD CONSTRAINT chk_agent_status CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'skipped'
  ));

-- Assembled final reports
CREATE TABLE IF NOT EXISTS assembled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES svi_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  report_type text NOT NULL DEFAULT 'standard',

  -- Content
  title text NOT NULL,
  markdown_content text NOT NULL DEFAULT '',
  word_count integer DEFAULT 0,
  sections_count integer DEFAULT 0,

  -- Exports
  pdf_url text,
  docx_url text,

  -- Charts embedded
  charts jsonb DEFAULT '[]',

  -- Agent contributions
  agent_task_ids uuid[] DEFAULT '{}',

  -- Quality
  quality_score numeric(5,2),
  consistency_issues jsonb DEFAULT '[]',

  -- Status
  status text NOT NULL DEFAULT 'draft',
  credits_charged numeric(6,2) DEFAULT 0,

  -- Email delivery
  emailed_at timestamptz,
  email_format text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assembled_reports_account ON assembled_reports(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assembled_reports_user ON assembled_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assembled_reports_status ON assembled_reports(status);

ALTER TABLE assembled_reports
  ADD CONSTRAINT chk_report_type CHECK (report_type IN (
    'standard', 'premium', 'investor_memo'
  ));

ALTER TABLE assembled_reports
  ADD CONSTRAINT chk_report_status CHECK (status IN (
    'draft', 'gathering', 'analyzing', 'synthesizing', 'rendering', 'complete', 'failed'
  ));

-- Agent knowledge base (self-research results)
CREATE TABLE IF NOT EXISTS agent_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  knowledge_type text NOT NULL,
  content jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  source_urls text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akb_agent_type ON agent_knowledge_base(agent_id, knowledge_type);
CREATE INDEX IF NOT EXISTS idx_akb_current
  ON agent_knowledge_base(agent_id, knowledge_type)
  WHERE valid_until IS NULL;

ALTER TABLE agent_knowledge_base
  ADD CONSTRAINT chk_knowledge_type CHECK (knowledge_type IN (
    'rubric', 'benchmark', 'competitor', 'regulation', 'best_practice'
  ));
