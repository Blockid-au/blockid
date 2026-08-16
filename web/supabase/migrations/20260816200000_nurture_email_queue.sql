-- Migration: T_EMAIL_0001 — D1/D4/D9 nurture email queue
-- Stores scheduled nurture emails for new users.
-- Processed by /api/cron/nurture-emails (CRON_SECRET-gated, runs hourly).

CREATE TABLE IF NOT EXISTS nurture_email_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  day          int  NOT NULL CHECK (day IN (1, 4, 9)),
  scheduled_at timestamptz NOT NULL,
  sent_at      timestamptz,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sent', 'failed')),
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Partial index — only index rows the cron job actually queries.
CREATE INDEX IF NOT EXISTS nurture_email_queue_pending_idx
  ON nurture_email_queue (scheduled_at)
  WHERE status = 'pending';

-- Unique guard: never enqueue the same day twice for the same user.
CREATE UNIQUE INDEX IF NOT EXISTS nurture_email_queue_user_day_idx
  ON nurture_email_queue (user_id, day);

-- RLS: service-role only. No anon or authenticated policies.
ALTER TABLE nurture_email_queue ENABLE ROW LEVEL SECURITY;
-- (no policies created — service-role bypasses RLS by default)
