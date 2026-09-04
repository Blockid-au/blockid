-- Wave 27A: Investor lead capture on Trusted Business Report shares.
--
-- When an anonymous /tbr/<token> reader engages for > 30 seconds we surface
-- a soft "reach out to the founder" modal. Submissions land here so the
-- founder can review, filter by interest, and reply via email.
--
-- Notifications: an insert here also feeds `founder_notifications` (kind =
-- 'tbr_lead') so the lead appears in the founder's activity inbox alongside
-- Telegram + email alerts.
--
-- Anonymous ingestion is rate-limited at the route layer to 3 leads per IP
-- per 24h. No PII beyond what the investor voluntarily submits is stored.

CREATE TABLE IF NOT EXISTS public.tbr_leads (
  id              BIGSERIAL PRIMARY KEY,
  share_token     TEXT NOT NULL,
  project_id      UUID,
  investor_name   TEXT,
  investor_email  TEXT NOT NULL,
  investor_firm   TEXT,
  investor_role   TEXT,
  interest_level  TEXT NOT NULL CHECK (interest_level IN ('exploring','warm','ready_to_talk')),
  message         TEXT,
  viewer_country  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Founder-facing listing: latest leads for their project.
CREATE INDEX IF NOT EXISTS idx_tbr_leads_project_created
  ON public.tbr_leads (project_id, created_at DESC);

-- Fast lookup by share_token for the route handler.
CREATE INDEX IF NOT EXISTS idx_tbr_leads_token_created
  ON public.tbr_leads (share_token, created_at DESC);
