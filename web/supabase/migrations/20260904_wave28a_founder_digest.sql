-- Wave 28A: Founder Weekly Digest — send log + preference flag.
--
-- Every Monday 09:00 Australia/Sydney the /api/cron/founder-digest-weekly
-- route iterates enrolled founders and sends a summary of the last 7 days'
-- TBR views, investor leads, and SVI movement.
--
-- This migration is additive:
--   1. `founder_digest_sends` — one row per (user_id, period_start) so a
--      duplicate cron tick can never double-send (UNIQUE constraint handles
--      idempotency at the DB layer).
--   2. `email_preferences.digest_weekly` — new opt-in flag, defaults TRUE so
--      existing users are enrolled unless they toggle it off in
--      /workspace/notifications/preferences. Preferences hub already lives on
--      `email_preferences` (see migration 0018) — no separate
--      `notification_preferences` table exists, so we extend the existing
--      hub rather than fork a new one. ADD COLUMN IF NOT EXISTS is safe:
--      no rewrite of existing rows, no lock escalation on the hot
--      `email_preferences` table.

CREATE TABLE IF NOT EXISTS public.founder_digest_sends (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL,
  project_id     UUID,
  period_start   TIMESTAMPTZ NOT NULL,
  period_end     TIMESTAMPTZ NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at      TIMESTAMPTZ,
  UNIQUE (user_id, period_start)
);

-- Newest-first per user for the "your recent digests" surface + retention job.
CREATE INDEX IF NOT EXISTS idx_founder_digest_sends_user_sent
  ON public.founder_digest_sends (user_id, sent_at DESC);

-- Extend the existing email_preferences hub with a digest flag. IF NOT
-- EXISTS makes this rerun-safe (Supabase runs each migration once, but the
-- boot script re-applies on cold-start in some environments).
ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS digest_weekly BOOLEAN NOT NULL DEFAULT TRUE;

-- Notify PostgREST to reload schema so the new column is queryable via the
-- REST API without a service restart.
NOTIFY pgrst, 'reload schema';
