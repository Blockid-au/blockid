-- Rollback for 0474_pricing_v5_payg.sql (G35 Pricing v5 PAYG schema).
--
-- Use only if 0474 itself misbehaves AND no Pricing v5 order has been taken:
-- section 0 refuses (the whole transaction rolls back) while any v5 SKU,
-- IN_REVIEW status, v5 revenue kind, review row, or a second in-flight/READY
-- order per (business, user) exists — those rows would violate the restored
-- 0270 / 0420 constraints, and deleting them would destroy paid-order history.
--
-- Run with psql, then re-apply 0473 so erase_account() is the 150-entry
-- version again (0474's map names columns this file drops):
--   cd web/supabase/pending-authority
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < 0474_rollback_pricing_v5_payg.sql        # then:
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < 0473_team_members_roster_columns.sql     # idempotent; restores the 150-entry erase_account()
-- and point web/src/lib/privacy/erasure-sql.ts ERASURE_MIGRATION_FILE back at 0473
-- (revert the 0474 erasure-map entries + fixture rows in the same commit).

BEGIN;

-- ─── 0. refuse while v5 data exists ─────────────────────────────────────────
DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM public.report_orders
   WHERE product_sku NOT IN ('sku_trust_report_5aud', 'sku_trust_report_credits')
      OR status = 'IN_REVIEW'
      OR tier IS NOT NULL
      OR upgrade_of_order_id IS NOT NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '0474 rollback refused: % report_orders row(s) use Pricing v5 SKUs / tiers / IN_REVIEW', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.revenue_events
   WHERE kind IN ('report_snapshot', 'report_full', 'report_verified', 'report_upgrade', 'report_funding');
  IF v_n > 0 THEN
    RAISE EXCEPTION '0474 rollback refused: % revenue_events row(s) use Pricing v5 kinds', v_n;
  END IF;

  IF to_regclass('public.report_reviews') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.report_reviews' INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION '0474 rollback refused: % report_reviews row(s) exist', v_n;
    END IF;
  END IF;

  -- The restored 0270 index includes READY: two such orders per (business, user) cannot coexist.
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM public.report_orders
     WHERE status IN ('CHECKOUT_INITIATED', 'PAYMENT_PENDING', 'PAID', 'GENERATING', 'READY')
     GROUP BY business_id, user_id HAVING count(*) > 1
  ) d;
  IF v_n > 0 THEN
    RAISE EXCEPTION '0474 rollback refused: % (business, user) pair(s) hold more than one active order; the 0270 unique index cannot be restored', v_n;
  END IF;
END $$;

-- ─── 1. RLS policies added by 0474 ─────────────────────────────────────────
DROP POLICY IF EXISTS report_orders_owner_select ON public.report_orders;
DROP POLICY IF EXISTS report_orders_admin_select ON public.report_orders;
DROP POLICY IF EXISTS report_orders_service_all ON public.report_orders;

-- ─── 2. review tables ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.report_review_claims;
DROP TABLE IF EXISTS public.report_reviews;

-- ─── 3. revenue_events.kind → the 0420 list ────────────────────────────────
ALTER TABLE public.revenue_events DROP CONSTRAINT IF EXISTS revenue_events_kind_check;
ALTER TABLE public.revenue_events
  ADD CONSTRAINT revenue_events_kind_check
  CHECK (kind IN (
    'trial_start','trial_convert','trial_end_no_payment',
    'subscribe','upgrade','downgrade','renewal','refund','chargeback',
    'credit_pack',
    'trust_report_5aud','guest_analysis_3aud','funding_report_3aud',
    'startup_package','cohort_pilot'
  ));

-- ─── 4. assembled_reports ───────────────────────────────────────────────────
ALTER TABLE public.assembled_reports DROP CONSTRAINT IF EXISTS assembled_reports_payg_tier_check;
ALTER TABLE public.assembled_reports DROP CONSTRAINT IF EXISTS assembled_reports_reviewed_by_fkey;
ALTER TABLE public.assembled_reports
  DROP COLUMN IF EXISTS payg_tier,
  DROP COLUMN IF EXISTS reviewed,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS reviewed_by;

-- ─── 5. report_orders ───────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.report_orders_inflight_sku_uniq;
DROP INDEX IF EXISTS public.report_orders_upgrade_of_idx;
DROP INDEX IF EXISTS public.report_orders_in_review_sla_idx;
CREATE UNIQUE INDEX IF NOT EXISTS report_orders_active_uniq
  ON public.report_orders (business_id, user_id)
  WHERE status IN ('CHECKOUT_INITIATED','PAYMENT_PENDING','PAID','GENERATING','READY');

ALTER TABLE public.report_orders DROP CONSTRAINT IF EXISTS report_orders_product_sku_check;
ALTER TABLE public.report_orders
  ADD CONSTRAINT report_orders_product_sku_check
  CHECK (product_sku IN ('sku_trust_report_5aud','sku_trust_report_credits'));

ALTER TABLE public.report_orders DROP CONSTRAINT IF EXISTS report_orders_status_check;
ALTER TABLE public.report_orders
  ADD CONSTRAINT report_orders_status_check
  CHECK (status IN ('CHECKOUT_INITIATED','PAYMENT_PENDING','PAID','GENERATING','READY','SHARED','EXPIRED','FAILED','REFUNDED'));

ALTER TABLE public.report_orders DROP CONSTRAINT IF EXISTS report_orders_tier_check;
ALTER TABLE public.report_orders DROP CONSTRAINT IF EXISTS report_orders_currency_check;
ALTER TABLE public.report_orders DROP CONSTRAINT IF EXISTS report_orders_upgrade_not_self_check;
ALTER TABLE public.report_orders DROP CONSTRAINT IF EXISTS report_orders_upgrade_of_order_id_fkey;
ALTER TABLE public.report_orders DROP CONSTRAINT IF EXISTS report_orders_reviewed_by_fkey;
ALTER TABLE public.report_orders
  DROP COLUMN IF EXISTS tier,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS upgrade_of_order_id,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS delivered_at,
  DROP COLUMN IF EXISTS sla_due_at;

COMMENT ON COLUMN public.report_orders.product_sku IS
  'sku_trust_report_5aud = A$5.50 Stripe Checkout (A$5.00 net + A$0.50 GST). sku_trust_report_credits = subscriber credit debit (amount_aud stays 0).';

COMMIT;

NOTIFY pgrst, 'reload schema';
