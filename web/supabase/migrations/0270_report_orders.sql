-- 0270_report_orders.sql
-- Trust Business Report paywall — order lifecycle table.
--
-- Master Upgrade Plan §8.3 — implements the state machine that gates the
-- full Trust Business Report behind either an A$5.50 (inc-GST, §14bis D1)
-- Stripe Checkout OR a credit debit for active subscribers.
--
--   NOT_PURCHASED → CHECKOUT_INITIATED → PAYMENT_PENDING → PAID
--     → GENERATING → READY → SHARED → EXPIRED
--     ↘ FAILED → REFUNDED
--
-- Free registration + login + profile creation stay untouched (§8.1). The
-- paywall only trips when the user asks for the full 12-area analysis,
-- generates/views a Trust Business Report, exports PDF/DOCX, or opens a
-- share link. The 10-page preview is still free.
--
-- FK notes:
--   * business_id references public.projects.id in this phase. The v3
--     first-class businesses(id) table lands in Phase 2 as migration
--     0202_business_profile.sql; when that ships, a follow-up migration
--     re-points business_id at the new table without dropping data.
--   * report_id has NO FK yet — the immutable reports/report_versions
--     tables ship in Phase 4 (migrations 0240-0242). It stores a uuid
--     handle so the orchestrator can enqueue with a stable id.
--
-- Idempotency:
--   Every DDL uses IF NOT EXISTS. The partial unique index prevents a
--   second in-flight order for the same (business, user) while a prior
--   order is still PAID/GENERATING/READY — protects against rage-clicks.
--
-- RLS: enabled defense-in-depth (mirrors 0091 + 0050). All app writes go
-- through the service-role key which has BYPASSRLS.
--
-- Reserved lane: this migration sits in the 02xx spec lane per Master
-- Plan §5.2. CEO loop stays in the 011x/012x lane and must not author
-- files matching 02xx_*.sql (pre-commit hook enforces).

BEGIN;

CREATE TABLE IF NOT EXISTS public.report_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope. business_id = the entity being analysed. Points at projects
  -- until Phase 2 introduces the first-class businesses table.
  business_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,

  -- Payment path. sku_trust_report_5aud = Path A (A$5.50 Stripe Checkout,
  -- A$5.00 net + A$0.50 GST). sku_trust_report_credits = Path B (subscriber
  -- credit debit, amount_aud=0). Kept as text so a future SKU rename does
  -- not need a schema change.
  product_sku text NOT NULL
    CHECK (product_sku IN ('sku_trust_report_5aud','sku_trust_report_credits')),

  -- Money moved. amount_aud is stored in cents (Stripe convention) so
  -- rounding is exact. credits_used mirrors the credit debit for Path B
  -- and is zero for Path A. Both zero is never valid outside NOT_PURCHASED.
  amount_aud integer NOT NULL DEFAULT 0
    CHECK (amount_aud >= 0),
  credits_used integer NOT NULL DEFAULT 0
    CHECK (credits_used >= 0),

  -- Stripe handles. Unique index on stripe_session_id gives webhook
  -- idempotency for checkout.session.completed.
  stripe_session_id text,
  stripe_payment_intent_id text,

  -- Lifecycle. See state machine header. failure_reason is set only on
  -- FAILED transitions; retry_count tracks the auto-retry attempts before
  -- final refund.
  status text NOT NULL DEFAULT 'CHECKOUT_INITIATED'
    CHECK (status IN (
      'CHECKOUT_INITIATED',
      'PAYMENT_PENDING',
      'PAID',
      'GENERATING',
      'READY',
      'SHARED',
      'EXPIRED',
      'FAILED',
      'REFUNDED'
    )),
  failure_reason text,
  retry_count integer NOT NULL DEFAULT 0
    CHECK (retry_count >= 0),

  -- Timestamps. expires_at = paid_at + 90 days per §8.4 policy; enforced
  -- application-side, but stored so a nightly cron can flip READY→EXPIRED.
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  generated_at timestamptz,
  expires_at timestamptz,

  -- Link to the generated report artifact. NULL until GENERATING succeeds.
  -- No FK yet (see header) — Phase 4 will add one to report_versions(id).
  report_id uuid,

  -- Attribution. first_touch UTM captured at CHECKOUT_INITIATED so the
  -- CFO dashboard can compute CAC by channel per §8.10.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS report_orders_user_idx
  ON public.report_orders (user_id);

CREATE INDEX IF NOT EXISTS report_orders_business_idx
  ON public.report_orders (business_id);

CREATE INDEX IF NOT EXISTS report_orders_status_idx
  ON public.report_orders (status);

CREATE UNIQUE INDEX IF NOT EXISTS report_orders_stripe_session_uniq
  ON public.report_orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Only one active/in-flight order per (business, user) at a time. Prevents
-- double-charge on rage-click when the user hits Confirm twice. Legacy
-- terminal states (EXPIRED, REFUNDED, FAILED) are allowed to coexist.
CREATE UNIQUE INDEX IF NOT EXISTS report_orders_active_uniq
  ON public.report_orders (business_id, user_id)
  WHERE status IN ('CHECKOUT_INITIATED','PAYMENT_PENDING','PAID','GENERATING','READY');

ALTER TABLE public.report_orders ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.report_orders IS
  'Trust Business Report paywall order lifecycle. One row per checkout attempt (Stripe A$5.50 inc-GST OR subscriber credit debit) that resolves to a single report generation. Master Upgrade Plan §8.3.';

COMMENT ON COLUMN public.report_orders.business_id IS
  'The business being analysed. Currently references projects(id); a Phase 2 follow-up will re-point this at the first-class businesses(id) table (migration 0202).';

COMMENT ON COLUMN public.report_orders.product_sku IS
  'sku_trust_report_5aud = A$5.50 Stripe Checkout (A$5.00 net + A$0.50 GST). sku_trust_report_credits = subscriber credit debit (amount_aud stays 0).';

COMMENT ON COLUMN public.report_orders.amount_aud IS
  'Amount charged in cents AUD (Stripe convention). Zero for the credit path. Tax-inclusive amount per Australian Consumer Law B2C display rules.';

COMMENT ON COLUMN public.report_orders.expires_at IS
  'When the READY report becomes EXPIRED (paid_at + 90 days per §8.4). Nightly cron flips status; user can regenerate with a fresh order.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
