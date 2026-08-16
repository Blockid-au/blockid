-- Migration 20260816120000 — checkout-session reseller commission ledger (M3)
--
-- A lightweight commission ledger keyed on stripe_session_id for tracking
-- commissions earned at checkout.session.completed time. This is a simpler
-- counterpart to reseller_commissions (migration 0094) which is keyed on
-- stripe_event_id from invoice events. This table captures one-off and
-- first-payment commissions; recurring renewal commissions continue to flow
-- through the invoice-event path (reseller_commissions + reseller_commission_events).
--
-- Commission = 20% of ex-GST (gross / 1.1 * 0.2), stored in AUD cents.
-- Status lifecycle: pending → approved → paid (manual admin action).
--
-- See docs/plans/reseller-module-plan.md M3 — Stripe checkout attribution.

BEGIN;

CREATE TABLE IF NOT EXISTS public.checkout_session_reseller_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES auth.users(id),
  founder_id UUID NOT NULL REFERENCES auth.users(id),
  promo_code TEXT NOT NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  gross_amount_aud_cents INTEGER NOT NULL CHECK (gross_amount_aud_cents > 0),
  commission_aud_cents INTEGER NOT NULL CHECK (commission_aud_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csrc_reseller_id_idx
  ON public.checkout_session_reseller_commissions (reseller_id);

CREATE INDEX IF NOT EXISTS csrc_founder_id_idx
  ON public.checkout_session_reseller_commissions (founder_id);

CREATE INDEX IF NOT EXISTS csrc_status_created_idx
  ON public.checkout_session_reseller_commissions (status, created_at);

COMMENT ON TABLE public.checkout_session_reseller_commissions IS
  'Lightweight commission ledger for checkout.session.completed attributions (M3). '
  'Keyed on stripe_session_id. Commission = 20% of ex-GST (gross / 1.1 * 0.2). '
  'Recurring renewal commissions flow through reseller_commissions (migration 0094).';

ALTER TABLE public.checkout_session_reseller_commissions ENABLE ROW LEVEL SECURITY;

-- Service role has full access; resellers can read their own rows.
CREATE POLICY "service_role_full"
  ON public.checkout_session_reseller_commissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
