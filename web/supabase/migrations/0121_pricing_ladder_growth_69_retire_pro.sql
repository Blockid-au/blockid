-- 0121_pricing_ladder_growth_69_retire_pro.sql
-- ---------------------------------------------------------------------------
-- New pricing ladder: Growth A$99 -> A$69 (65 -> 45 credits), Pro A$299
-- retired. Founder A$29/20cr, Free 3cr and Enterprise are unchanged.
--
-- Why
--   Benchmark of 20 real self-serve SaaS products (human-delivered services
--   excluded): discretionary-tool median A$20.09, cap-table / registry median
--   A$138.53 — a 6.9x gap, so analysis and registry cannot share one ladder.
--   A$299 exceeded JPMorgan Workplace Solutions (A$277 for 100 stakeholders),
--   indefensible for an unproven product. Growth A$69 paired with the new
--   A$59 equity add-on lands at A$128 — 8% under the registry median and under
--   Pulley (A$138.53). Ladder multipliers compress 3.4x/3.0x -> 2.4x/1.9x.
--
--   Credit grant recomputed, not carried over. The binding cost is
--   `enhanced_report_standard` (3.00 credits) — the only key running the
--   13-criteria multi-agent pipeline via orchestrateReport(), at A$0.40-1.20
--   model spend per run:
--     A$69 -> ex-GST 62.73 -> 30% budget 18.82 -> 15.7 runs -> 47 credits
--          -> round down to 45 -> GM 71.4%
--   Keeping 65 would have meant 58.5% GM, below the 70% floor.
--
-- Blast radius
--   Zero app_users are on founder_starter / founder_growth / founder_scale and
--   zero Stripe subscriptions reference the A$99 or A$299 prices, so no
--   existing customer's price or allowance changes. The legacy `growth` /
--   `growth_annual` SKUs (live paying subscribers on 200 credits/mo) are NOT
--   touched here or in PLAN_CREDITS.
--
--   founder_scale is deactivated, never deleted: historical invoices reference
--   its Stripe price (archived, active=false, not deleted) and a grandfathered
--   subscriber must still resolve entitlements and their monthly grant.
--
-- Keep in sync with
--   web/src/config/pricing/plans.csv           (price + usage_limits)
--   web/src/config/pricing/plans.generated.ts  (npx tsx scripts/build-plans.ts)
--   web/src/lib/credits.ts                     (PLAN_CREDITS)
--   web/.env + web/.env.runtime                (STRIPE_PRICE_FOUNDER_GROWTH)
--
-- Idempotent: keyed updates only. Safe to re-run.
-- ---------------------------------------------------------------------------

begin;

-- 1. Growth: A$99 -> A$69 monthly, A$990 -> A$690 annual, 65 -> 45 credits,
--    and repoint at the new inclusive-GST Stripe price. The A$99 price
--    (price_1UDLWaJ7OAnXQ9sVUoNtg12x) is archived in Stripe, not deleted.
update plans
   set price_aud_cents        = 6900,
       annual_price_aud_cents = 69000,
       usage_limits           = jsonb_set(usage_limits, '{monthly_credits}', '45'::jsonb, true),
       stripe_price_id        = 'price_1UDNbSJ7OAnXQ9sV4ZKepac5',
       updated_at             = now()
 where id = 'founder_growth';

-- 2. Pro (founder_scale) retired. Row kept for grandfathered renewals and
--    historical invoice resolution; active=false removes it from listPlans()
--    and every public ladder surface.
update plans
   set active     = false,
       updated_at = now()
 where id = 'founder_scale';

commit;

-- Verification (run manually):
--   select id, price_aud_cents, annual_price_aud_cents, active,
--          usage_limits->>'monthly_credits', stripe_price_id
--     from plans where id like 'founder%' order by sort_order;

notify pgrst, 'reload schema';
