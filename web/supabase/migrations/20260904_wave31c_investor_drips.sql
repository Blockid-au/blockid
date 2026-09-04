-- Wave 31c: Investor lead drip sequence.
--
-- When an anonymous investor submits a lead on a shared TBR, they now receive
-- a 3-email drip in addition to the existing founder-side notifications:
--   Step 1 (T+0)       — instant acknowledgement (all leads)
--   Step 2 (T+2 days)  — SVI delta update (warm | ready_to_talk only)
--   Step 3 (T+7 days)  — soft nudge + feedback (all leads)
--
-- Idempotency: UNIQUE (lead_id, step) guarantees each investor gets each step
-- at most once even if the cron double-fires.
--
-- Unsubscribe: investor_unsubscribes gates all steps by lowercased email.

CREATE TABLE IF NOT EXISTS public.tbr_lead_drips (
  id       SERIAL PRIMARY KEY,
  lead_id  BIGINT NOT NULL REFERENCES public.tbr_leads(id) ON DELETE CASCADE,
  step     SMALLINT NOT NULL CHECK (step IN (1, 2, 3)),
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, step)
);

CREATE INDEX IF NOT EXISTS idx_tbr_lead_drips_lead
  ON public.tbr_lead_drips(lead_id);

CREATE TABLE IF NOT EXISTS public.investor_unsubscribes (
  email            TEXT PRIMARY KEY,
  unsubscribed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

NOTIFY pgrst, 'reload schema';
