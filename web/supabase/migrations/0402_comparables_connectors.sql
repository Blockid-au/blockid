-- 0402_comparables_connectors.sql — G13-W5-R5 (S-R5) comparables table +
-- evidence connectors.
--
-- Spec: docs/plans/investor-clarity-2026-09-15/12-product-ai-tbr-v2.md
-- §C.7 (evidence connectors), §F "S-R5" ("Migration: au_comparable_raises
-- (+ verified view feeding comparables.n), founder_signals,
-- ga4_signal_snapshots columns").
--
-- 1. public.au_comparable_raises — the AU comparables the valuation chapter
--    cites. Seeded from the 32 rows of src/lib/data/au-comparables.ts (the
--    plan says "33"; the code table has 32) as status='verified'. The weekly
--    ingest (scripts/comparables/ingest-public-roundups.mjs via
--    /api/cron/comparables-ingest) inserts allow-listed public roundup rows
--    as status='pending'; an admin flips them on /admin/comparables.
--    v_au_comparable_raises_verified is what src/lib/valuation/
--    comparables-repo.ts reads for comparables.n / withMultiplesN; the repo
--    falls back to the static 32 while the view is empty (rollback path).
--    Dedupe key = (name_key, round_date) — name_key is a generated,
--    whitespace-collapsed lower-case name so "Canva " and "canva" collide.
--    verified_by is free text (admin email / 'seed'), NOT an app_users FK —
--    the erasure map (src/lib/privacy/erasure-map.ts) pins every app_users
--    FK and this is reference data, not user data.
--
-- 2. public.founder_signals — parsed LinkedIn "Save to PDF" export / pasted
--    text / profile URL → FTV inputs (years in domain, prior companies,
--    exits, team size on page). project_id → projects ON DELETE CASCADE is
--    the ONLY foreign key (no app_users FK; project erasure cascades). No
--    raw PDF text is stored — parsed fields only (data principle: the
--    startup owns its data; we keep what the report needs).
--
-- 3b. svi_snapshots.report_email_queued_at — the report-email queue stamp
--    (W4-review follow-up b: the PDF/PNG render leaves the SSE request).
--
-- 3c. public.report_chapter_cache — §C.8 chapter-level cache keyed
--    (project, dim, evidence hash, pipeline version); project FK cascades.
--
-- 3. public.ga4_signal_snapshots — dated GA4 pulls (90-day sessions,
--    conversions, returning share, top channels, engagement) from the last
--    sync, so TRE/MPC can draw an AARRR funnel + channel mix with real
--    numbers. svi_signals keeps the flat "last value" keys; this table keeps
--    history. Created here (the spec says "columns" — the table did not
--    exist), every column re-asserted with ADD COLUMN IF NOT EXISTS.
--    user_id is a plain uuid (no FK, same reason as above); project_id →
--    projects CASCADE.
--
-- RLS: service-role ALL on every table; founder_signals and
-- ga4_signal_snapshots additionally let the project owner SELECT their own
-- rows (projects.user_id = auth.uid()). au_comparable_raises is reference
-- data: the verified view is readable by authenticated users, the base
-- table is service-role only (pending rows never leak).
--
-- Idempotent (IF NOT EXISTS / OR REPLACE / DO-guarded constraints, seed via
-- ON CONFLICT DO NOTHING). NOT auto-applied on deploy — run
--   scripts/db/apply-migration.sh web/supabase/migrations/0402_comparables_connectors.sql
-- BEFORE deploying the release that ships S-R5, then add the crontab line
-- from docs/ops/crontab-setup.md (comparables-ingest, weekly).
--
-- Rollback
--   drop view if exists public.v_au_comparable_raises_verified;
--   drop table if exists public.au_comparable_raises;
--   drop table if exists public.founder_signals;
--   drop table if exists public.ga4_signal_snapshots;
--   drop table if exists public.report_chapter_cache;
--   alter table public.svi_snapshots drop column if exists report_email_queued_at;
-- ---------------------------------------------------------------------------

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- shared updated_at helper (same body as 0304/0311/0314/0392/0393/0394)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── 1. au_comparable_raises ────────────────────────────────────────────────
create table if not exists public.au_comparable_raises (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  name_key        text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  sector          text not null,
  stage           text not null,
  round_date      date not null,
  round_label     text,
  amount_aud      numeric,
  post_money_aud  numeric,
  arr_aud         numeric,
  arr_multiple    numeric,
  ebitda_multiple numeric,
  founded_year    integer,
  notable         boolean not null default false,
  note            text,
  source_name     text,
  source_url      text,
  source_date     date,
  source_excerpt  text,
  status          text not null default 'pending',
  verified_by     text,
  verified_at     timestamptz,
  review_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.au_comparable_raises
  add column if not exists round_label     text,
  add column if not exists amount_aud      numeric,
  add column if not exists post_money_aud  numeric,
  add column if not exists arr_aud         numeric,
  add column if not exists arr_multiple    numeric,
  add column if not exists ebitda_multiple numeric,
  add column if not exists founded_year    integer,
  add column if not exists notable         boolean not null default false,
  add column if not exists note            text,
  add column if not exists source_name     text,
  add column if not exists source_url      text,
  add column if not exists source_date     date,
  add column if not exists source_excerpt  text,
  add column if not exists verified_by     text,
  add column if not exists verified_at     timestamptz,
  add column if not exists review_note     text,
  add column if not exists updated_at      timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.au_comparable_raises'::regclass and conname = 'au_comparable_raises_status_check'
  ) then
    alter table public.au_comparable_raises
      add constraint au_comparable_raises_status_check
      check (status in ('pending', 'verified', 'rejected'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.au_comparable_raises'::regclass and conname = 'au_comparable_raises_stage_check'
  ) then
    alter table public.au_comparable_raises
      add constraint au_comparable_raises_stage_check
      check (stage in ('pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'growth', 'unicorn'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.au_comparable_raises'::regclass and conname = 'au_comparable_raises_amounts_check'
  ) then
    alter table public.au_comparable_raises
      add constraint au_comparable_raises_amounts_check
      check (
        (amount_aud is null or amount_aud >= 0)
        and (post_money_aud is null or post_money_aud >= 0)
        and (arr_aud is null or arr_aud >= 0)
        and (arr_multiple is null or arr_multiple >= 0)
      );
  end if;
end $$;

-- Dedupe rule for the ingest: one row per (normalised name, round date).
create unique index if not exists au_comparable_raises_name_round_key
  on public.au_comparable_raises (name_key, round_date);
create index if not exists au_comparable_raises_status_idx
  on public.au_comparable_raises (status, created_at desc);
create index if not exists au_comparable_raises_sector_stage_idx
  on public.au_comparable_raises (sector, stage)
  where status = 'verified';

drop trigger if exists au_comparable_raises_touch on public.au_comparable_raises;
create trigger au_comparable_raises_touch
  before update on public.au_comparable_raises
  for each row execute function public.set_updated_at();

comment on table public.au_comparable_raises is
  'G13 S-R5 (0402): AU comparable raises behind the valuation chapter. status pending (ingest) → verified (admin) | rejected. Dedupe (name_key, round_date). verified_by is text, not an app_users FK.';
comment on column public.au_comparable_raises.arr_multiple is
  'Disclosed (or admin-derived post_money_aud / arr_aud) valuation ÷ ARR at the raise. NULL = not disclosed; only rows with a positive value count toward "with disclosed multiples".';

-- The view every reader goes through: verified rows only.
create or replace view public.v_au_comparable_raises_verified as
  select id, name, sector, stage, round_date, round_label, amount_aud, post_money_aud, arr_aud,
         arr_multiple, ebitda_multiple, founded_year, notable, note,
         source_name, source_url, source_date, verified_at, created_at, updated_at
    from public.au_comparable_raises
   where status = 'verified';

comment on view public.v_au_comparable_raises_verified is
  'G13 S-R5 (0402): verified AU comparable raises — feeds ValuationChapter.comparables.n / withMultiplesN via src/lib/valuation/comparables-repo.ts. Pending / rejected rows never appear here.';

-- Seed: the 32 code-table rows (src/lib/data/au-comparables.ts), verified.
-- round_date = the year named in the note (else founded_year) on 01-01;
-- amount / post-money only where the note states them.
insert into public.au_comparable_raises
  (name, sector, stage, round_date, round_label, amount_aud, post_money_aud, arr_multiple, ebitda_multiple, founded_year, notable, note)
values
  ('Canva', 'SaaS', 'unicorn', '2024-01-01', null, null, 49000000000, 40, null, 2013, true, 'AU''s most valuable startup; A$49B valuation (2024), design SaaS.'),
  ('Atlassian', 'SaaS', 'unicorn', '2002-01-01', null, null, null, 20, 45, 2002, true, 'NASDAQ-listed AU SaaS; team collaboration, FY2024 ~US$4.4B ARR.'),
  ('Afterpay', 'FinTech', 'unicorn', '2022-01-01', null, null, null, 28, null, 2014, true, 'BNPL pioneer; acquired by Block (Square) for US$29B in 2022.'),
  ('Airwallex', 'FinTech', 'unicorn', '2024-01-01', null, null, 9600000000, 22, null, 2015, true, 'Global fintech unicorn; A$9.6B valuation (2024), cross-border payments.'),
  ('SafetyCulture', 'SaaS', 'unicorn', '2004-01-01', null, null, 2600000000, 30, null, 2004, true, 'Workplace safety SaaS; ~A$2.6B valuation, 85K+ global customers.'),
  ('Employment Hero', 'SaaS', 'unicorn', '2024-01-01', null, null, 2000000000, 18, null, 2014, true, 'HR/payroll SaaS; A$2B+ valuation (2024), 300K+ businesses.'),
  ('Deputy', 'SaaS', 'unicorn', '2021-01-01', null, null, null, 15, null, 2008, true, 'Workforce management SaaS; unicorn status 2021, US-AU operations.'),
  ('Linktree', 'SaaS', 'unicorn', '2022-01-01', null, null, 1900000000, 25, null, 2016, true, 'Link-in-bio SaaS; A$1.9B valuation (2022), 35M+ users.'),
  ('Splose', 'HealthTech', 'series-b', '2024-01-01', 'Series A', 46000000, 100000000, 12, null, 2018, true, 'Allied health practice management; A$100M+ valuation, A$46M Series A 2024.'),
  ('Operata', 'SaaS', 'series-b', '2024-01-01', 'Series B', 89000000, null, 52, null, 2019, true, 'Contact centre observability; A$89M Series B 2024, ~52x ARR multiple.'),
  ('Rokt', 'MarketPlace', 'series-c', '2012-01-01', null, null, null, 10, null, 2012, true, 'E-commerce marketing platform; US$400M+ valuation.'),
  ('Culture Amp', 'SaaS', 'growth', '2009-01-01', null, null, 1500000000, 14, null, 2009, true, 'Employee experience platform; A$1.5B+ valuation, 6500+ customers.'),
  ('GO1', 'EdTech', 'series-c', '2021-01-01', null, null, null, 8, null, 2015, true, 'Corporate learning platform; US$800M valuation (2021), 3000+ content partners.'),
  ('Brighte', 'FinTech', 'series-c', '2015-01-01', null, null, 900000000, 6, null, 2015, false, 'BNPL for home energy; ~A$900M valuation.'),
  ('PropTrack', 'PropTech', 'growth', '2015-01-01', null, null, null, 9, 18, 2015, false, 'Property data and analytics, subsidiary of REA Group.'),
  ('Block Earner', 'FinTech', 'series-a', '2024-01-01', null, null, 67000000, 15, null, 2021, false, 'Crypto-backed yield products; A$67M valuation (2024).'),
  ('Parachute', 'FinTech', 'series-a', '2024-01-01', 'Series A', 8500000, null, 12, null, 2021, false, 'B2B fintech infrastructure; A$8.5M Series A 2024.'),
  ('Breaker', 'DeepTech', 'series-a', '2020-01-01', 'seed', 9000000, 36000000, 18, null, 2020, false, 'Defence tech, counter-drone; A$36-45M valuation post A$9M seed.'),
  ('Agridigital', 'AgriTech', 'series-a', '2015-01-01', null, null, 15000000, 7, null, 2015, false, 'Grain supply chain platform; A$15M+ valuation.'),
  ('PictureWealth', 'FinTech', 'series-a', '2018-01-01', null, null, null, 9, null, 2018, false, 'Digital wealth management platform.'),
  ('Fluentis', 'HealthTech', 'series-a', '2024-01-01', 'Series A', null, null, 10, null, 2019, false, 'Clinical workflow SaaS; Series A 2024.'),
  ('Aigentsphere', 'SaaS', 'seed', '2024-01-01', 'seed', null, 20000000, 20, null, 2023, false, 'AI agent platform; A$20M valuation at seed (2024).'),
  ('Hachiko', 'SaaS', 'seed', '2022-01-01', 'seed', null, 10000000, 12, null, 2022, false, 'SME operations SaaS; A$10-12M seed valuation.'),
  ('COR', 'FinTech', 'seed', '2024-01-01', 'seed', 8000000, 8000000, 10, null, 2022, false, 'Embedded insurance; A$8M seed valuation 2024.'),
  ('Bazaa', 'MarketPlace', 'seed', '2024-01-01', 'pre-seed', 2600000, null, 8, null, 2022, false, 'Wholesale B2B marketplace; A$2.6M pre-seed 2024.'),
  ('ClimateAI Australia', 'CleanTech', 'seed', '2023-01-01', null, null, null, 10, null, 2020, false, 'Climate risk SaaS for agri/insurance; AU expansion 2023.'),
  ('Moroku', 'FinTech', 'seed', '2015-01-01', null, null, null, 8, null, 2015, false, 'Gamified financial wellness SaaS for banks.'),
  ('Earlywork', 'EdTech', 'pre-seed', '2023-01-01', 'pre-seed', null, null, 10, null, 2022, false, 'Early-career tech talent marketplace; pre-seed 2023.'),
  ('Propel Ventures', 'PropTech', 'pre-seed', '2023-01-01', null, null, null, 8, null, 2023, false, 'Proptech SaaS for property managers.'),
  ('Farmbook', 'AgriTech', 'pre-seed', '2021-01-01', null, null, null, 7, null, 2021, false, 'Farm management software; AU rural market.'),
  ('Medi AI', 'HealthTech', 'pre-seed', '2024-01-01', 'pre-seed', null, null, 12, null, 2023, false, 'AI-assisted clinical notes for GPs; pre-seed 2024.'),
  ('GridEdge', 'CleanTech', 'pre-seed', '2023-01-01', 'pre-seed', null, null, 9, null, 2022, false, 'Grid-edge energy analytics; pre-seed 2023.')
on conflict (name_key, round_date) do nothing;

update public.au_comparable_raises
   set status = 'verified',
       verified_by = coalesce(verified_by, 'seed:au-comparables.ts'),
       verified_at = coalesce(verified_at, now()),
       source_name = coalesce(source_name, 'BlockID code table (au-comparables.ts)'),
       source_date = coalesce(source_date, date '2025-01-01')
 where source_name is null or source_name = 'BlockID code table (au-comparables.ts)';

-- ─── 2. founder_signals ─────────────────────────────────────────────────────
create table if not exists public.founder_signals (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  source             text not null default 'linkedin_text',
  profile_url        text,
  founder_name       text,
  headline           text,
  current_title      text,
  years_experience   numeric,
  years_in_domain    numeric,
  prior_companies    jsonb not null default '[]'::jsonb,
  exits              integer not null default 0,
  team_size_on_page  integer,
  roles              jsonb not null default '[]'::jsonb,
  education          jsonb not null default '[]'::jsonb,
  confidence         numeric not null default 0,
  parsed_at          timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.founder_signals
  add column if not exists profile_url       text,
  add column if not exists founder_name      text,
  add column if not exists headline          text,
  add column if not exists current_title     text,
  add column if not exists years_experience  numeric,
  add column if not exists years_in_domain   numeric,
  add column if not exists prior_companies   jsonb not null default '[]'::jsonb,
  add column if not exists exits             integer not null default 0,
  add column if not exists team_size_on_page integer,
  add column if not exists roles             jsonb not null default '[]'::jsonb,
  add column if not exists education         jsonb not null default '[]'::jsonb,
  add column if not exists confidence        numeric not null default 0,
  add column if not exists parsed_at         timestamptz not null default now(),
  add column if not exists updated_at        timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.founder_signals'::regclass and conname = 'founder_signals_source_check'
  ) then
    alter table public.founder_signals
      add constraint founder_signals_source_check
      check (source in ('linkedin_pdf', 'linkedin_text', 'linkedin_url', 'manual'));
  end if;
end $$;

-- "latest founder signals for this project" is an index walk.
create index if not exists founder_signals_project_parsed_idx
  on public.founder_signals (project_id, parsed_at desc);

drop trigger if exists founder_signals_touch on public.founder_signals;
create trigger founder_signals_touch
  before update on public.founder_signals
  for each row execute function public.set_updated_at();

comment on table public.founder_signals is
  'G13 S-R5 (0402): parsed founder signals (LinkedIn PDF export / pasted text / profile URL) feeding the FTV chapter. Parsed fields only — no raw PDF text. Only FK: project_id → projects CASCADE.';

-- ─── 3. ga4_signal_snapshots ────────────────────────────────────────────────
create table if not exists public.ga4_signal_snapshots (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null,
  project_id             uuid references public.projects(id) on delete cascade,
  property_id            text,
  taken_at               timestamptz not null default now(),
  window_days            integer not null default 90,
  sessions               numeric,
  new_users              numeric,
  returning_users        numeric,
  returning_share        numeric,
  conversions            numeric,
  conversion_rate        numeric,
  engaged_sessions       numeric,
  engagement_rate        numeric,
  avg_session_duration_s numeric,
  top_channels           jsonb not null default '[]'::jsonb,
  funnel                 jsonb not null default '{}'::jsonb,
  source                 text not null default 'sync',
  created_at             timestamptz not null default now()
);
alter table public.ga4_signal_snapshots
  add column if not exists property_id            text,
  add column if not exists window_days            integer not null default 90,
  add column if not exists sessions               numeric,
  add column if not exists new_users              numeric,
  add column if not exists returning_users        numeric,
  add column if not exists returning_share        numeric,
  add column if not exists conversions            numeric,
  add column if not exists conversion_rate        numeric,
  add column if not exists engaged_sessions       numeric,
  add column if not exists engagement_rate        numeric,
  add column if not exists avg_session_duration_s numeric,
  add column if not exists top_channels           jsonb not null default '[]'::jsonb,
  add column if not exists funnel                 jsonb not null default '{}'::jsonb,
  add column if not exists source                 text not null default 'sync';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ga4_signal_snapshots'::regclass and conname = 'ga4_signal_snapshots_source_check'
  ) then
    alter table public.ga4_signal_snapshots
      add constraint ga4_signal_snapshots_source_check
      check (source in ('callback', 'sync', 'resync'));
  end if;
end $$;

create index if not exists ga4_signal_snapshots_scope_taken_idx
  on public.ga4_signal_snapshots (user_id, project_id, taken_at desc);

comment on table public.ga4_signal_snapshots is
  'G13 S-R5 (0402): dated GA4 pulls (90-day window) — sessions, conversions, returning share, top channels, engagement — written on every GA4 sync; TRE/MPC read the latest row for the AARRR funnel + channel mix. user_id has no FK on purpose (erasure map pins app_users FKs); project_id cascades.';

-- ─── 3b. svi_snapshots.report_email_queued_at (W4-review follow-up b) ───────
-- The report email's PDF + PNG render moves out of the SSE request: the
-- pipeline stamps this column, /api/cron/report-email-sweep renders + sends
-- (lib/svi/email-queue.ts). report_email_sent_at (existing) stays the
-- idempotency marker. Before this column exists the pipeline sends inline.
alter table public.svi_snapshots
  add column if not exists report_email_queued_at timestamptz;
create index if not exists svi_snapshots_report_email_queue_idx
  on public.svi_snapshots (report_email_queued_at)
  where report_email_queued_at is not null and report_email_sent_at is null;
comment on column public.svi_snapshots.report_email_queued_at is
  'G13 S-R5 (0402): set by the report pipeline when the founder email is due; cleared / superseded by report_email_sent_at once /api/cron/report-email-sweep has sent it.';

-- ─── 3c. report_chapter_cache (§C.8 chapter-level cache) ────────────────────
-- One row per (project, dimension, evidence hash, pipeline version): the
-- W4 owner chapter written last time. Unchanged evidence → the pipeline
-- serves it without an LLM call (weekly Δ reports ≈ exec + changed
-- chapters). Degraded cards are never stored; rows older than 30 days are
-- ignored by the reader (lib/report-pipeline/chapter-cache.ts). Missing
-- table = warnings only, the report never depends on it.
create table if not exists public.report_chapter_cache (
  project_id       uuid not null references public.projects(id) on delete cascade,
  dim              text not null,
  evidence_hash    text not null,
  pipeline_version text not null,
  chapter          jsonb not null,
  created_at       timestamptz not null default now(),
  primary key (project_id, dim, evidence_hash, pipeline_version)
);
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.report_chapter_cache'::regclass and conname = 'report_chapter_cache_dim_check'
  ) then
    alter table public.report_chapter_cache
      add constraint report_chapter_cache_dim_check
      check (dim in ('tre', 'mpc', 'ftv', 'ptd', 'cgh', 'iri', 'lco', 'svm'));
  end if;
end $$;
create index if not exists report_chapter_cache_created_idx
  on public.report_chapter_cache (created_at desc);
comment on table public.report_chapter_cache is
  'G13 S-R5 (0402, spec §C.8): cached W4 dimension chapters keyed (project, dim, sha1 of the chapter inputs, pipeline version). Service-role only; readers ignore rows older than 30 days.';

-- ─── 4. RLS ─────────────────────────────────────────────────────────────────
alter table public.au_comparable_raises enable row level security;
alter table public.founder_signals      enable row level security;
alter table public.ga4_signal_snapshots enable row level security;
alter table public.report_chapter_cache enable row level security;

drop policy if exists report_chapter_cache_service_all on public.report_chapter_cache;
create policy report_chapter_cache_service_all on public.report_chapter_cache
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists au_comparable_raises_service_all on public.au_comparable_raises;
create policy au_comparable_raises_service_all on public.au_comparable_raises
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists founder_signals_owner_select on public.founder_signals;
create policy founder_signals_owner_select on public.founder_signals
  for select using (
    exists (select 1 from public.projects p where p.id = founder_signals.project_id and p.user_id = auth.uid())
  );
drop policy if exists founder_signals_service_all on public.founder_signals;
create policy founder_signals_service_all on public.founder_signals
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists ga4_signal_snapshots_owner_select on public.ga4_signal_snapshots;
create policy ga4_signal_snapshots_owner_select on public.ga4_signal_snapshots
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.projects p where p.id = ga4_signal_snapshots.project_id and p.user_id = auth.uid())
  );
drop policy if exists ga4_signal_snapshots_service_all on public.ga4_signal_snapshots;
create policy ga4_signal_snapshots_service_all on public.ga4_signal_snapshots
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Grants: base tables service-role only (+ owner SELECT via RLS); the
-- verified view is public reference data for signed-in users (the view is
-- owned by the migration role, so it reads the base table without RLS).
revoke all on public.au_comparable_raises from anon, authenticated;
grant select on public.v_au_comparable_raises_verified to authenticated, service_role;
grant select, insert, update, delete on public.au_comparable_raises to service_role;
grant select on public.founder_signals to authenticated;
grant select, insert, update, delete on public.founder_signals to service_role;
grant select on public.ga4_signal_snapshots to authenticated;
grant select, insert, update, delete on public.ga4_signal_snapshots to service_role;
revoke all on public.report_chapter_cache from anon, authenticated;
grant select, insert, update, delete on public.report_chapter_cache to service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
