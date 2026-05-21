-- Phase 7: Revenue & Dividends tables
-- Manual revenue entries for the revenue dashboard
-- Dividend distribution records for the dividend calculator

-- ── revenue_entries: manual revenue tracking ───────────────────────────────
CREATE TABLE IF NOT EXISTS revenue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  month text NOT NULL,        -- YYYY-MM format
  amount numeric(12,2) NOT NULL DEFAULT 0,
  source text DEFAULT 'manual', -- manual, stripe, xero, quickbooks
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email, month)
);

ALTER TABLE revenue_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_revenue_entries_email
  ON revenue_entries (email, month DESC);

-- ── dividend_records: dividend distribution history ─────────────────────────
CREATE TABLE IF NOT EXISTS dividend_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  period text NOT NULL,       -- YYYY-MM
  net_income numeric(12,2) NOT NULL DEFAULT 0,
  distribution_pct numeric(5,2) NOT NULL DEFAULT 0,
  total_dividend numeric(12,2) NOT NULL DEFAULT 0,
  per_share_dividend numeric(12,6) DEFAULT 0,
  retained_earnings numeric(12,2) DEFAULT 0,
  franking_rate numeric(5,4) DEFAULT 0.30,
  payouts jsonb,             -- Array of per-shareholder payout details
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dividend_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_dividend_records_account
  ON dividend_records (account_id, created_at DESC);
