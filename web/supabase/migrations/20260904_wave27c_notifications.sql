-- Wave 27C: Founder notification hub.
--
-- Single unified activity feed for a founder — TBR opens, investor Q&A,
-- new investor leads, share mints, analysis completions, SVI trend alerts.
-- Consumed by /workspace/notifications and the top-nav unread badge.
--
-- Writers throttle to avoid noise (e.g. tbr_view is limited to 1 per token
-- per hour at the API layer). Payload is a free-form JSONB blob so each
-- kind can carry its own metadata without schema churn.

CREATE TABLE IF NOT EXISTS public.founder_notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL,
  project_id  UUID,
  kind        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary founder feed lookup: newest-first per user.
CREATE INDEX IF NOT EXISTS idx_founder_notifications_user_created
  ON public.founder_notifications (user_id, created_at DESC);

-- Fast unread badge count (partial index — only rows where read_at IS NULL).
CREATE INDEX IF NOT EXISTS idx_founder_notifications_user_unread
  ON public.founder_notifications (user_id) WHERE read_at IS NULL;
