-- Startup Index data foundation: anonymised SVI snapshots
-- Collects anonymised startup valuation metrics over time to build BlockID Startup Index
-- One row per account per day, enables trend analysis, benchmarking, and index construction

CREATE TABLE IF NOT EXISTS svi_index_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES svi_accounts(id) ON DELETE CASCADE,
  svi numeric NOT NULL,
  revenue_estimate numeric,
  runway_months integer,
  burn_rate numeric,
  cap_table_entries integer,
  sector text,
  state text,
  stage text,
  snapshot_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_svi_snapshots_date ON svi_index_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_svi_snapshots_account_date ON svi_index_snapshots(account_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_svi_snapshots_sector ON svi_index_snapshots(sector) WHERE sector IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_svi_snapshots_stage ON svi_index_snapshots(stage) WHERE stage IS NOT NULL;

-- Row-level security: insert-only for service role (app writes on every SVI analysis)
ALTER TABLE svi_index_snapshots ENABLE ROW LEVEL SECURITY;

-- Anon/authenticated: no direct access (data collected server-side only)
CREATE POLICY svi_snapshots_no_anon_access
  ON svi_index_snapshots FOR ALL
  USING (false)
  WITH CHECK (false);

-- Service role: insert-only (app appends snapshots, never modifies historical data)
CREATE POLICY svi_snapshots_service_insert
  ON svi_index_snapshots FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
