-- Migration 0101 — reseller Stripe billing columns (schema-only foundation)
--
-- Delivers: resellers.stripe_customer_id + resellers.stripe_default_payment_method_id.
--
-- Per docs/plans/reseller-module-plan.md § U.3 (wholesale billing model) and
-- § C.1.5 (create-startup atomic transaction). The tick 75
-- /api/reseller/create-startup route explicitly deferred the Stripe subscription
-- line against the reseller's payment method with the comment "the resellers
-- table has no stripe_customer_id column yet" — this migration lands those
-- columns so a follow-up tick can wire the wholesale subscription create
-- without a second schema round-trip.
--
-- What the columns are for
--   stripe_customer_id:
--     The reseller org's Stripe Customer (one per resellers row). Wholesale
--     provisioning charges this customer for each attributed founder workspace
--     ($99/mo × N Growth seats). Retail resellers may leave this null since
--     retail commission accrues off the end-founder's own Stripe customer.
--   stripe_default_payment_method_id:
--     The card / bank / SEPA payment method the wholesale reseller has
--     verified as the default charge target. Denormalised here (rather than
--     read live from Stripe on every provisioning call) so the create-startup
--     endpoint doesn't couple its p95 to a Stripe round-trip. The
--     reseller-stripe-sync weekly cron (P3.1) will re-hydrate this column
--     if it drifts against Stripe.
--
-- Why NOT enforced as required-for-wholesale here
--   The current tree still has zero wholesale sign-ups (P1.5 InfoVision seed
--   is HUMAN-BLOCKED on H.20 ABN + GST). Adding a CHECK now that binds
--   billing_model='wholesale' → stripe_customer_id IS NOT NULL would prevent
--   the admin console from creating the first wholesale reseller row before
--   the payment-method-setup UI ships. The follow-up tick that lands the
--   payment-method UI + subscription-create wiring will add that CHECK once
--   the InfoVision seed is in place and the payment-method flow is proven.
--
-- Applied via: docker exec <supabase-container> psql -U postgres -d postgres
--              -f 0101_reseller_stripe_billing_columns.sql
-- Then: NOTIFY pgrst, 'reload schema';
--
-- ADDITIVE + IDEMPOTENT. Safe to re-run — every column uses IF NOT EXISTS.

BEGIN;

ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_default_payment_method_id text;

-- Unique when populated: one Stripe Customer maps to at most one reseller row.
-- Partial to allow multiple nulls (most resellers pre-payment-method).
CREATE UNIQUE INDEX IF NOT EXISTS resellers_stripe_customer_id_uniq
  ON public.resellers (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN public.resellers.stripe_customer_id IS
  'Stripe Customer id owning the reseller org''s wholesale subscriptions. Populated by the payment-method-setup UI (follow-up tick). Nullable for retail resellers.';

COMMENT ON COLUMN public.resellers.stripe_default_payment_method_id IS
  'Denormalised default Stripe payment method. Rehydrated by the reseller-stripe-sync weekly cron on drift. Nullable until the reseller completes the payment-method-setup flow.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
