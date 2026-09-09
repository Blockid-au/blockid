-- 0128 — Guest analysis: abandoned-checkout reconciliation + recovery email.
--
-- Owner note: public.guest_analyses is owned by `postgres`, so this file
-- applies cleanly with:
--   docker exec -i supabase-db psql -U postgres -d postgres < 0128_...sql
-- (If a future environment reports "must be owner", re-run with -U supabase_admin.)
--
-- WHY
-- ---
-- Exactly one A$3 guest checkout has ever been abandoned and it sat in
-- status='pending' indefinitely: no follow-up, no cleanup, and — worst —
-- indistinguishable from a paid-but-undelivered order, because
-- `amount_paid_aud_cents` is stamped with 300 at *session creation*, before
-- a cent has moved. The column name asserts a payment that has not happened.
--
-- THE COLUMN
-- ----------
-- We do NOT rename `amount_paid_aud_cents`. It is written by two live code
-- paths (the create-order route and the Stripe webhook) and migrations here
-- are applied by hand, separately from `deploy-live.sh`. A rename therefore
-- opens a window in which the deployed code and the schema disagree, and in
-- that window the *only* self-serve revenue path on the site returns 500.
-- That is an unacceptable trade for a cosmetic naming win on a two-row table.
--
-- Instead:
--   * a COMMENT states plainly that the column is an INTENT, not a receipt;
--   * `paid_amount_aud_cents` is added as the honest money-arrived field. It
--     is NULL until a *verified Stripe* fact says otherwise (webhook, or the
--     reconcile cron reading the session back from Stripe). The predicate
--     "did this person actually pay us" is now
--     `paid_amount_aud_cents IS NOT NULL`, and nothing else.
--
-- Backfill provenance: `stripe_payment_intent` is only ever written from a
-- Stripe event payload, so a row carrying one did go through a real payment.
-- Those rows (and only those) get their paid amount backfilled.

BEGIN;

-- ── 1. The misleading column ───────────────────────────────────────────────

COMMENT ON COLUMN public.guest_analyses.amount_paid_aud_cents IS
  'MISNAMED — this is the INTENDED price in cents (300) stamped at Stripe '
  'session creation, BEFORE any payment. It is not evidence of payment and '
  'must never be read as such. Use paid_amount_aud_cents for that. Kept '
  'under the old name because renaming it would desync the schema from the '
  'live checkout route during the manual-migration/deploy gap.';

ALTER TABLE public.guest_analyses
  ADD COLUMN IF NOT EXISTS paid_amount_aud_cents INT;

COMMENT ON COLUMN public.guest_analyses.paid_amount_aud_cents IS
  'Cents actually received, copied from Stripe session.amount_total by the '
  'webhook or the reconcile cron. NULL = Stripe has never confirmed a '
  'payment for this row (or the row predates migration 0128).';

UPDATE public.guest_analyses
   SET paid_amount_aud_cents = amount_paid_aud_cents
 WHERE paid_amount_aud_cents IS NULL
   AND stripe_payment_intent IS NOT NULL;

-- ── 2. Terminal states for unpaid sessions ─────────────────────────────────
--
-- 'abandoned' — Stripe was asked and said: session never paid (expired, or
--               open past its expires_at). Recoverable; eligible for exactly
--               one recovery email.
-- 'expired'   — we could not establish a Stripe truth at all (no session id
--               on the row, or Stripe 404s it) and the row has aged out.
--               NOT recoverable, never emailed — we do not know enough.

ALTER TABLE public.guest_analyses
  DROP CONSTRAINT IF EXISTS guest_analyses_status_check;

ALTER TABLE public.guest_analyses
  ADD CONSTRAINT guest_analyses_status_check
  CHECK (status IN (
    'pending', 'paid', 'analyzing', 'delivered',
    'failed', 'refunded', 'abandoned', 'expired'
  ));

-- ── 3. Reconciliation audit trail ──────────────────────────────────────────

ALTER TABLE public.guest_analyses
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_session_status TEXT;

COMMENT ON COLUMN public.guest_analyses.abandoned_at IS
  'When the reconciler confirmed via Stripe that the session went unpaid. '
  'The recovery email is gated on this being at least an hour old.';
COMMENT ON COLUMN public.guest_analyses.reconciled_at IS
  'Last time the reconcile cron asked Stripe about this row.';
COMMENT ON COLUMN public.guest_analyses.stripe_session_status IS
  'Verbatim "<status>/<payment_status>" from Stripe at reconcile time — the '
  'evidence the terminal state was derived from.';

-- ── 4. Recovery email: at-most-once bookkeeping ────────────────────────────
--
-- recovery_email_sent_at is CLAIMED (set) before the send is attempted, by a
-- guarded UPDATE ... WHERE recovery_email_sent_at IS NULL. A concurrent or
-- repeat cron run updates zero rows and sends nothing. A send that fails
-- afterwards records recovery_email_error and is deliberately NOT retried:
-- the requirement is one email, once — at-most-once beats at-least-once here.

ALTER TABLE public.guest_analyses
  ADD COLUMN IF NOT EXISTS recovery_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_email_error TEXT,
  ADD COLUMN IF NOT EXISTS resume_token TEXT;

COMMENT ON COLUMN public.guest_analyses.recovery_email_sent_at IS
  'Claim marker for the single recovery email. Set BEFORE the send attempt '
  'via a guarded UPDATE so a re-run can never send a second one.';
COMMENT ON COLUMN public.guest_analyses.recovery_email_error IS
  'Populated when the claimed send failed. The email is not retried.';
COMMENT ON COLUMN public.guest_analyses.resume_token IS
  'Opaque secret in the recovery email link. GET /api/guest-analysis/resume/'
  '<token> rebuilds a Stripe checkout for this exact row, so the founder '
  'retypes nothing.';

CREATE UNIQUE INDEX IF NOT EXISTS guest_analyses_resume_token_key
  ON public.guest_analyses (resume_token)
  WHERE resume_token IS NOT NULL;

-- Reconcile scan: pending rows oldest-first.
CREATE INDEX IF NOT EXISTS idx_guest_analyses_pending_created
  ON public.guest_analyses (created_at)
  WHERE status = 'pending';

-- Recovery-email scan: abandoned rows that have not been emailed.
CREATE INDEX IF NOT EXISTS idx_guest_analyses_recovery_due
  ON public.guest_analyses (abandoned_at)
  WHERE status = 'abandoned' AND recovery_email_sent_at IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
