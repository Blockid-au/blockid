-- 0352_oauth_connections_account_columns.sql — legacy OAuth vault: account_id
-- + raw_profile (post-ship fix, S25-A live verify, 2026-09-13)
-- ---------------------------------------------------------------------------
-- The legacy `public.oauth_connections` table was created by 0027 keyed on
-- (user_email, provider) with a `metadata` jsonb column. T0016 (2026-06-13)
-- rewrote the Stripe, Xero and GA4 callbacks (and /api/evidence/disconnect) to
-- write `account_id` (svi_accounts.id) + `raw_profile` and upsert ON CONFLICT
-- (account_id, provider) — columns that never existed, so every Stripe / Xero
-- / GA4 link since then failed silently (the upsert result was not checked)
-- and the S25-A `connector-resync` cron answered 503 `candidates_unavailable`
-- on its first live dry run.
--
-- This adds the two columns so the vault matches the code. The callbacks now
-- also fill `user_email` (the project OWNER's data key) and conflict on the
-- original (user_email, provider) index — one Stripe / Xero / GA4 link per
-- founder email in the legacy vault, re-pointed to the latest project on
-- re-connect — so account erasure (NON_FK_EXTRAS: oauth_connections by
-- user_email) keeps covering these rows. `account_id` cascades from
-- svi_accounts as belt-and-braces. No FK on app_users → erasure fixture
-- (125) unchanged.

BEGIN;

ALTER TABLE public.oauth_connections
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.svi_accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS raw_profile text;

-- Rows written by the callbacks carry user_email; keep the column nullable so
-- an older row shape can never block a token refresh UPDATE.
ALTER TABLE public.oauth_connections ALTER COLUMN user_email DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_connections_account_id
  ON public.oauth_connections (account_id)
  WHERE account_id IS NOT NULL;

COMMENT ON COLUMN public.oauth_connections.account_id IS
  'svi_accounts.id the connector feeds (Stripe / Xero / GA4 evidence connectors). NULL for the email-only GitHub / LinkedIn rows.';
COMMENT ON COLUMN public.oauth_connections.raw_profile IS
  'JSON text snapshot the callback captured at link time (tenant / account summary — no tokens).';

COMMIT;

NOTIFY pgrst, 'reload schema';
