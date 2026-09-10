-- 0316_grant_finder_flags.sql
-- ---------------------------------------------------------------------------
-- Grant & Program Finder entitlements (T0242, plan §4e / §4h).
--
-- Adds two feature flags to the plans that include the Money Finder report:
--   grant_finder  — full ranked report without spending credits
--   money_radar   — Founder Radar deadline alerts (T0247 wires the surface)
--
-- Rows: founder_starter (A$29), founder_growth (A$69), founder_package
-- (A$149 one-off), and the three evaluator rungs investor_angel (Scout),
-- investor_advisor (Firm), investor_vc_small (Program) — every rung that the
-- /funding paywall card can call "included in your plan". founder_enterprise
-- and investor_vc_ent inherit through the tier ladder supersets and are
-- included here too so the DB row (what getEntitlements reads) agrees.
--
-- Mirrors web/src/config/pricing/plans.csv (regenerate plans.generated.ts
-- with `npx tsx scripts/build-plans.ts`), src/lib/entitlements.ts
-- LEGACY_FEATURE_FALLBACK and src/lib/entitlements/tier-ladder.ts.
-- Pattern: 0131 / 0309. Idempotent — appends only when the flag is missing.
-- ---------------------------------------------------------------------------

update plans
   set feature_flags = feature_flags || '["grant_finder"]'::jsonb,
       updated_at    = now()
 where id in ('founder_starter','founder_growth','founder_enterprise','founder_package',
              'investor_angel','investor_advisor','investor_vc_small','investor_vc_ent')
   and not (feature_flags ? 'grant_finder');

update plans
   set feature_flags = feature_flags || '["money_radar"]'::jsonb,
       updated_at    = now()
 where id in ('founder_starter','founder_growth','founder_enterprise','founder_package',
              'investor_angel','investor_advisor','investor_vc_small','investor_vc_ent')
   and not (feature_flags ? 'money_radar');

notify pgrst, 'reload schema';
