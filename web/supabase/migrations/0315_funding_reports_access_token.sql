-- 0315_funding_reports_access_token.sql
-- ---------------------------------------------------------------------------
-- Guest access to a paid Money Finder report (T0242, plan §4a / §4e).
--
-- A guest who pays A$3 has no account, so the emailed link carries a random
-- `access_token` (?t=…) and the report route accepts it in place of an owner
-- session. Signed-in rows also get a token so a founder can share the link
-- without exposing anything else.
--
--   access_token   text, unique — 32 base64url chars from 24 random bytes
--   meta           jsonb — summary / tax estimates / actions / Stripe ids
--                  (the 0311 columns hold only the three match arrays + md)
--   error_message  text — why a row is `failed`, for support
--
-- Idempotent (add column if not exists). Apply with:
--   docker exec -i supabase-db psql -U postgres -d postgres < 0315_… && NOTIFY pgrst
-- ---------------------------------------------------------------------------

alter table public.funding_reports
  add column if not exists access_token  text,
  add column if not exists meta          jsonb not null default '{}'::jsonb,
  add column if not exists error_message text;

create unique index if not exists funding_reports_access_token_idx
  on public.funding_reports (access_token)
  where access_token is not null;

create index if not exists funding_reports_stripe_session_idx
  on public.funding_reports (stripe_session_id)
  where stripe_session_id is not null;

comment on column public.funding_reports.access_token is
  'Random token in the emailed link (?t=). Guest reports are readable only with it; owners read via user_id.';
comment on column public.funding_reports.meta is
  'summary / tax / actions / narrative_source from generateFundingReport, plus Stripe payment ids for one_off rows.';

notify pgrst, 'reload schema';
