-- 0367_secondary_market_view_flag.sql
-- ---------------------------------------------------------------------------
-- S27-B — `secondary_market.view` entitlement for the pre-IPO secondary
-- trading SANDBOX (/workspace/secondary-offer order book, /api/secondary/sim/*).
--
-- Growth and above: founder_growth (A$69), founder_scale (Pro, inactive but
-- grandfathered) and founder_enterprise — the rungs that carry the cap table
-- the sandbox trades over (cap_table.write / share_management). Nothing is
-- taken away; the flag only widens.
--
-- Mirrors web/src/config/pricing/plans.csv (plans.generated.ts regenerated
-- with `npx tsx scripts/build-plans.ts`), src/lib/entitlements.ts
-- LEGACY_FEATURE_FALLBACK and src/lib/entitlements/tier-ladder.ts
-- GROWTH_FEATURES. Pattern: 0131 / 0309 / 0316. Idempotent — appends only
-- when the flag is missing.
--
-- Apply: scripts/db/apply-migration.sh web/supabase/migrations/0367_secondary_market_view_flag.sql
-- ---------------------------------------------------------------------------

update plans
   set feature_flags = feature_flags || '["secondary_market.view"]'::jsonb,
       updated_at    = now()
 where id in ('founder_growth', 'founder_scale', 'founder_enterprise')
   and not (feature_flags ? 'secondary_market.view');

notify pgrst, 'reload schema';
