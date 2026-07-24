-- Seed the QA_AFFILIATE reseller with a tier-0 (attribution-only) promotion
-- code so `POST /api/reseller/code/validate {code:'QAAFF'}` returns ok:true.
--
-- Tier 0 = attribution-only (no Stripe coupon / promotion_code IDs attached).
-- The reseller org row itself must already exist (seeded by the reseller
-- module bootstrap). If it doesn't, the SELECT returns zero rows and the
-- INSERT is a no-op — safe to re-run.
--
-- Ops-side apply:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 -f 0111_seed_qa_affiliate_promo.sql
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -c "NOTIFY pgrst, 'reload schema';"
--
-- Applied to production on 2026-07-24 (Round 6 follow-up).

INSERT INTO public.reseller_promotion_codes (
  reseller_id, code, tier_pct, stripe_coupon_id, stripe_promotion_code_id, active
)
SELECT r.id, 'QAAFF', 0, NULL, NULL, true
  FROM public.resellers r WHERE r.code='QA_AFFILIATE'
ON CONFLICT (reseller_id, tier_pct) DO NOTHING;
