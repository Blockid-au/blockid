-- 0045: Agent Reports — Multi-agent report generation + knowledge base
-- Schema reconciled to match the ACTUAL columns the application code reads/writes:
--   • assembled_reports     ← api/svi/enhanced-report (+ /status, /docx)
--   • agent_report_tasks    ← api/svi/enhanced-report (per-section task rows)
--   • agent_knowledge_base  ← api/cron/agent-research (self-research store)
--
-- NOTE: report IDs are app-generated strings ("rpt-<ts>-<rand>"), so id /
-- report_id are TEXT, not uuid. Idempotent: CREATE TABLE IF NOT EXISTS with
-- inline CHECK constraints (safe to re-run).

-- ── Assembled final reports ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assembled_reports (
  id text PRIMARY KEY,                       -- app-generated, e.g. "rpt-mc3x-ab12cd"
  account_id uuid NOT NULL REFERENCES svi_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  analysis_id uuid,

  -- Report config
  tier text NOT NULL DEFAULT 'standard',
  locale text NOT NULL DEFAULT 'en',

  -- Content
  title text NOT NULL,
  executive_summary text,
  full_markdown text NOT NULL DEFAULT '',
  total_words integer DEFAULT 0,
  sections_count integer DEFAULT 0,
  sections_json jsonb NOT NULL DEFAULT '[]',
  charts_json jsonb NOT NULL DEFAULT '[]',
  consistency_issues jsonb NOT NULL DEFAULT '[]',
  agent_contributions jsonb NOT NULL DEFAULT '{}',

  -- Quality & status
  quality_score numeric(5,2),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','gathering','analyzing','synthesizing','rendering','complete','failed')),
  error_message text,
  credits_cost numeric(6,2) DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assembled_reports_account ON assembled_reports(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assembled_reports_user ON assembled_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assembled_reports_status ON assembled_reports(status);

-- ── Per-agent task rows for a report ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_report_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL REFERENCES assembled_reports(id) ON DELETE CASCADE,
  agent_role text NOT NULL,
  criterion_key text,
  score numeric(5,2),
  word_count integer DEFAULT 0,
  content_preview text,
  status text NOT NULL DEFAULT 'complete'
    CHECK (status IN ('pending','running','complete','completed','failed','skipped')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_report ON agent_report_tasks(report_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_role ON agent_report_tasks(agent_role);

-- ── Agent knowledge base (self-research results) ───────────────────────────
-- Cron upserts by (agent, topic): select id/data/updated_at, update or insert.
CREATE TABLE IF NOT EXISTS agent_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  topic text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  previous_data jsonb,
  source_model text,
  source_provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent, topic)
);

CREATE INDEX IF NOT EXISTS idx_akb_agent_topic ON agent_knowledge_base(agent, topic);
