-- 0110_trial_warnings.sql
-- Trial + card-upfront model (2026-07-24).
--
-- Adds per-user trial lifecycle columns onto app_users. The primary trial
-- state remains in `subscription_trial_state` (migration 0075) which is
-- the canonical Stripe-mirrored snapshot; these columns are the app-side
-- flags used by the pre-charge email cron and the dashboard trial banner.
--
--   trial_started_at        — when the user first entered a trial
--   trial_end_at            — when the trial auto-converts to paid
--   trial_warning_sent_at   — set by /api/cron/trial-charge-warning to
--                             prevent duplicate 24-48h pre-charge emails
--   trial_converted_at      — set when subscription flips trialing→active
--   payment_failed_at       — set when invoice.payment_failed webhook fires
--
-- Legacy grandfathered users (plan='free', trial_end_at IS NULL) are NOT
-- touched — this migration is additive.

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS trial_started_at      timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end_at          timestamptz,
  ADD COLUMN IF NOT EXISTS trial_warning_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_converted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS payment_failed_at     timestamptz;

CREATE INDEX IF NOT EXISTS app_users_trial_end_at_idx
  ON public.app_users (trial_end_at)
  WHERE trial_end_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS app_users_trial_warning_pending_idx
  ON public.app_users (trial_end_at)
  WHERE trial_end_at IS NOT NULL AND trial_warning_sent_at IS NULL;
