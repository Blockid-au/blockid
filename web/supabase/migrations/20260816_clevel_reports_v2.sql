-- Migration: Enhanced C-Level Reports with DCF Integration (v2)
-- Date: 2026-08-16
-- Purpose: Add clevel_reports_v2 table for scenario-based reporting, sensitivity analysis, and trend tracking

CREATE TABLE IF NOT EXISTS clevel_reports_v2 (
  -- Identifiers
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  startup_id UUID NOT NULL REFERENCES svi_accounts(id) ON DELETE CASCADE,

  -- Report metadata
  role VARCHAR(20) NOT NULL CHECK (role IN ('cfo', 'ceo', 'cmo', 'cdo', 'cto', 'cpo', 'clo', 'chro', 'cro')),
  scenario VARCHAR(10) NOT NULL CHECK (scenario IN ('bear', 'base', 'bull')),
  report_version VARCHAR(20) NOT NULL DEFAULT '2.0.0',

  -- Report content (markdown + structured)
  title TEXT NOT NULL,
  summary TEXT,
  body_markdown TEXT, -- Full report in markdown
  sections JSONB NOT NULL, -- { "section_name": { "title": "...", "body": "...", "subsections": {...} } }
  key_findings TEXT[] NOT NULL DEFAULT '{}', -- Array of finding bullets
  action_items JSONB NOT NULL DEFAULT '[]', -- [{ priority: "high"/"medium"/"low", title: "...", description: "...", owner: "...", deadline_days: 30 }]

  -- Valuation & DCF (CFO-specific)
  dcf_valuation_low BIGINT, -- Store in AUD cents for precision
  dcf_valuation_base BIGINT,
  dcf_valuation_high BIGINT,
  dcf_confidence VARCHAR(20) CHECK (dcf_confidence IN ('low', 'medium', 'high')),

  -- Sensitivity drivers (5-driver matrix)
  sensitivity_drivers JSONB, -- { "arr_growth": { "bear": -25, "base": 0, "bull": 25, "impact": "high" }, ... }
  sensitivity_table JSONB, -- Complete sensitivity table for export

  -- Trend tracking (12-week history snapshots)
  week_12_history JSONB, -- [{ week: 1, date: "...", svi_score: 145, arr_aud: 50000, runway_months: 18, ... }, ...]

  -- Metadata for audit & operations
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  generated_by VARCHAR(100) NOT NULL DEFAULT 'nightly-cron-v2', -- Or "manual-override", "api-user:xyz"
  model_used VARCHAR(100), -- "claude-sonnet-4-5", "claude-haiku-4-5"
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd_estimate NUMERIC(8,4),
  duration_ms INTEGER,

  -- Compliance & privacy
  is_confidential BOOLEAN DEFAULT TRUE, -- Never expose publicly without founder approval
  has_real_startup_names BOOLEAN DEFAULT FALSE, -- Compliance check; CFO/CMO/CDO must anonymize benchmarks
  anonymization_notes TEXT, -- E.g., "Canva renamed to 'AU SaaS Leader #1'" for compliance

  -- Versioning & audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Ensure one report per role+scenario per day (idempotent)
  UNIQUE(project_id, role, scenario, DATE(generated_at))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_clevel_reports_v2_project_role_scenario
  ON clevel_reports_v2(project_id, role, scenario);

CREATE INDEX IF NOT EXISTS idx_clevel_reports_v2_generated_at
  ON clevel_reports_v2(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_clevel_reports_v2_startup_id
  ON clevel_reports_v2(startup_id);

CREATE INDEX IF NOT EXISTS idx_clevel_reports_v2_role_scenario
  ON clevel_reports_v2(role, scenario);

-- ─── Audit trail ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clevel_report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES clevel_reports_v2(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  action VARCHAR(50) NOT NULL CHECK (action IN ('created', 'updated', 'viewed', 'exported', 'shared')),
  actor_email VARCHAR(255),
  actor_type VARCHAR(20) CHECK (actor_type IN ('cron', 'system', 'founder', 'admin')),

  metadata JSONB, -- { export_format: "pdf", recipient: "...", etc. }
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clevel_report_history_report_id
  ON clevel_report_history(report_id);

-- ─── Trend snapshots (for 12-week tracking) ──────────────────────────────

CREATE TABLE IF NOT EXISTS clevel_trend_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('cfo', 'ceo', 'cmo', 'cdo', 'cto', 'cpo', 'clo', 'chro', 'cro')),

  week_number INTEGER NOT NULL, -- Week 1–52 (or current week)
  snapshot_date DATE NOT NULL,

  -- Financial metrics
  svi_score DECIMAL(6,2),
  arr_aud BIGINT,
  mrr_aud BIGINT,
  runway_months INTEGER,
  burn_rate_monthly BIGINT,

  -- Unit economics
  ltv_cac_ratio DECIMAL(4,2),
  cac_payback_months DECIMAL(4,1),
  churn_rate_pct DECIMAL(4,2),
  gross_margin_pct DECIMAL(5,2),

  -- Valuation (from DCF base case)
  dcf_valuation_base BIGINT,

  -- Metadata
  data_source VARCHAR(100), -- "clevel_report:uuid", "manual_input", "api_sync"
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(project_id, role, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_clevel_trend_snapshots_project_role
  ON clevel_trend_snapshots(project_id, role);

CREATE INDEX IF NOT EXISTS idx_clevel_trend_snapshots_snapshot_date
  ON clevel_trend_snapshots(snapshot_date DESC);

-- ─── Grants & RLS ───────────────────────────────────────────────────────

-- Allow founders to view their own reports
ALTER TABLE clevel_reports_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY clevel_reports_v2_founders_read ON clevel_reports_v2
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
        AND p.founder_id = auth.uid()
    )
  );

-- Allow admins to view all (for diagnostics)
CREATE POLICY clevel_reports_v2_admins_all ON clevel_reports_v2
  FOR ALL USING (
    auth.email() = 'admin@blockid.au' OR
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id AND p.founder_id = auth.uid()
    )
  );

