-- 0310_evaluator_plan_names.sql
-- ---------------------------------------------------------------------------
-- Relabel the three self-serve investor plan rows to the Evaluator ladder
-- names (G12 §3b, T0268, 2026-09-10): Scout / Firm / Program.
--
--   investor_angel     "Angel"                 → "Scout"    A$79/mo
--   investor_advisor   "Advisor"               → "Firm"     A$149/mo
--   investor_vc_small  "VC Small (5-seat min)" → "Program"  A$349/mo
--
-- Ids, prices, flags and usage_limits are untouched (0309 owns those);
-- plans-db.ts surfaces `plans.name` in-app, so the DB label must match
-- plans.csv / plans-v2.ts / tier-ladder.ts or a paying Scout would see
-- "Angel" on their billing page while /pricing sold them "Scout".
--
-- Generated from web/src/config/pricing/plans.csv — regenerate
-- plans.generated.ts with `npx tsx scripts/build-plans.ts` when changing either.
-- Idempotent: plain UPDATEs keyed on id, safe to re-run.
-- ---------------------------------------------------------------------------

update plans set name = 'Scout',   updated_at = now() where id = 'investor_angel';
update plans set name = 'Firm',    updated_at = now() where id = 'investor_advisor';
update plans set name = 'Program', updated_at = now() where id = 'investor_vc_small';

notify pgrst, 'reload schema';
