/**
 * Migration: Exit Strategy Tables
 * Date: 2026-08-25
 *
 * Implements scenario modeling for Series A/B funding and exit path analysis.
 * Tables:
 *   - exit_scenarios: Founder's exit models (Series A/B funding, target exit, timeline)
 *   - cap_table_projections: Round-by-round cap table snapshots (seed, A, B, exit)
 *   - exit_readiness_assessments: Exit readiness scores (product, revenue, team, market)
 *
 * RLS: Enforced at account_id level; founders cannot see other founders' scenarios
 */

-- ===== EXIT SCENARIOS TABLE =====
-- Stores exit scenario metadata and assumptions
CREATE TABLE IF NOT EXISTS exit_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES svi_accounts(id) ON DELETE CASCADE,

  -- Scenario metadata
  scenario_name VARCHAR(255) NOT NULL,
  exit_type VARCHAR(50) NOT NULL CHECK (exit_type IN ('acquisition', 'ipo', 'other')),
  exit_timeline_years INT NOT NULL CHECK (exit_timeline_years BETWEEN 1 AND 20),
  target_exit_valuation_aud BIGINT NOT NULL CHECK (target_exit_valuation_aud > 0),

  -- Series A assumptions
  series_a_planned BOOLEAN DEFAULT FALSE,
  series_a_target_raise_aud BIGINT,
  series_a_target_valuation_aud BIGINT,
  series_a_year_relative INT, -- e.g., 2 = Year 2
  series_a_investor_name VARCHAR(255),

  -- Series B assumptions
  series_b_planned BOOLEAN DEFAULT FALSE,
  series_b_target_raise_aud BIGINT,
  series_b_target_valuation_aud BIGINT,
  series_b_year_relative INT,
  series_b_investor_name VARCHAR(255),

  -- Narrative & assumptions
  narrative TEXT,
  assumptions JSONB DEFAULT '{}', -- Custom assumptions (e.g., market expansion, team hires)

  -- Primary scenario flag (one per account)
  is_primary BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exit_scenarios_account_id_idx ON exit_scenarios(account_id);
