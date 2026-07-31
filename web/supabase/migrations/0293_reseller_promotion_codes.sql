-- Migration 0293 — reseller_promotion_codes v3 upgrade
--
-- Extends the existing public.reseller_promotion_codes table (created in
-- migration 0091) with the columns v3 needs to (a) track Stripe sync state,
-- (b) meter redemption counts server-side without a Stripe round-trip, and
-- (c) memo per-code notes for the reseller admin console.
--
-- IMPORTANT: this migration is ADDITIVE. Every ADD COLUMN, CREATE INDEX,
-- and CREATE TRIGGER uses IF NOT EXISTS so it is safe to re-apply and safe
-- against the InfoVision seed rows already present.
--
-- Auschain PTY LTD remains the SOLE merchant of record (see
-- feedback_reseller_no_stripe.md). This table pairs BlockID reseller
-- identity with Stripe coupon + promotion_code IDs so attribution can be
-- computed server-side without giving resellers their own Stripe accounts
-- and without Stripe Connect.
--
-- Applied via: docker exec -i supabase-db psql -U supabase_admin -d postgres \
--                -f 0293_reseller_promotion_codes.sql
--
-- See docs/plans/reseller-module-plan.md § C.2 (promo-code redemption UX)
-- and the K1 sub-task in the v3 upgrade ticket.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Column additions (all IF NOT EXISTS)
-- ---------------------------------------------------------------------------

ALTER TABLE public.reseller_promotion_codes
  ADD COLUMN IF NOT EXISTS stripe_synced_at timestamptz;

ALTER TABLE public.reseller_promotion_codes
  ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'subscription';

-- Retro-add the CHECK constraint only if it isn't already there. NOT VALID +
-- VALIDATE keeps the migration cheap on large tables (this one is tiny).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reseller_promotion_codes_applies_to_check'
       AND conrelid = 'public.reseller_promotion_codes'::regclass
  ) THEN
    ALTER TABLE public.reseller_promotion_codes
      ADD CONSTRAINT reseller_promotion_codes_applies_to_check
      CHECK (applies_to IN ('subscription','one_off','both'));
  END IF;
END $$;

ALTER TABLE public.reseller_promotion_codes
  ADD COLUMN IF NOT EXISTS max_redemptions integer;

ALTER TABLE public.reseller_promotion_codes
  ADD COLUMN IF NOT EXISTS redemption_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.reseller_promotion_codes
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.reseller_promotion_codes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
-- The existing UNIQUE (code) constraint already backs a btree lookup by code,
-- so a redundant idx is not created. Add the (reseller_id, active) index for
-- the admin console "codes for reseller X" list view.

CREATE INDEX IF NOT EXISTS reseller_promotion_codes_reseller_active_idx
  ON public.reseller_promotion_codes (reseller_id, active);

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reseller_promotion_codes_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reseller_promotion_codes_touch_updated_at
  ON public.reseller_promotion_codes;

CREATE TRIGGER trg_reseller_promotion_codes_touch_updated_at
  BEFORE UPDATE ON public.reseller_promotion_codes
  FOR EACH ROW EXECUTE FUNCTION public.reseller_promotion_codes_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Table COMMENT (Auschain sole-merchant-of-record clarification)
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.reseller_promotion_codes IS
  'Reseller-owned Stripe promotion codes. Auschain remains sole merchant of record (feedback_reseller_no_stripe.md); this table pairs BlockID reseller identity with Stripe coupon/promo IDs so attribution is recorded server-side without Stripe Connect. Tier ladder [0,10,20,30,40]% — tier 0 rows are attribution-only and MUST leave stripe_coupon_id NULL (see ck_stripe_objects_by_tier from migration 0091).';

COMMIT;

-- After apply, reload PostgREST schema cache:
-- NOTIFY pgrst reload
NOTIFY pgrst, 'reload schema';
