-- 0120_right_size_plan_credit_grants.sql
-- ---------------------------------------------------------------------------
-- Right-size the included monthly credit grant per subscription tier.
--
-- Why
--   Grants were set at 50 / 200 / 1000 credits for A$29 / A$99 / A$299. The
--   binding cost is `enhanced_report_standard` (3.00 credits), the only key
--   that runs the 13-criteria multi-agent pipeline via orchestrateReport() at
--   A$0.40-1.20 of model spend per run. (`svi_analysis` at 0.50 credits runs
--   the deterministic computeSVI() and costs ~nothing, so it never binds.)
--
--   At full burn on that key, the old grants exposed:
--     A$29  → 16.7 runs → A$20.00 COGS on A$26.36 ex-GST →  24% GM
--     A$99  → 66.7 runs → A$80.00 COGS on A$90.00 ex-GST →  11% GM
--     A$299 → 333  runs → A$400    COGS on A$271.82      → negative
--   i.e. the heaviest users were the least profitable.
--
--   New grants are sized so that even a subscriber who burns every included
--   credit on the most expensive action still leaves >= 70% gross margin, and
--   ~80% at the expected A$0.80/run:
--     A$29  → ex-GST 26.36  → 30% budget  7.91 →  6.6 runs →  20 credits → 69.6%
--     A$99  → ex-GST 90.00  → 30% budget 27.00 → 22.5 runs →  65 credits → 71.1%
--     A$299 → ex-GST 271.82 → 30% budget 81.55 → 68.0 runs → 200 credits → 70.6%
--
-- Blast radius
--   No app_users are on founder_starter / founder_growth / founder_scale at the
--   time of this change, so no existing customer's allowance is reduced. The
--   legacy `growth` plan (live paying subscribers on 200/mo) is deliberately
--   NOT touched here or in PLAN_CREDITS — cutting an existing customer's
--   included allowance mid-term is a downgrade.
--
-- Keep in sync with
--   web/src/config/pricing/plans.csv  (usage_limits.monthly_credits)
--   web/src/config/pricing/plans.generated.ts  (npx tsx scripts/build-plans.ts)
--   web/src/lib/credits.ts  (PLAN_CREDITS)
--
-- Idempotent: jsonb_set on a keyed row, safe to re-run.
-- ---------------------------------------------------------------------------

update plans
   set usage_limits = jsonb_set(usage_limits, '{monthly_credits}', '20'::jsonb, true),
       updated_at   = now()
 where id = 'founder_starter';

update plans
   set usage_limits = jsonb_set(usage_limits, '{monthly_credits}', '65'::jsonb, true),
       updated_at   = now()
 where id = 'founder_growth';

update plans
   set usage_limits = jsonb_set(usage_limits, '{monthly_credits}', '200'::jsonb, true),
       updated_at   = now()
 where id = 'founder_scale';

-- founder_enterprise stays -1 ("unlimited") in the DB; the concrete 1000/mo
-- cap lives in PLAN_CREDITS because grantCredits() rejects amount <= 0.

-- founder_free carried monthly_credits=25 from the 0074 seed — 25 credits is
-- ~8 full multi-agent reports per month, free, forever. It is dormant today
-- (checkUsageLimit() has no call sites, and the real free grant is the
-- one-time PLAN_CREDITS.free = 3), but it is a live landmine the moment usage
-- limits get wired up. Align it with the actual free entitlement.
update plans
   set usage_limits = jsonb_set(usage_limits, '{monthly_credits}', '3'::jsonb, true),
       updated_at   = now()
 where id = 'founder_free';

notify pgrst, 'reload schema';