CREATE INDEX IF NOT EXISTS exit_scenarios_account_name_idx ON exit_scenarios(account_id, scenario_name);
CREATE INDEX IF NOT EXISTS exit_scenarios_updated_at_idx ON exit_scenarios(account_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS exit_scenarios_account_name_unique_idx ON exit_scenarios(account_id, scenario_name)
  WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE exit_scenarios ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Founders see only their own scenarios
CREATE POLICY IF NOT EXISTS exit_scenarios_owner_select ON exit_scenarios
  FOR SELECT USING (account_id = auth.uid());

CREATE POLICY IF NOT EXISTS exit_scenarios_owner_insert ON exit_scenarios
  FOR INSERT WITH CHECK (account_id = auth.uid());

CREATE POLICY IF NOT EXISTS exit_scenarios_owner_update ON exit_scenarios
  FOR UPDATE USING (account_id = auth.uid());

CREATE POLICY IF NOT EXISTS exit_scenarios_owner_delete ON exit_scenarios
  FOR DELETE USING (account_id = auth.uid());

-- RLS Policy: Service role (cron, agents) can read all
CREATE POLICY IF NOT EXISTS exit_scenarios_service_select ON exit_scenarios
  FOR SELECT USING (auth.role() = 'service_role');

-- ===== CAP TABLE PROJECTIONS TABLE =====
-- Stores round-by-round cap table snapshots
CREATE TABLE IF NOT EXISTS cap_table_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exit_scenario_id UUID NOT NULL REFERENCES exit_scenarios(id) ON DELETE CASCADE,

  -- Round identifier
  round_num INT NOT NULL CHECK (round_num BETWEEN 0 AND 3),
  round_type VARCHAR(50) NOT NULL CHECK (round_type IN ('current_cap_table', 'series_a', 'series_b', 'exit')),
  round_year_relative INT,

  -- Funding round details
  round_size_aud BIGINT,
  post_money_valuation_aud BIGINT,
  pre_money_valuation_aud BIGINT,
  new_investor_name VARCHAR(255),

  -- Cap table composition (after round)
  founder_stake_pct_after NUMERIC(5, 2) NOT NULL CHECK (founder_stake_pct_after BETWEEN 0 AND 100),
  investor_stake_pct NUMERIC(5, 2) CHECK (investor_stake_pct BETWEEN 0 AND 100),
  esop_stake_pct NUMERIC(5, 2) CHECK (esop_stake_pct BETWEEN 0 AND 100),

  -- Share counts (for dilution tracking)
  total_shares_issued BIGINT,
  founder_shares BIGINT,
  investor_shares BIGINT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cap_table_projections_scenario_id_idx ON cap_table_projections(exit_scenario_id);
CREATE INDEX IF NOT EXISTS cap_table_projections_round_idx ON cap_table_projections(exit_scenario_id, round_num);
CREATE UNIQUE INDEX IF NOT EXISTS cap_table_projections_scenario_round_unique_idx ON cap_table_projections(exit_scenario_id, round_num);

-- Enable RLS (cascade from exit_scenarios via FK)
ALTER TABLE cap_table_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS cap_table_projections_select ON cap_table_projections
  FOR SELECT USING (
    exit_scenario_id IN (
      SELECT id FROM exit_scenarios WHERE account_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS cap_table_projections_insert ON cap_table_projections
  FOR INSERT WITH CHECK (
    exit_scenario_id IN (
      SELECT id FROM exit_scenarios WHERE account_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS cap_table_projections_update ON cap_table_projections
  FOR UPDATE USING (
    exit_scenario_id IN (
      SELECT id FROM exit_scenarios WHERE account_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS cap_table_projections_delete ON cap_table_projections
  FOR DELETE USING (
    exit_scenario_id IN (
      SELECT id FROM exit_scenarios WHERE account_id = auth.uid()
    )
  );

-- ===== EXIT READINESS ASSESSMENTS TABLE =====
-- Stores exit readiness scores (product maturity, revenue scale, team, market fit)
CREATE TABLE IF NOT EXISTS exit_readiness_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exit_scenario_id UUID NOT NULL UNIQUE REFERENCES exit_scenarios(id) ON DELETE CASCADE,

  -- Dimension scores (0–100)
  product_maturity_score INT CHECK (product_maturity_score BETWEEN 0 AND 100),
  revenue_scale_score INT CHECK (revenue_scale_score BETWEEN 0 AND 100),
  team_stability_score INT CHECK (team_stability_score BETWEEN 0 AND 100),
  market_fit_score INT CHECK (market_fit_score BETWEEN 0 AND 100),

  -- Overall readiness
  overall_readiness_score INT CHECK (overall_readiness_score BETWEEN 0 AND 100),
  readiness_band VARCHAR(50) CHECK (readiness_band IN ('not_ready', 'developing', 'ready', 'exceptional')),

  -- Critical gaps (e.g., "Revenue acceleration needed", "Team succession planning")
  critical_gaps JSONB DEFAULT '[]', -- Array of gap descriptions

  -- Narrative summary
  narrative TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exit_readiness_assessments_scenario_id_idx ON exit_readiness_assessments(exit_scenario_id);

-- Enable RLS
ALTER TABLE exit_readiness_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS exit_readiness_assessments_select ON exit_readiness_assessments
  FOR SELECT USING (
    exit_scenario_id IN (
      SELECT id FROM exit_scenarios WHERE account_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS exit_readiness_assessments_insert ON exit_readiness_assessments
  FOR INSERT WITH CHECK (
    exit_scenario_id IN (
      SELECT id FROM exit_scenarios WHERE account_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS exit_readiness_assessments_update ON exit_readiness_assessments
  FOR UPDATE USING (
    exit_scenario_id IN (
      SELECT id FROM exit_scenarios WHERE account_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS exit_readiness_assessments_delete ON exit_readiness_assessments
  FOR DELETE USING (
    exit_scenario_id IN (
      SELECT id FROM exit_scenarios WHERE account_id = auth.uid()
    )
  );

-- Grant permissions to service role for cron/agent access
GRANT ALL ON exit_scenarios TO service_role;
GRANT ALL ON cap_table_projections TO service_role;
GRANT ALL ON exit_readiness_assessments TO service_role;

-- Set row security for auth users
ALTER TABLE exit_scenarios FORCE ROW LEVEL SECURITY;
ALTER TABLE cap_table_projections FORCE ROW LEVEL SECURITY;
ALTER TABLE exit_readiness_assessments FORCE ROW LEVEL SECURITY;
