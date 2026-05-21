-- Blockchain sync engine: toggle, queue, catch-up
-- Off-chain first: all equity data stays in Supabase (source of truth).
-- Blockchain is optional transparency layer, toggleable per startup.

-- ═══════════════════════════════════════════════════════════════════════
-- Sync config per startup (token info + sync toggle)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blockchain_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE,
  sync_enabled BOOLEAN DEFAULT FALSE,
  sync_state TEXT DEFAULT 'off',
  token_address TEXT,
  token_symbol TEXT,
  token_name TEXT,
  last_sync_at TIMESTAMPTZ,
  last_sync_block BIGINT,
  pending_events INT DEFAULT 0,
  auto_sync_transfers BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_sync_state CHECK (sync_state IN ('off','on','paused','catching_up'))
);

-- Unique ticker symbols across all startups
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_token_symbol
  ON blockchain_sync_config(token_symbol)
  WHERE token_symbol IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- Sync event queue (all equity events that need on-chain sync)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blockchain_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  priority INT DEFAULT 0,
  status TEXT DEFAULT 'pending',
  tx_hash TEXT,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT valid_queue_status CHECK (status IN ('pending','processing','synced','failed','skipped'))
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_account_status
  ON blockchain_sync_queue(account_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_pending
  ON blockchain_sync_queue(status, priority DESC, created_at ASC)
  WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════════════════
-- Pending transfer reviews (unknown MetaMask → dashboard transfers)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pending_transfer_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount BIGINT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  block_number BIGINT,
  status TEXT DEFAULT 'pending',
  resolution TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_review_status CHECK (status IN ('pending','resolved','flagged','ignored'))
);

CREATE INDEX IF NOT EXISTS idx_transfer_reviews_account
  ON pending_transfer_reviews(account_id, status);

-- ═══════════════════════════════════════════════════════════════════════
-- Dividend payouts (per-shareholder tracking)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dividend_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dividend_id UUID,
  account_id UUID NOT NULL,
  shareholder_id UUID,
  shareholder_name TEXT NOT NULL,
  shares_held BIGINT NOT NULL,
  gross_amount NUMERIC(14,2) NOT NULL,
  franking_credit NUMERIC(14,2) NOT NULL,
  distribution_method TEXT DEFAULT 'bank',
  status TEXT DEFAULT 'pending',
  claim_tx_hash TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_payout_status CHECK (status IN ('pending','claimed','paid','retained')),
  CONSTRAINT valid_dist_method CHECK (distribution_method IN ('bank','on_chain','auto'))
);

CREATE INDEX IF NOT EXISTS idx_dividend_payouts_account
  ON dividend_payouts(account_id, dividend_id);

-- ═══════════════════════════════════════════════════════════════════════
-- Helper function: increment pending events counter
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION increment_pending_events(p_account_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE blockchain_sync_config
  SET pending_events = pending_events + 1,
      updated_at = NOW()
  WHERE account_id = p_account_id;
END;
$$ LANGUAGE plpgsql;
