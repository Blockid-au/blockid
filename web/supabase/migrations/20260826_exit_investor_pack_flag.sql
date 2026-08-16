/**
 * Migration: Exit Scenarios — investor pack pin flag
 * Date: 2026-08-26
 * Version target: v3.7.1
 *
 * Adds a `use_for_investor_pack` boolean to `exit_scenarios` mirroring
 * the same flag on `financial_models`. Enables founders to pin one
 * exit thesis scenario for automatic inclusion in the generated
 * Investor Pack PDF (Week 3 of the 8-week upgrade plan).
 *
 * Partial index keeps lookups cheap when the generator scans for the
 * pinned scenario per account.
 */

ALTER TABLE exit_scenarios
  ADD COLUMN IF NOT EXISTS use_for_investor_pack BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS exit_scenarios_investor_pack_idx
  ON exit_scenarios (account_id, use_for_investor_pack)
  WHERE use_for_investor_pack = true;
