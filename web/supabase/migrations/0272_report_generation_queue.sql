-- 0272_report_generation_queue.sql
-- Trust Business Report paywall — background generation queue.
--
-- Stage 3 Batch A sub-task A2 · Master Upgrade Plan §8.4 + §8.10.
--
-- Sits between report_orders (0270) and the assembled report artifact
-- (Phase 4 tables 0240-0242). The Stripe webhook and /api/reports/redeem
-- INSERT one row here per PAID order. A cron-driven worker
-- (/api/cron/report-order-drain, sub-task A2) drains it FOR UPDATE SKIP
-- LOCKED so multiple worker invocations never race on the same order.
--
-- Lifecycle:
--
--   queued  → running                (worker picked the row)
--   running → done                   (orchestrator succeeded)
--   running → queued                 (retry_count < 3 and error is transient)
--   running → failed                 (retry_count >= 3 or permanent error)
--
-- The retry policy is enforced entirely in the worker — this table only
-- stores the counter + last error so the operator can audit failures.
--
-- FK notes:
--   * order_id references public.report_orders(id) with ON DELETE CASCADE
--     so purging a report_orders row also purges its queue entry.
--   * business_id is denormalized here to save a JOIN in the drain query.
--     It's already stored on report_orders so consistency is guaranteed
--     at INSERT time (webhook + redeem route write both together).
--
-- Idempotency: UNIQUE(order_id) ensures a duplicate webhook delivery
-- cannot enqueue the same order twice. The webhook uses INSERT … ON
-- CONFLICT DO NOTHING to make the duplicate case a silent no-op.
--
-- RLS: enabled defense-in-depth (mirrors 0270 and 0091). The app writes
-- via the service-role key with BYPASSRLS.
--
-- Reserved lane: 02xx spec lane per Master Plan §5.2. CEO loop must not
-- author files matching 02xx_*.sql (pre-commit hook enforces).

BEGIN;

CREATE TABLE IF NOT EXISTS public.report_generation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One queue row per order. UNIQUE gives the webhook its idempotency
  -- key so a repeat checkout.session.completed delivery is a no-op.
  order_id uuid NOT NULL UNIQUE
    REFERENCES public.report_orders(id) ON DELETE CASCADE,

  -- Denormalized from report_orders.business_id so the drain query does
  -- not need a JOIN — the worker LIMIT 1 FOR UPDATE SKIP LOCKED path is
  -- called every 2 minutes and stays as cheap as possible.
  business_id uuid NOT NULL,

  -- Lifecycle. See file header. 'queued' is the initial state; the
  -- worker flips it to 'running' under a row-level lock before doing
  -- any AI work.
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed')),

  -- Retry counter — bumped every time the worker returns an error and
  -- decides to re-queue. When retry_count reaches 3 the worker sets
  -- status='failed' and stores error_reason for the operator.
  retry_count integer NOT NULL DEFAULT 0
    CHECK (retry_count >= 0),

  -- Timestamps. enqueued_at feeds the FIFO drain ORDER BY;
  -- started_at + finished_at let the CFO dashboard compute p50 / p95
  -- generation latency per §8.10.
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,

  -- Last error message on the terminal 'failed' path. NULL while the
  -- order is in-flight or successfully completed.
  error_reason text
);

-- FIFO drain — status='queued' ORDER BY enqueued_at.
CREATE INDEX IF NOT EXISTS report_generation_queue_status_enqueued_idx
  ON public.report_generation_queue (status, enqueued_at);

-- Ops queries: "show me stuck rows for order X".
CREATE INDEX IF NOT EXISTS report_generation_queue_order_idx
  ON public.report_generation_queue (order_id);

ALTER TABLE public.report_generation_queue ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.report_generation_queue IS
  'Background generation queue for Trust Business Report orders. One row per PAID report_orders row; drained by /api/cron/report-order-drain every 2 minutes using FOR UPDATE SKIP LOCKED. Master Upgrade Plan §8.4 Stage 3 Batch A sub-task A2.';

COMMENT ON COLUMN public.report_generation_queue.retry_count IS
  'Bumped on each transient failure. When it reaches 3 the worker sets status=failed and stores error_reason; the auto-refund cron then transitions the underlying report_orders row to REFUNDED.';

COMMENT ON COLUMN public.report_generation_queue.business_id IS
  'Denormalized from report_orders.business_id so the FOR UPDATE SKIP LOCKED drain query avoids a JOIN. Written together with order_id in a single INSERT to guarantee consistency.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
