-- Migration 0106 — InfoVision seed (P1.5 unblocked 2026-07-23)
--
-- InfoVision Australia Pty Ltd — first reseller partner (row #1).
-- Wholesale billing model: reseller pays BlockID on behalf of attributed
-- founders (Auschain → InfoVision B2B invoice per plan-delta U.3.1).
--
-- Delivers:
--   * 1 row in public.resellers (code = 'INFOVISION')
--   * 3 rows in public.reseller_promotion_codes (tiers 0, 20, 40)
--
-- Founder confirmed 2026-07-23 to unblock P1.5 (H.20 partial-clear).
--
-- =========================================================================
-- REPLACE-BEFORE-APPLY (admin MUST swap these placeholders before running):
-- =========================================================================
--   1. resellers.abn                      '00 000 000 000'
--        → replace with InfoVision's real 11-digit ABN in "NN NNN NNN NNN"
--          format. Check constraint ck_abn_format enforces this shape.
--   2. resellers.contact_email            'partnerships@infovision.example'
--        → replace with the real InfoVision partnership contact address.
--   3. reseller_promotion_codes.stripe_coupon_id       'coupon_pending_*'
--      reseller_promotion_codes.stripe_promotion_code_id 'promo_pending_*'
--        → placeholders for tiers 20 + 40. Real Stripe coupon +
--          promotion_code IDs must be minted in the Stripe dashboard
--          (P8.5 human-blocked) and pasted in before apply. Tier 0
--          intentionally uses NULLs (attribution-only per U.3 —
--          Stripe rejects 0-value coupons).
-- =========================================================================
--
-- Applied via (admin, per reference_db_migrations — NOT auto-applied):
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     < web/supabase/migrations/0106_infovision_seed.sql
--
-- ON CONFLICT DO NOTHING on both tables so re-application is safe.
-- Trailing NOTIFY reloads PostgREST schema cache.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. resellers row (InfoVision — wholesale)
-- ---------------------------------------------------------------------------

INSERT INTO public.resellers (
  code,
  display_name,
  billing_model,
  allowed_tiers,
  gst_registered,
  abn,
  monthly_credit_budget,
  monthly_sandbox_credits,
  can_create_startups,
  can_grant_credits,
  collateral_approval_required,
  commission_share_pct,
  status,
  contact_email,
  notes
) VALUES (
  'INFOVISION',
  'InfoVision',
  'wholesale',
  ARRAY[0,10,20,30,40],
  true,                             -- gst_registered — founder confirmed 2026-07-23
  '00 000 000 000',                 -- ABN — REPLACE with real 11-digit ABN before apply (H.20)
  20000,                            -- monthly_credit_budget (H.4)
  500,                              -- monthly_sandbox_credits (H.19)
  true,                             -- can_create_startups
  true,                             -- can_grant_credits
  true,                             -- collateral_approval_required (default)
  40.00,                            -- commission_share_pct (H.17)
  'active',
  'partnerships@infovision.example', -- REPLACE with real partnership email before apply
  'Founder-approved 2026-07-23. First reseller. Wholesale billing model per U.3. P1.5 seed authored via migration 0106.'
)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. reseller_promotion_codes rows — tiers 0, 20, 40
-- ---------------------------------------------------------------------------
-- Tier 0 = attribution-only (no discount, no Stripe objects — ck_stripe_objects_by_tier).
-- Tier 20 = 20% off; Stripe IDs are placeholders (mint in P8.5, then REPLACE).
-- Tier 40 = 40% off; matches commission_share_pct.

DO $$
DECLARE
  reseller_uuid uuid;
BEGIN
  SELECT id INTO reseller_uuid FROM public.resellers WHERE code = 'INFOVISION';

  IF reseller_uuid IS NULL THEN
    RAISE EXCEPTION 'InfoVision reseller row missing — cannot seed promotion_codes';
  END IF;

  -- Tier 0 — attribution only (no discount, no Stripe object)
  INSERT INTO public.reseller_promotion_codes (
    reseller_id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id, active
  ) VALUES (
    reseller_uuid, 0, 'INFOVISION', NULL, NULL, true
  )
  ON CONFLICT (code) DO NOTHING;

  -- Tier 20 — 20% off, needs real Stripe coupon (P8.5 minting deferred)
  INSERT INTO public.reseller_promotion_codes (
    reseller_id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id, active
  ) VALUES (
    reseller_uuid,
    20,
    'INFOVISION20',
    'coupon_pending_infovision20',   -- REPLACE with real Stripe coupon id (P8.5)
    'promo_pending_infovision20',    -- REPLACE with real Stripe promotion_code id (P8.5)
    true
  )
  ON CONFLICT (code) DO NOTHING;

  -- Tier 40 — 40% off (matches commission_share_pct)
  INSERT INTO public.reseller_promotion_codes (
    reseller_id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id, active
  ) VALUES (
    reseller_uuid,
    40,
    'INFOVISION40',
    'coupon_pending_infovision40',   -- REPLACE with real Stripe coupon id (P8.5)
    'promo_pending_infovision40',    -- REPLACE with real Stripe promotion_code id (P8.5)
    true
  )
  ON CONFLICT (code) DO NOTHING;
END $$;

COMMIT;

-- After apply, reload PostgREST schema cache:
NOTIFY pgrst, 'reload schema';
