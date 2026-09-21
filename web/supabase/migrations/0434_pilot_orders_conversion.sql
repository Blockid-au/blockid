-- 0434_pilot_orders_conversion.sql — the pilot's conversion to an annual Cohort plan
-- ---------------------------------------------------------------------------
-- G23-B (2026-09-21, docs/plans/g23-grounding-proposals-2026-09-21.md lane B)
-- The advisor plan funnel ends "offer paid pilot → run cohort → convert to
-- annual". When a program converts its Cohort Validation Pilot into a
-- Cohort 25 / Cohort 100 annual subscription (checkout `convert_from_pilot`
-- → Stripe subscription with metadata.pilot_order_id → webhook
-- `customer.subscription.created`), the webhook stamps the order:
--
--   converted_at               when the subscription was created
--   converted_plan             accelerator_starter | accelerator_growth
--   converted_subscription_id  the Stripe subscription id (sub_…) — support
--                              and the L5 auto row read it; never a secret
--
-- Two nullable columns + one nullable text; no backfill (no conversion has
-- happened yet). /admin/validation L5 counts a pilot with converted_at as a
-- renewal (lib/validation/model.ts deriveAutoRows). Idempotent (ADD COLUMN
-- IF NOT EXISTS). NOT applied by the lane — the merging session applies via
-- scripts/db/apply-migration.sh and commits content/reports/schema-migrations.json.
--
-- Rollback
--   ALTER TABLE public.pilot_orders
--     DROP COLUMN IF EXISTS converted_at,
--     DROP COLUMN IF EXISTS converted_plan,
--     DROP COLUMN IF EXISTS converted_subscription_id;

ALTER TABLE public.pilot_orders
  ADD COLUMN IF NOT EXISTS converted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS converted_plan text NULL,
  ADD COLUMN IF NOT EXISTS converted_subscription_id text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pilot_orders_converted_plan_check'
  ) THEN
    ALTER TABLE public.pilot_orders
      ADD CONSTRAINT pilot_orders_converted_plan_check
      CHECK (converted_plan IS NULL OR converted_plan IN ('accelerator_starter', 'accelerator_growth'));
  END IF;
END $$;

COMMENT ON COLUMN public.pilot_orders.converted_at IS
  'G23-B: when the pilot converted to an annual Cohort plan (webhook customer.subscription.created with metadata.pilot_order_id). NULL = not converted.';
COMMENT ON COLUMN public.pilot_orders.converted_plan IS
  'G23-B: the Cohort rung the pilot converted to (accelerator_starter = Cohort 25, accelerator_growth = Cohort 100).';
COMMENT ON COLUMN public.pilot_orders.converted_subscription_id IS
  'G23-B: the Stripe subscription id created by the conversion checkout.';

NOTIFY pgrst, 'reload schema';
