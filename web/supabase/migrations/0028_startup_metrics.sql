-- Startup metrics tracking for Product Metrics & Dollar Valuation Engine
-- Replaces the old EAV-style metrics table with a flat-column design

DROP TABLE IF EXISTS startup_metrics;

CREATE TABLE IF NOT EXISTS startup_metrics (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references svi_accounts(id) on delete cascade,
  email text not null,
  metric_date date not null default current_date,
  -- Revenue
  mrr_aud numeric(12,2),
  arr_aud numeric(12,2),
  revenue_growth_pct numeric(5,2),
  -- Users
  mau int,
  dau int,
  -- Retention
  monthly_churn_pct numeric(5,2),
  nrr_pct numeric(5,2),
  -- Unit Economics
  cac_aud numeric(10,2),
  ltv_aud numeric(10,2),
  -- Growth
  burn_rate_aud numeric(12,2),
  runway_months int,
  -- Source
  source text default 'manual', -- manual, stripe, analytics, github
  created_at timestamptz not null default now(),
  unique(account_id, metric_date)
);

ALTER TABLE startup_metrics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_startup_metrics_account
  ON startup_metrics (account_id, metric_date DESC);
