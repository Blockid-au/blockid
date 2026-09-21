-- 0437_pilot_orders_retired.sql
-- ---------------------------------------------------------------------------
-- G25 lane A (2026-09-21) — the paid BlockID Cohort Validation Pilot and its
-- pilot → annual credit coupon were retired by founder decision on
-- 2026-09-21 ("bỏ luôn coupon và pilot"). Evaluators go straight to the sold
-- ladder (Cohort 25 / Cohort 100 annual with the card-required trial;
-- Scout / Firm / Program). Nothing in web/src writes `pilot_orders` any
-- more: the checkout SKU branch, the webhook fulfilment and the conversion
-- write are gone. Rows already on the table are a financial record (7 y,
-- anonymised by erase_account() — 0421) and stay readable for the ledger.
--
-- This file only re-comments the table. No drop, no column change, no RLS
-- change — 0416 / 0434 stay applied and in history.
--
-- Idempotent (COMMENT ON is a plain overwrite).
--
-- Rollback (restore the 0434 comment)
--   COMMENT ON TABLE public.pilot_orders IS 'G21 P0-C: one paid BlockID Cohort Validation Pilot per Stripe Checkout Session (cohort_pilot_25 / cohort_pilot_50). Written by the webhook; entitlement_until is read by the accelerator desk banner. user_id FKs app_users (CASCADE); project_id FKs projects (SET NULL).';
--
-- Apply: scripts/db/apply-migration.sh web/supabase/migrations/0437_pilot_orders_retired.sql
-- ---------------------------------------------------------------------------

BEGIN;

COMMENT ON TABLE public.pilot_orders IS
  'retired 2026-09-21 (G25) — read-only ledger. Was G21 P0-C: one paid BlockID Cohort Validation Pilot per Stripe Checkout Session (cohort_pilot_25 / cohort_pilot_50). No writer in web/src since G25; rows are a 7-year financial record anonymised by erase_account(). user_id FKs app_users (CASCADE); project_id FKs projects (SET NULL).';

COMMIT;
