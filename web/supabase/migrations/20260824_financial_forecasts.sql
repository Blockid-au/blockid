-- 20260824_financial_forecasts.sql
-- Revenue Forecast Builder: financial_models & forecast_scenarios tables
-- Supports 36-month projections, scenario versioning, investor pack integration
-- RLS: Founders access only own project models

-- Create financial_models table
CREATE TABLE IF NOT EXISTS financial_models (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL,

  -- Model metadata
  name                    TEXT NOT NULL DEFAULT 'Financial Projection',
  model_type              TEXT NOT NULL CHECK (model_type IN ('saas', 'marketplace', 'agency', 'other')),
  description             TEXT,

  -- Core financial inputs (immutable once created)
  current_arr_aud         NUMERIC(14,2) NOT NULL CHECK (current_arr_aud >= 0),
  monthly_growth_pct      NUMERIC(5,2) NOT NULL CHECK (monthly_growth_pct >= -100 AND monthly_growth_pct <= 500),
  churn_pct               NUMERIC(5,2) NOT NULL CHECK (churn_pct >= 0 AND churn_pct <= 100),
  cogs_pct                NUMERIC(5,2) NOT NULL CHECK (cogs_pct >= 0 AND cogs_pct <= 100),
  opex_monthly_aud        NUMERIC(14,2) NOT NULL CHECK (opex_monthly_aud >= 0),
  fixed_costs_aud         NUMERIC(14,2) NOT NULL CHECK (fixed_costs_aud >= 0),

  -- Tax incentives (AU-specific: RDTI, ESIC)
  include_tax_incentives  BOOLEAN NOT NULL DEFAULT false,

  -- Scenario variants
  scenario                TEXT NOT NULL DEFAULT 'base' CHECK (scenario IN ('bear', 'base', 'bull')),

  -- Cached metrics for dashboard performance
  month_breakeven         INTEGER,
  months_to_series_a      INTEGER,
  peak_monthly_burn_aud   NUMERIC(14,2),
  arr_month_12_aud        NUMERIC(14,2),
  arr_month_24_aud        NUMERIC(14,2),
  arr_month_36_aud        NUMERIC(14,2),
  runway_months           INTEGER,

  -- Full projection payload (immutable snapshot)
  projection_data         JSONB NOT NULL,

  -- Investor pack metadata
  use_for_investor_pack   BOOLEAN NOT NULL DEFAULT false,
  investor_pack_version   INTEGER DEFAULT 1,

  -- Audit & versioning
  version                 INTEGER NOT NULL DEFAULT 1,
  is_deleted              BOOLEAN NOT NULL DEFAULT false,
  replaced_by_id          UUID REFERENCES financial_models(id),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at            TIMESTAMPTZ,

  UNIQUE(project_id, name, version),
  CONSTRAINT fk_replaced_by FOREIGN KEY (replaced_by_id) REFERENCES financial_models(id)
);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_financial_models_project_id
  ON financial_models(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_models_user_id
  ON financial_models(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_models_project_active
  ON financial_models(project_id)
  WHERE is_deleted = false AND replaced_by_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_models_for_investor_pack
  ON financial_models(project_id, published_at DESC)
  WHERE use_for_investor_pack = true AND is_deleted = false;

-- Enable RLS
ALTER TABLE financial_models ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT — Users can read own project's models
CREATE POLICY "Users read own project financial models"
  ON financial_models FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.created_by = auth.uid()
    )
  );

-- RLS Policy: INSERT — Users can only insert into own projects
CREATE POLICY "Users insert own project financial models"
  ON financial_models FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (
      SELECT p.id FROM projects p
      WHERE p.created_by = auth.uid()
    )
  );

-- RLS Policy: UPDATE — Users can only update own models
CREATE POLICY "Users update own project financial models"
  ON financial_models FOR UPDATE
  USING (
    user_id = auth.uid()
    AND project_id IN (
      SELECT p.id FROM projects p
      WHERE p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (
      SELECT p.id FROM projects p
      WHERE p.created_by = auth.uid()
    )
  );

-- RLS Policy: DELETE — Users can only soft-delete own models
CREATE POLICY "Users delete own project financial models"
  ON financial_models FOR DELETE
  USING (
    user_id = auth.uid()
    AND project_id IN (
      SELECT p.id FROM projects p
      WHERE p.created_by = auth.uid()
    )
  );

-- RLS Policy: Service role full access (for backend operations)
CREATE POLICY "Service role full access to financial_models"
  ON financial_models FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Create forecast_scenarios table for multi-scenario comparisons
CREATE TABLE IF NOT EXISTS forecast_scenarios (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_model_id      UUID NOT NULL REFERENCES financial_models(id) ON DELETE CASCADE,

  -- Scenario variant metadata
  scenario_name           TEXT NOT NULL,
  scenario_type           TEXT NOT NULL CHECK (scenario_type IN ('bear', 'base', 'bull', 'custom')),

  -- Cached projection snapshot
  cached_projection_json  JSONB NOT NULL,

  -- Comparison metrics
  arr_month_12_aud        NUMERIC(14,2),
  arr_month_24_aud        NUMERIC(14,2),
  arr_month_36_aud        NUMERIC(14,2),
  month_breakeven         INTEGER,
  runway_months           INTEGER,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(financial_model_id, scenario_type)
);

-- Create indices
CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_model_id
  ON forecast_scenarios(financial_model_id);

-- Enable RLS on forecast_scenarios
ALTER TABLE forecast_scenarios ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can access scenarios for their own models
CREATE POLICY "Users read own scenario data"
  ON forecast_scenarios FOR SELECT
  USING (
    financial_model_id IN (
      SELECT fm.id FROM financial_models fm
      WHERE fm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own scenario data"
  ON forecast_scenarios FOR INSERT
  WITH CHECK (
    financial_model_id IN (
      SELECT fm.id FROM financial_models fm
      WHERE fm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to forecast_scenarios"
  ON forecast_scenarios FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Create financial_model_audit table for compliance
CREATE TABLE IF NOT EXISTS financial_model_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id          UUID NOT NULL REFERENCES financial_models(id) ON DELETE CASCADE,
  action            TEXT NOT NULL CHECK (action IN ('created', 'updated', 'published', 'deleted')),
  changed_fields    JSONB,
  actor_id          UUID NOT NULL,
  actor_email       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_model_created
  ON financial_model_audit(model_id, created_at DESC);

-- Signal PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
