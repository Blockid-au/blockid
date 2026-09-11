-- 0330: S17-B — persist how a snapshot's valuation range was produced.
--
-- `startup_score_history.valuation_low_aud/high_aud` are written by
-- POST /api/score. From S17-B the range is cross-checked against connected
-- revenue (Stripe `svi_signals.mrr_aud`, Xero `svi_evidence.xero_revenue`)
-- via an ARR × sector-multiple range. `valuation_method` records which path
-- produced the row; `valuation_method_note` carries the disagreement /
-- stale-signal note so the history UI can show it next to the band.
--
-- Apply: docker exec -i supabase-db psql -U postgres -d postgres < this file
--        then: NOTIFY pgrst, 'reload schema';

ALTER TABLE public.startup_score_history
  ADD COLUMN IF NOT EXISTS valuation_method TEXT
    CHECK (valuation_method IS NULL OR valuation_method IN ('svi', 'svi+arr_multiple')),
  ADD COLUMN IF NOT EXISTS valuation_method_note TEXT,
  ADD COLUMN IF NOT EXISTS connected_mrr_aud BIGINT,
  ADD COLUMN IF NOT EXISTS connected_mrr_provider TEXT;

COMMENT ON COLUMN public.startup_score_history.valuation_method IS
  'S17-B: svi = SVI dimensions only; svi+arr_multiple = narrowed/widened against connected MRR × sector ARR multiple (lib/valuation-mrr-bridge.ts).';
COMMENT ON COLUMN public.startup_score_history.valuation_method_note IS
  'S17-B: "connected revenue disagrees with SVI-implied range" when the two ranges were disjoint; stale-signal note when a >90-day signal was ignored.';
COMMENT ON COLUMN public.startup_score_history.connected_mrr_aud IS
  'S17-B: the MRR (AUD) that fed the ARR-multiple cross-check, null when none was used.';
COMMENT ON COLUMN public.startup_score_history.connected_mrr_provider IS
  'S17-B: stripe | xero — connector that supplied connected_mrr_aud.';

NOTIFY pgrst, 'reload schema';
