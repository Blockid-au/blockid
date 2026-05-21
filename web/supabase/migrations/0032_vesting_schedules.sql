-- Vesting schedules — multi-grant per shareholder
CREATE TABLE IF NOT EXISTS vesting_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cap_table_id UUID NOT NULL,
  shareholder_name TEXT NOT NULL,
  shareholder_email TEXT,
  grant_date DATE NOT NULL,
  total_shares NUMERIC(12,2) NOT NULL,
  vested_shares NUMERIC(12,2) DEFAULT 0,
  vesting_type TEXT NOT NULL DEFAULT 'linear',
  cliff_months INT DEFAULT 12,
  total_months INT DEFAULT 48,
  single_trigger BOOLEAN DEFAULT FALSE,
  double_trigger BOOLEAN DEFAULT FALSE,
  milestone_triggers JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active',
  terminated_at DATE,
  termination_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vesting_cap_table ON vesting_schedules(cap_table_id);
CREATE INDEX IF NOT EXISTS idx_vesting_email ON vesting_schedules(shareholder_email);

-- Share structure config per startup
CREATE TABLE IF NOT EXISTS share_structure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID,
  mode TEXT DEFAULT 'fixed_shares',
  authorized_shares NUMERIC(14,2) DEFAULT 10000000,
  share_price_aud NUMERIC(10,4),
  valuation_aud NUMERIC(14,2),
  last_svi_score INT,
  auto_recompute BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI equity recommendations log
CREATE TABLE IF NOT EXISTS ai_equity_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID,
  recommendation_type TEXT NOT NULL,
  input_context JSONB NOT NULL,
  recommendation JSONB NOT NULL,
  credits_charged NUMERIC(4,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
