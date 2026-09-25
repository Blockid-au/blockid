-- 0464 — G34-BT2 email foundation (25/09/2026). NOT APPLIED — founder/ops
-- applies it (one transaction, psql) per pending-authority/README.md.
--
-- EM02  email_sends: one row per send attempt written best-effort by
--       lib/email.ts sendEmail (lib/email-sends.ts). The recipient is stored
--       ONLY as sha256(lower(trim(email))) — never the address.
-- EM03  The C-class frequency cap (≤ 1 / 24 h, ≤ 3 / 7 d, ≤ 1 per flow / 72 h)
--       reads this table and FAILS CLOSED while it is missing: until this file
--       is applied no commercial (C-class) e-mail is sent. Transactional mail
--       is unaffected.
-- EM04  email_preferences.suppressed_reason / suppressed_at: hard bounce or
--       complaint from the Resend webhook (/api/email/resend-webhook). A hard
--       bounce stops every class; a complaint stops commercial mail.
-- EM05  email_preferences.marketing_consent_{at,method,version}: express
--       consent from the unticked checkbox (lib/consent.ts
--       recordMarketingConsent). New rows default every commercial category
--       to FALSE (D24-e); existing rows keep their values.
--
-- Additive only: every retained release ignores the new table and columns.
BEGIN;

CREATE TABLE IF NOT EXISTS public.email_sends (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  recipient_hash      text NOT NULL CHECK (recipient_hash ~ '^[0-9a-f]{64}$'),
  flow                text NOT NULL DEFAULT 'unspecified',
  class               text NOT NULL CHECK (class IN ('T', 'C')),
  template            text,
  provider_message_id text,
  -- 'sent' | 'failed' | 'blocked:<reason>' | 'bounced' | 'complained'
  status              text NOT NULL
);

-- The cap query: recipient + class + status over the last 7 days.
CREATE INDEX IF NOT EXISTS email_sends_recipient_class_created_idx
  ON public.email_sends (recipient_hash, class, created_at DESC);
-- Bounce / complaint webhook stamps the logged row by provider id.
CREATE INDEX IF NOT EXISTS email_sends_provider_message_idx
  ON public.email_sends (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;
-- No policies: service role only (the send path and the webhook).

COMMENT ON TABLE public.email_sends IS
  'G34-BT2 EM02 — one row per e-mail send attempt; recipient as sha256(lower(email)) only. Read by the C-class frequency cap (lib/email-sends.ts).';

ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS suppressed_reason text
    CHECK (suppressed_reason IS NULL OR suppressed_reason IN ('hard_bounce', 'complaint')),
  ADD COLUMN IF NOT EXISTS suppressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent_method text,
  ADD COLUMN IF NOT EXISTS marketing_consent_version text;

-- D24-e: commercial categories start FALSE for rows created from now on.
-- ALTER ... SET DEFAULT never rewrites existing rows.
ALTER TABLE public.email_preferences ALTER COLUMN weekly_reports  SET DEFAULT false;
ALTER TABLE public.email_preferences ALTER COLUMN product_updates SET DEFAULT false;
ALTER TABLE public.email_preferences ALTER COLUMN promotions      SET DEFAULT false;
ALTER TABLE public.email_preferences ALTER COLUMN digest_weekly   SET DEFAULT false;

COMMIT;
NOTIFY pgrst, 'reload schema';
