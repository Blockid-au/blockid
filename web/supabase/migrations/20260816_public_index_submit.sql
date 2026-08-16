-- 20260816_public_index_submit.sql (T-1301)
--
-- Public index submission staging table.
--
-- Inbound submissions from /submit arrive unauthenticated, so we cannot write
-- directly into startup_listings (which enforces auth.uid() = startup_id).
-- Instead we land every submission here; an admin review step promotes rows
-- to startup_listings (setting is_public = true). This keeps anon writes
-- completely isolated from the curated public index.
--
-- Idempotent — every DDL uses IF NOT EXISTS. Single BEGIN/COMMIT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.public_index_submissions (
  id              bigserial PRIMARY KEY,
  startup_name    text        NOT NULL,
  tagline         text        NOT NULL CHECK (char_length(tagline) <= 120),
  state           text,
  industry        text,
  stage           text,
  website_url     text,
  contact_email   text        NOT NULL,
  is_public_opt_in boolean   NOT NULL DEFAULT true,
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  notes           text
);

CREATE INDEX IF NOT EXISTS public_index_submissions_status_idx
  ON public.public_index_submissions (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS public_index_submissions_email_idx
  ON public.public_index_submissions (contact_email);

-- RLS: completely locked down except for service_role (used by the API route).
ALTER TABLE public.public_index_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_index_submissions_service_all ON public.public_index_submissions;
CREATE POLICY public_index_submissions_service_all
  ON public.public_index_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.public_index_submissions IS
  'T-1301 — staging table for unauthenticated /submit inbound startup submissions. Admin review promotes rows to startup_listings.';

NOTIFY pgrst, 'reload schema';

COMMIT;
