-- 0088_email_drips_and_nps.sql (T_CCSO — onboarding drip + NPS pulse)
--
-- CCSO agent: post-SVI onboarding retention.
--
--   email_drips   — scheduled outbound touches. A row per (email, campaign)
--                   is enqueued the moment the founder receives their first
--                   SVI report. A lightweight cron
--                   (/api/cron/email-drip) walks pending rows whose
--                   scheduled_for <= now(), renders + sends, and marks
--                   sent/failed.
--
--   nps_responses — one row per NPS touch. The D30 drip inserts a stub
--                   with a random token; the founder clicks
--                   /nps?token=… and posts score + optional comment.
--                   The in-app NPS widget (legacy) also writes here with
--                   the user_email/context columns, so this migration is
--                   additive: create-if-missing for the legacy shape and
--                   ADD-IF-MISSING for the new columns.
--
-- Additive + idempotent so it can be re-applied safely.

create table if not exists public.email_drips (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid,
  email          text not null,
  campaign       text not null check (campaign in (
                    'onboarding_d1',
                    'onboarding_d3',
                    'onboarding_d7',
                    'onboarding_d14',
                    'nps_d30'
                  )),
  scheduled_for  timestamptz not null,
  sent_at        timestamptz,
  status         text not null default 'pending' check (status in (
                    'pending',
                    'sent',
                    'cancelled',
                    'failed'
                  )),
  payload        jsonb not null default '{}'::jsonb,
  last_error     text,
  created_at     timestamptz not null default now()
);

create index if not exists email_drips_due_idx
  on public.email_drips (status, scheduled_for);

create index if not exists email_drips_email_idx
  on public.email_drips (email);

create index if not exists email_drips_email_campaign_idx
  on public.email_drips (email, campaign);

alter table public.email_drips enable row level security;

drop policy if exists email_drips_service_all on public.email_drips;
create policy email_drips_service_all
  on public.email_drips
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists email_drips_owner_select on public.email_drips;
create policy email_drips_owner_select
  on public.email_drips
  for select
  using (auth.uid() = user_id);


-- nps_responses — create a superset shape so it works whether the table
-- pre-existed (from the in-app widget) or not. Legacy widget uses
-- user_email/context; the D30 email flow uses email/token/completed_at.
create table if not exists public.nps_responses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid,
  email         text,
  user_email    text,
  score         int check (score is null or (score between 0 and 10)),
  comment       text,
  context       text,
  token         text unique,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- Backfill missing columns on pre-existing tables.
alter table public.nps_responses add column if not exists user_id uuid;
alter table public.nps_responses add column if not exists email text;
alter table public.nps_responses add column if not exists user_email text;
alter table public.nps_responses add column if not exists comment text;
alter table public.nps_responses add column if not exists context text;
alter table public.nps_responses add column if not exists token text;
alter table public.nps_responses add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'nps_responses_token_key'
  ) then
    begin
      create unique index nps_responses_token_key
        on public.nps_responses (token) where token is not null;
    exception when others then null;
    end;
  end if;
end$$;

create index if not exists nps_responses_email_idx
  on public.nps_responses (email);

alter table public.nps_responses enable row level security;

drop policy if exists nps_responses_service_all on public.nps_responses;
create policy nps_responses_service_all
  on public.nps_responses
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists nps_responses_owner_select on public.nps_responses;
create policy nps_responses_owner_select
  on public.nps_responses
  for select
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
