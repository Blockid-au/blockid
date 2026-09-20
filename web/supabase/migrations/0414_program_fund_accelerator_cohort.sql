-- 0414_program_fund_accelerator_cohort.sql
-- ---------------------------------------------------------------------------
-- G20-F1 (2026-09-20, docs/plans/g20-ready-for-sale-2026-09-20.md § 3 F1.3)
-- Plan ↔ flag ↔ page parity: the Program (investor_vc_small, A$349) and
-- Fund (investor_fund, A$999) cards both sell "Cohort dashboard + quarterly
-- LP / sponsor report export" (web/src/lib/plans-v2.ts), but
-- /workspace/accelerator/cohort and /workspace/accelerator/quarterly-report
-- gate on `accelerator.cohort` (FeatureGate + requireTierForPage), which
-- neither row carried — a paying Program subscriber answered 402 on the page
-- while the export API (`lp_report`) worked. plans.csv, plans.generated.ts,
-- LEGACY_FEATURE_FALLBACK and the tier ladder carry the flag from this
-- commit; this file brings the live `plans` rows in line (VC Enterprise too,
-- so it stays a superset of Fund — plans.test.ts invariant).
--
-- Idempotent: skips rows that already carry the flag. Prices / limits /
-- trial untouched. NOT applied by the lane — the main session applies via
-- scripts/db/apply-migration.sh (docs/ops runbook: migration ledger).
--
-- Rollback
--   UPDATE public.plans
--      SET feature_flags = feature_flags - 'accelerator.cohort', updated_at = now()
--    WHERE id IN ('investor_vc_small', 'investor_fund', 'investor_vc_ent');

UPDATE public.plans
   SET feature_flags = feature_flags || '["accelerator.cohort"]'::jsonb,
       updated_at    = now()
 WHERE id IN ('investor_vc_small', 'investor_fund', 'investor_vc_ent')
   AND jsonb_typeof(feature_flags) = 'array'
   AND NOT (feature_flags ? 'accelerator.cohort');

NOTIFY pgrst, 'reload schema';
