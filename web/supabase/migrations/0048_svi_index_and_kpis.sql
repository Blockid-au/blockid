-- SVI Market Index columns + Agent KPI tracking
-- Adds unbounded index support (Nikkei/Dow Jones style) to SVI snapshots
-- and creates agent KPI tracking for CEO Goal dashboard

-- Index base period on accounts
ALTER TABLE svi_accounts ADD COLUMN IF NOT EXISTS index_base_date date;
ALTER TABLE svi_accounts ADD COLUMN IF NOT EXISTS index_base_svi numeric;

-- Index value on snapshots
ALTER TABLE svi_snapshots ADD COLUMN IF NOT EXISTS index_value numeric;
ALTER TABLE svi_snapshots ADD COLUMN IF NOT EXISTS data_richness numeric DEFAULT 1.0;

-- Agent KPI daily tracking
CREATE TABLE IF NOT EXISTS agent_kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  metric text NOT NULL,
  value numeric NOT NULL,
  target numeric NOT NULL,
  snapshot_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent, metric, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_agent_kpi_agent_date
  ON agent_kpi_snapshots(agent, snapshot_date DESC);

-- Financial projections for valuation dashboard
CREATE TABLE IF NOT EXISTS financial_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES svi_accounts(id) ON DELETE CASCADE,
  scenario_name text NOT NULL DEFAULT 'base',
  monthly_data jsonb NOT NULL DEFAULT '[]',
  assumptions jsonb NOT NULL DEFAULT '{}',
  breakeven_month integer,
  payback_months integer,
  projected_valuation numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, scenario_name)
);

CREATE INDEX IF NOT EXISTS idx_financial_proj_account
  ON financial_projections(account_id);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
