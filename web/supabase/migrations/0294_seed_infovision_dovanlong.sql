-- Migration 0294 — seed IFV + DVL promotion-code ladders
--
-- Provisions the two reseller partners needed for the v3 upgrade launch:
--
--   1. `INFOVISION` (already row #1 in public.resellers per migration 0106)
--      — repoint the existing promotion codes from INFOVISION / INFOVISION20
--      / INFOVISION40 to the shorter IFV / IFV20 / IFV40 the founder asked
--      for, and add the two missing tiers IFV10 and IFV30.
--
--   2. `DOVANLONG` — new reseller row for dovanlong@gmail.com using prefix
--      DVL, with the full 5-tier ladder DVL / DVL10 / DVL20 / DVL30 / DVL40.
--      NB: the "DVL" prefix was NOT explicitly provided by the user — it is
--      a defaulted choice. If wrong the fix is a single UPDATE + a rerun of
--      scripts/reseller/create-promo-codes.mjs.
--
-- Stripe coupon + promotion_code IDs are left as `pending_*` placeholders
-- (except tier 0 which is attribution-only per the ck_stripe_objects_by_tier
-- CHECK from migration 0091). The real Stripe objects are minted by
-- `node scripts/reseller/create-promo-codes.mjs`, which then UPDATEs the
-- rows with the returned IDs and stamps stripe_synced_at.
--
-- IMPORTANT SCHEMA NOTES:
--   - The existing table uses `code` (not `slug`), `display_name`,
--     `status='active'` (not a boolean), `abn`, `contact_email` — see
--     migration 0091 for the canonical shape.
--   - UNIQUE (reseller_id, tier_pct) means we cannot have two tier-20 rows
--     for InfoVision. We therefore UPDATE the existing codes in place rather
--     than inserting parallel rows.
--
-- Applied via (admin — not auto):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -f 0294_seed_infovision_dovanlong.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. InfoVision — repoint existing codes to IFV shortform + add missing tiers
-- ---------------------------------------------------------------------------

-- Repoint tier-0 (attribution-only) code INFOVISION → IFV. Idempotent: the
-- WHERE reseller_id filter scopes it to InfoVision only, and a re-run against
-- an already-IFV row is a no-op UPDATE. Skipped if the target code IFV is
-- already assigned to a different row (UNIQUE(code) would explode).
UPDATE public.reseller_promotion_codes
   SET code = 'IFV'
 WHERE reseller_id = (SELECT id FROM public.resellers WHERE code = 'INFOVISION')
   AND tier_pct = 0
   AND code = 'INFOVISION'
   AND NOT EXISTS (
     SELECT 1 FROM public.reseller_promotion_codes WHERE code = 'IFV'
   );

UPDATE public.reseller_promotion_codes
   SET code = 'IFV20'
 WHERE reseller_id = (SELECT id FROM public.resellers WHERE code = 'INFOVISION')
   AND tier_pct = 20
   AND code = 'INFOVISION20'
   AND NOT EXISTS (
     SELECT 1 FROM public.reseller_promotion_codes WHERE code = 'IFV20'
   );

UPDATE public.reseller_promotion_codes
   SET code = 'IFV40'
 WHERE reseller_id = (SELECT id FROM public.resellers WHERE code = 'INFOVISION')
   AND tier_pct = 40
   AND code = 'INFOVISION40'
   AND NOT EXISTS (
     SELECT 1 FROM public.reseller_promotion_codes WHERE code = 'IFV40'
   );

-- Insert the two tiers InfoVision was previously missing (10, 30). Stripe
-- coupon + promo IDs are placeholders — the provisioning script mints the
-- real objects. ck_stripe_objects_by_tier requires NON-NULL for tier > 0, so
-- we seed with pending_* placeholder strings the script overwrites.
INSERT INTO public.reseller_promotion_codes (
  reseller_id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id, active
)
SELECT r.id, 10, 'IFV10', 'coupon_pending_ifv10', 'promo_pending_ifv10', true
  FROM public.resellers r WHERE r.code = 'INFOVISION'
ON CONFLICT (reseller_id, tier_pct) DO NOTHING;

INSERT INTO public.reseller_promotion_codes (
  reseller_id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id, active
)
SELECT r.id, 30, 'IFV30', 'coupon_pending_ifv30', 'promo_pending_ifv30', true
  FROM public.resellers r WHERE r.code = 'INFOVISION'
ON CONFLICT (reseller_id, tier_pct) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. dovanlong@gmail.com — new reseller (code = DOVANLONG, prefix DVL)
-- ---------------------------------------------------------------------------
-- Wholesale requires GST + ABN (ck_wholesale_gst_required); dovanlong is
-- registered as `retail` (founder pays direct, reseller earns commission)
-- until an ABN is on file.

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
  'DOVANLONG',
  'DoVanLong',
  'retail',
  ARRAY[0,10,20,30,40],
  false,
  NULL,
  0,
  500,
  false,
  false,
  true,
  40.00,
  'active',
  'dovanlong@gmail.com',
  'Seeded 2026-07-30 during v3 upgrade K2. Prefix DVL chosen by default — override via UPDATE if wrong.'
)
ON CONFLICT (code) DO UPDATE
  SET contact_email = EXCLUDED.contact_email,
      display_name  = EXCLUDED.display_name,
      status        = EXCLUDED.status,
      allowed_tiers = EXCLUDED.allowed_tiers,
      updated_at    = now();

-- Full 5-tier DVL ladder. Tier 0 is attribution-only (NULLs enforced by
-- ck_stripe_objects_by_tier); tiers > 0 seed pending_* placeholders that
-- the provisioning script rewrites with real Stripe IDs.
DO $$
DECLARE
  reseller_uuid uuid;
BEGIN
  SELECT id INTO reseller_uuid FROM public.resellers WHERE code = 'DOVANLONG';
  IF reseller_uuid IS NULL THEN
    RAISE EXCEPTION 'DOVANLONG reseller row missing after upsert — cannot seed promo codes';
  END IF;

  INSERT INTO public.reseller_promotion_codes (
    reseller_id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id, active
  ) VALUES
    (reseller_uuid, 0,  'DVL',   NULL,                        NULL,                          true),
    (reseller_uuid, 10, 'DVL10', 'coupon_pending_dvl10',      'promo_pending_dvl10',         true),
    (reseller_uuid, 20, 'DVL20', 'coupon_pending_dvl20',      'promo_pending_dvl20',         true),
    (reseller_uuid, 30, 'DVL30', 'coupon_pending_dvl30',      'promo_pending_dvl30',         true),
    (reseller_uuid, 40, 'DVL40', 'coupon_pending_dvl40',      'promo_pending_dvl40',         true)
  ON CONFLICT (reseller_id, tier_pct) DO NOTHING;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
