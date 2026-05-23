-- 0041: Add unsubscribe feedback columns to email_preferences
ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS unsubscribe_reason TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribe_feedback TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
