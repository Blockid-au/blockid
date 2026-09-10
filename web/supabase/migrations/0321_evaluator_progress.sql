-- 0321_evaluator_progress.sql
-- ---------------------------------------------------------------------------
-- T0273 (G12 sprint S4) — weekly Evaluator Progress Radar.
--
-- Scout / Firm / Program subscribers (docs/plans/evaluator-traction-2026-09-10.md
-- §3b) get one email every Sunday 23:30 UTC (Monday morning AEST) listing the
-- startups they evaluate that moved this week: SVI delta, stage change, new
-- evidence, latest Trust BizReport, plus the money signals from
-- `funding_matches` (next deadline / new matches) keyed on
-- `evaluations.project_id` — never the listing-keyed `watchlist` (G12-10).
--
-- `evaluator_progress_sends` is the idempotency ledger, same shape and role
-- as `founder_digest_sends` (20260904_wave28a): the cron INSERTs the
-- (user_id, period_start) slot BEFORE sending, so a retry or a manual
-- re-run of the same week hits the UNIQUE constraint and is counted as a
-- dupe instead of double-sending. `payload` keeps the rendered movers /
-- deadlines so support can see exactly what a user was told.
--
-- Rollback
--   drop table if exists public.evaluator_progress_sends;
--
-- Apply by hand (self-hosted Supabase; migrations are not run on deploy):
--   docker cp web/supabase/migrations/0321_evaluator_progress.sql supabase-db:/tmp/0321.sql
--   docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/0321.sql
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.evaluator_progress_sends (
  id            bigserial primary key,
  user_id       uuid not null references public.app_users(id) on delete cascade,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  -- {movers:[…], deadlines:[…], new_matches:n, startups:n} — what was sent.
  payload       jsonb not null default '{}'::jsonb,
  sent_at       timestamptz not null default now(),
  opened_at     timestamptz,
  unique (user_id, period_start)
);

create index if not exists evaluator_progress_sends_user_sent_idx
  on public.evaluator_progress_sends (user_id, sent_at desc);

comment on table public.evaluator_progress_sends is
  'Evaluator Progress Radar (T0273): one row per (evaluator, ISO week) claimed before the weekly email is sent — UNIQUE makes a cron retry a no-op.';

alter table public.evaluator_progress_sends enable row level security;

drop policy if exists evaluator_progress_sends_owner_select on public.evaluator_progress_sends;
create policy evaluator_progress_sends_owner_select on public.evaluator_progress_sends
  for select using (user_id = auth.uid());

drop policy if exists evaluator_progress_sends_service_all on public.evaluator_progress_sends;
create policy evaluator_progress_sends_service_all on public.evaluator_progress_sends
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

commit;

notify pgrst, 'reload schema';
