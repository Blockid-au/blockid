-- 0415_pilot_orders.sql
-- ---------------------------------------------------------------------------
-- G21 P0-C (2026-09-20, docs/plans/g21-fi-upgrade-2026-09-20.md § P0-C)
-- The paid BlockID Cohort Validation Pilot — one-off Stripe checkout
-- (cohort_pilot_25 A$1,500 / cohort_pilot_50 A$2,500 inc. GST, lib/pricing/
-- pilot-skus.ts). One row per completed Checkout Session, written by the
-- Stripe webhook (`checkout.session.completed`, metadata.kind =
-- "cohort_pilot"); the 90-day Cohort-tier entitlement itself is granted the
-- same way the comped pilot is (app_users.plan via lib/pilots/service.ts,
-- `startPaidPilot`) and `entitlement_until` here is what the accelerator desk
-- banner and the expiry cron read.
--
--   user_id           the buyer (app_users, CASCADE — erasure-map mode delete)
--   project_id        optional: the program's project the pilot is run against
--   sku               cohort_pilot_25 | cohort_pilot_50
--   applicants_cap    25 | 50 (copied from the SKU at purchase time)
--   amount_cents      what Stripe charged (session.amount_total), AUD inc. GST
--   stripe_session_id UNIQUE → idempotent on webhook retries
--   status            paid | refunded | expired
--   entitlement_until when the Cohort-tier access granted by this order ends
--   metrics           the success metrics measured together (review time,
--                     evaluator consistency, startups processed, evidence
--                     completion, satisfaction, renewal intent) — filled by
--                     the pilot report, jsonb so the shape can grow
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS). NOT applied by the
-- lane — the merging session applies via scripts/db/apply-migration.sh and
-- commits content/reports/schema-migrations.json.
--
-- Rollback
--   DROP TABLE IF EXISTS public.pilot_orders;

CREATE TABLE IF NOT EXISTS public.pilot_orders (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id             uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  buyer_email            text NOT NULL,
  sku                    text NOT NULL CHECK (sku IN ('cohort_pilot_25', 'cohort_pilot_50')),
  applicants_cap         integer NOT NULL CHECK (applicants_cap > 0),
  amount_cents           integer NOT NULL CHECK (amount_cents >= 0),
  currency               text NOT NULL DEFAULT 'aud',
  stripe_session_id      text NOT NULL UNIQUE,
  stripe_payment_intent  text NULL,
  status                 text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'expired')),
  entitlement_until      timestamptz NOT NULL,
  metrics                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pilot_orders_user_status_idx
  ON public.pilot_orders (user_id, status, entitlement_until DESC);

CREATE INDEX IF NOT EXISTS pilot_orders_entitlement_idx
  ON public.pilot_orders (entitlement_until)
  WHERE status = 'paid';

COMMENT ON TABLE public.pilot_orders IS
  'G21 P0-C: one paid BlockID Cohort Validation Pilot per Stripe Checkout Session (cohort_pilot_25 / cohort_pilot_50). Written by the webhook; entitlement_until is read by the accelerator desk banner. user_id FKs app_users (CASCADE); project_id FKs projects (SET NULL).';

-- ─── RLS: owner read; every write is service-role (webhook / admin) ─────────

ALTER TABLE public.pilot_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pilot_orders_owner_select ON public.pilot_orders;
CREATE POLICY pilot_orders_owner_select ON public.pilot_orders
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS pilot_orders_service_all ON public.pilot_orders;
CREATE POLICY pilot_orders_service_all ON public.pilot_orders
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
