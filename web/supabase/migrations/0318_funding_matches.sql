-- 0318_funding_matches.sql
-- ---------------------------------------------------------------------------
-- Money Radar (T0245, plan docs/plans/money-finder-2026-09-10.md §4h / §4i D-1).
--
--   1. funding_matches      — one row per (user, project, grant|program) the
--                             weekly sweep matched. `first_seen_at` drives
--                             "N new matches", `closes_at` drives the
--                             T-30/T-14/T-3 deadline alerts, `last_notified`
--                             records which alerts already fired so every
--                             alert is exactly-once
--                             (e.g. {"t30":"2026-09-10","radar_events":[…]}).
--   2. email_preferences    — `money_radar` category (default TRUE, same
--                             pattern as digest_weekly / package_progress).
--   3. app_users            — `calendar_token` for the per-user ICS feed
--                             GET /api/funding/calendar.ics?token=…
--
-- Idempotent. Apply with:
--   docker exec -i supabase-db psql -U postgres -d postgres < 0318_funding_matches.sql
-- (the trailing NOTIFY reloads PostgREST's schema cache).
-- ---------------------------------------------------------------------------

begin;

-- ─── 1. funding_matches ──────────────────────────────────────────────────────
create table if not exists public.funding_matches (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.app_users(id) on delete cascade,
  project_id       uuid references public.projects(id) on delete cascade,
  ref_kind         text not null check (ref_kind in ('grant','program')),
  ref_id           text not null,
  score            integer not null default 0,
  status_at_match  text not null default 'open',
  closes_at        date,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  last_notified    jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- (user, project, ref) is the identity. project_id may be NULL for founders
-- whose only profile is the intake on a guest/one-off report, and a plain
-- UNIQUE constraint treats two NULL project rows as distinct. `project_key`
-- coalesces NULL to a fixed sentinel so the constraint holds AND stays a
-- column list PostgREST can target with `on_conflict=`.
alter table public.funding_matches
  add column if not exists project_key uuid
    generated always as (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'funding_matches_identity_key'
       and conrelid = 'public.funding_matches'::regclass
  ) then
    alter table public.funding_matches
      add constraint funding_matches_identity_key unique (user_id, project_key, ref_kind, ref_id);
  end if;
end;
$$;

create index if not exists funding_matches_user_idx
  on public.funding_matches (user_id, last_seen_at desc);
create index if not exists funding_matches_closes_idx
  on public.funding_matches (closes_at)
  where closes_at is not null;
-- T0246 (radar drips) polls rows whose last_notified carries pending_email.
create index if not exists funding_matches_pending_email_idx
  on public.funding_matches (user_id)
  where last_notified ? 'pending_email';

comment on table public.funding_matches is
  'Money Radar: grants/programs matched to a founder by the weekly money-radar-sweep. last_notified = {"t30":"YYYY-MM-DD","t14":…,"t3":…,"status_changed":"closed","radar_events":[…],"pending_email":[…]}.';
comment on column public.funding_matches.status_at_match is
  'Effective status (open|upcoming|closed|paused) seen at the last sweep; a flip to closed/paused raises status_changed, upcoming→open raises new_round_opened.';
comment on column public.funding_matches.closes_at is
  'Grant closes_at, or the program''s next dated application close / event date. NULL for rolling rows (no deadline alerts).';

alter table public.funding_matches enable row level security;

drop policy if exists funding_matches_owner_select on public.funding_matches;
create policy funding_matches_owner_select on public.funding_matches
  for select using (user_id = auth.uid());

drop policy if exists funding_matches_service_all on public.funding_matches;
create policy funding_matches_service_all on public.funding_matches
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- updated_at touch (shared helper from 0304 / 0311).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists funding_matches_set_updated_at on public.funding_matches;
create trigger funding_matches_set_updated_at
  before update on public.funding_matches
  for each row execute function public.set_updated_at();

-- ─── 2. email_preferences.money_radar ────────────────────────────────────────
alter table public.email_preferences
  add column if not exists money_radar boolean not null default true;

comment on column public.email_preferences.money_radar is
  'Money Radar emails — grant deadlines, program intakes, new matches (G11 §4h). In-app notifications are unaffected by this toggle.';

-- ─── 3. app_users.calendar_token ─────────────────────────────────────────────
alter table public.app_users
  add column if not exists calendar_token text;

create unique index if not exists app_users_calendar_token_idx
  on public.app_users (calendar_token)
  where calendar_token is not null;

comment on column public.app_users.calendar_token is
  'Per-user secret for the ICS subscription feed (/api/funding/calendar.ics?token=). Minted lazily by GET /api/funding/calendar-token.';

commit;

notify pgrst, 'reload schema';