-- Similar RLS for trend snapshots
ALTER TABLE clevel_trend_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY clevel_trend_snapshots_founders_read ON clevel_trend_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
        AND p.founder_id = auth.uid()
    )
  );

-- ─── Stored Functions ───────────────────────────────────────────────────

/**
 * Function: get_latest_clevel_report_by_role(project_uuid, role_name)
 * Purpose: Fetch the most recent report for a role (any scenario)
 * Returns: Single report record
 */
CREATE OR REPLACE FUNCTION get_latest_clevel_report_by_role(
  p_project_id UUID,
  p_role VARCHAR
)
RETURNS TABLE (
  report_id UUID,
  role VARCHAR,
  scenario VARCHAR,
  title TEXT,
  generated_at TIMESTAMP,
  dcf_valuation_base BIGINT
) AS $$
  SELECT id, role, scenario, title, generated_at, dcf_valuation_base
  FROM clevel_reports_v2
  WHERE project_id = p_project_id
    AND role = p_role
  ORDER BY generated_at DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

/**
 * Function: get_12_week_trend(project_uuid, role_name, scenario_name)
 * Purpose: Fetch 12-week trend data for dashboard
 * Returns: Array of trend snapshots
 */
CREATE OR REPLACE FUNCTION get_12_week_trend(
  p_project_id UUID,
  p_role VARCHAR,
  p_scenario VARCHAR DEFAULT 'base'
)
RETURNS TABLE (
  week_number INTEGER,
  snapshot_date DATE,
  svi_score DECIMAL,
  arr_aud BIGINT,
  runway_months INTEGER,
  dcf_valuation_base BIGINT,
  ltv_cac_ratio DECIMAL,
  churn_rate_pct DECIMAL
) AS $$
  SELECT week_number, snapshot_date, svi_score, arr_aud, runway_months, dcf_valuation_base, ltv_cac_ratio, churn_rate_pct
  FROM clevel_trend_snapshots
  WHERE project_id = p_project_id
    AND role = p_role
  ORDER BY snapshot_date DESC
  LIMIT 12;
$$ LANGUAGE SQL STABLE;

/**
 * Function: calculate_trend_delta(project_uuid, role_name, metric_name)
 * Purpose: Calculate 12-week change in a metric (e.g., SVI score delta)
 * Returns: Delta (new - old), % change
 */
CREATE OR REPLACE FUNCTION calculate_trend_delta(
  p_project_id UUID,
  p_role VARCHAR,
  p_metric_name VARCHAR
)
RETURNS TABLE (
  metric_name VARCHAR,
  start_value DECIMAL,
  end_value DECIMAL,
  delta DECIMAL,
  delta_pct DECIMAL,
  trend_direction VARCHAR
) AS $$
DECLARE
  v_start DECIMAL;
  v_end DECIMAL;
  v_delta DECIMAL;
  v_pct DECIMAL;
  v_direction VARCHAR;
BEGIN
  -- Fetch metric values (12 weeks apart)
  -- This is a stub; actual implementation requires dynamic SQL or case statements
  v_start := 145.0; -- Placeholder
  v_end := 150.0;
  v_delta := v_end - v_start;
  v_pct := CASE WHEN v_start > 0 THEN (v_delta / v_start) * 100 ELSE 0 END;
  v_direction := CASE WHEN v_delta > 0 THEN 'upward' WHEN v_delta < 0 THEN 'downward' ELSE 'stable' END;

  RETURN QUERY SELECT p_metric_name::VARCHAR, v_start, v_end, v_delta, v_pct, v_direction;
END;
$$ LANGUAGE PLPGSQL STABLE;

-- ─── Backfill view (for compatibility with old clevel_reports table) ────

-- If you have an old clevel_reports table, create a view to migrate reports
-- CREATE OR REPLACE VIEW clevel_reports_legacy AS
--   SELECT * FROM clevel_reports_v2
--   WHERE scenario = 'base';

-- Done!
COMMIT;
