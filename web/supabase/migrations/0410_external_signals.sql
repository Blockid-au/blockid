-- 0410_external_signals.sql — G14-S40 open Australian external signals.
--
-- Spec: docs/plans/g14-investor-feedback-2026-09-16.md §4 row S40 (goal
-- doc numbered it 0406; 0406–0409 were taken by feedback letters /
-- evidence review / S37 / S38, so S40 ships as 0410).
--
-- Judge asks answered: "what historical / external data sits behind the
-- score?" and "cohort percentiles need N ≥ 20". Three OPEN Australian
-- registers are allow-listed for bulk ingest; three commercial reports are
-- recorded as `cite_only` so the licence gate in
-- web/scripts/external-signals/ingest.mjs refuses to ingest them.
--
-- 1. public.external_sources — the allow-list + licence register. One row
--    per source; `licence` + `attribution_text` are what /methodology
--    "Data sources" prints VERBATIM. `status`:
--      active    → the ingest may run (ABR bulk, GrantConnect awards, R&DTI)
--      cite_only → never bulk-ingested (Cut Through Venture, Startup Muster,
--                  ACS Digital Pulse) — reports may cite a figure with a link
--      disabled  → paused by an admin
--    Seeded from web/src/lib/signals/external-sources.ts (the code
--    catalogue; a colocated test pins the two in sync). ON CONFLICT updates
--    the descriptive columns only — last_fetched_at / row_count / status
--    stay whatever the ingest / admin last wrote.
--
-- 2. public.external_signals — one row per (source, entity, signal, as_of,
--    value). `content_hash` = sha256(source_id|abn|signal_type|as_of|value)
--    is the dedupe key (unique). `match_confidence`: high = matched on ABN,
--    low = name-only match. `value` is the register's own fields (jsonb);
--    the app never stores a derived dollar figure here.
--
-- 3. public.projects.abn — the S36 ABR route (POST /api/verification/abr)
--    verified an ABN but never persisted it; the allow-set for the ABR
--    bulk extract (projects ∪ public index ∪ --abn-file) and the
--    v_project_external_signals join both need it. Nullable, 11 digits
--    when set (CHECK, NOT VALID-free because the column is new).
--
-- 4. public.v_project_external_signals — projects ⋈ external_signals on
--    ABN. The view is owner-executed (like v_au_comparable_raises_verified)
--    and filters on auth.uid() itself, so an authenticated founder sees
--    only rows for projects they own; the service role sees everything.
--
-- RLS: both base tables service-role only. No app_users FK anywhere
-- (reference data; the erasure map pins every app_users FK).
--
-- Idempotent (IF NOT EXISTS / OR REPLACE / DO-guarded constraints, seed via
-- ON CONFLICT). NOT auto-applied on deploy — run
--   scripts/db/apply-migration.sh web/supabase/migrations/0410_external_signals.sql
-- before deploying S40, then the first ingest (docs/ops/data-sources.md).
--
-- Rollback
--   drop view if exists public.v_project_external_signals;
--   drop table if exists public.external_signals;
--   drop table if exists public.external_sources;
--   alter table public.projects drop column if exists abn;
-- ---------------------------------------------------------------------------

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. external_sources ────────────────────────────────────────────────────
create table if not exists public.external_sources (
  id               text primary key,
  name             text not null,
  url              text not null,
  licence          text not null,
  attribution_text text not null,
  cadence          text,
  last_fetched_at  timestamptz,
  row_count        integer not null default 0,
  status           text not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.external_sources
  add column if not exists cadence         text,
  add column if not exists last_fetched_at timestamptz,
  add column if not exists row_count       integer not null default 0,
  add column if not exists status          text not null default 'active',
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists updated_at      timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.external_sources'::regclass and conname = 'external_sources_status_check'
  ) then
    alter table public.external_sources
      add constraint external_sources_status_check
      check (status in ('active', 'cite_only', 'disabled'));
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists external_sources_touch on public.external_sources;
create trigger external_sources_touch
  before update on public.external_sources
  for each row execute function public.set_updated_at();

comment on table public.external_sources is
  'G14-S40 (0410): allow-list + licence register for open AU data. status active = bulk ingest allowed; cite_only = never ingested (reports may cite with a link); disabled = paused. licence + attribution_text are printed verbatim on /methodology.';

-- Seed — mirrors EXTERNAL_SOURCE_CATALOG in web/src/lib/signals/external-sources.ts.
insert into public.external_sources (id, name, url, licence, attribution_text, cadence, status)
values
  ('abr-bulk',
   'ABN Bulk Extract (Australian Business Register)',
   'https://data.gov.au/data/dataset/abn-bulk-extract',
   'CC BY 3.0 AU',
   'Contains ABN Bulk Extract data © Commonwealth of Australia (Australian Business Register, via data.gov.au), licensed under Creative Commons Attribution 3.0 Australia.',
   'weekly',
   'active'),
  ('business-gov-grants',
   'Australian Government grant awards (GrantConnect — business.gov.au programs)',
   'https://www.grants.gov.au/Ga/List',
   'CC BY 3.0 AU',
   'Grant award data © Commonwealth of Australia (Department of Finance, GrantConnect grants.gov.au), licensed under Creative Commons Attribution 3.0 Australia.',
   'weekly',
   'active'),
  ('rdti-transparency',
   'R&D Tax Incentive transparency report (ATO)',
   'https://data.gov.au/data/dataset/research-and-development-tax-incentive',
   'CC BY 2.5 AU',
   'Research and Development Tax Incentive entity data © Commonwealth of Australia (Australian Taxation Office, via data.gov.au), licensed under Creative Commons Attribution 2.5 Australia.',
   'annual',
   'active'),
  ('cut-through-venture',
   'Cut Through Venture — State of Australian Startup Funding',
   'https://www.cutthroughventure.com/',
   'All rights reserved (cite only)',
   'Figures cited from the State of Australian Startup Funding report © Cut Through Venture / Folklore Ventures. Not redistributed; each citation links to the published report.',
   'annual',
   'cite_only'),
  ('startup-muster',
   'Startup Muster annual report',
   'https://www.startupmuster.com/',
   'All rights reserved (cite only)',
   'Figures cited from the Startup Muster annual report © Startup Muster. Not redistributed; each citation links to the published report.',
   'annual',
   'cite_only'),
  ('acs-digital-pulse',
   'ACS Australia''s Digital Pulse',
   'https://www.acs.org.au/insightsandpublications/reports-publications/digital-pulse.html',
   'All rights reserved (cite only)',
   'Figures cited from Australia''s Digital Pulse © Australian Computer Society (with Deloitte Access Economics). Not redistributed; each citation links to the published report.',
   'annual',
   'cite_only')
on conflict (id) do update
  set name             = excluded.name,
      url              = excluded.url,
      licence          = excluded.licence,
      attribution_text = excluded.attribution_text,
      cadence          = excluded.cadence;

-- ─── 2. external_signals ────────────────────────────────────────────────────
create table if not exists public.external_signals (
  id               uuid primary key default gen_random_uuid(),
  source_id        text not null references public.external_sources(id),
  entity_abn       text,
  entity_acn       text,
  entity_name      text,
  signal_type      text not null,
  value            jsonb not null,
  as_of            date not null,
  fetched_at       timestamptz not null default now(),
  source_url       text,
  content_hash     text not null unique,
  match_confidence text not null default 'high'
);
alter table public.external_signals
  add column if not exists entity_acn       text,
  add column if not exists entity_name      text,
  add column if not exists fetched_at       timestamptz not null default now(),
  add column if not exists source_url       text,
  add column if not exists match_confidence text not null default 'high';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.external_signals'::regclass and conname = 'external_signals_match_confidence_check'
  ) then
    alter table public.external_signals
      add constraint external_signals_match_confidence_check
      check (match_confidence in ('high', 'low'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.external_signals'::regclass and conname = 'external_signals_abn_digits_check'
  ) then
    alter table public.external_signals
      add constraint external_signals_abn_digits_check
      check (entity_abn is null or entity_abn ~ '^[0-9]{11}$');
  end if;
end $$;

create index if not exists external_signals_abn_idx
  on public.external_signals (entity_abn);
create index if not exists external_signals_type_asof_idx
  on public.external_signals (signal_type, as_of desc);
create index if not exists external_signals_source_idx
  on public.external_signals (source_id);

comment on table public.external_signals is
  'G14-S40 (0410): register-derived signals (abr_entity / grant_award / rdti_registration) keyed by ABN. content_hash = sha256(source_id|abn|signal_type|as_of|value) dedupes re-ingests. value = the register''s own fields; nothing derived is stored.';

-- ─── 3. projects.abn ────────────────────────────────────────────────────────
alter table public.projects
  add column if not exists abn text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.projects'::regclass and conname = 'projects_abn_digits_check'
  ) then
    alter table public.projects
      add constraint projects_abn_digits_check
      check (abn is null or abn ~ '^[0-9]{11}$');
  end if;
end $$;

create index if not exists projects_abn_idx
  on public.projects (abn)
  where abn is not null;

comment on column public.projects.abn is
  'G14-S40 (0410): the ABN the founder verified through POST /api/verification/abr (11 digits, checksum-valid). Joins v_project_external_signals; feeds the ABR bulk-extract allow-set.';

-- ─── 4. v_project_external_signals ──────────────────────────────────────────
create or replace view public.v_project_external_signals as
  select p.id          as project_id,
         p.user_id     as owner_user_id,
         s.id          as signal_id,
         s.source_id,
         s.entity_abn,
         s.entity_acn,
         s.entity_name,
         s.signal_type,
         s.value,
         s.as_of,
         s.fetched_at,
         s.source_url,
         s.match_confidence
    from public.projects p
    join public.external_signals s on s.entity_abn = p.abn
   where p.abn is not null
     and p.archived_at is null
     and (auth.role() = 'service_role' or p.user_id = auth.uid());

comment on view public.v_project_external_signals is
  'G14-S40 (0410): external_signals joined to projects on ABN. Owner-executed; filters on auth.uid() so an authenticated founder reads only their own projects'' rows.';

-- ─── 5. RLS + grants ────────────────────────────────────────────────────────
alter table public.external_sources enable row level security;
alter table public.external_signals enable row level security;

drop policy if exists external_sources_service_all on public.external_sources;
create policy external_sources_service_all on public.external_sources
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists external_signals_service_all on public.external_signals;
create policy external_signals_service_all on public.external_signals
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

revoke all on public.external_sources from anon, authenticated;
revoke all on public.external_signals from anon, authenticated;
grant select, insert, update, delete on public.external_sources to service_role;
grant select, insert, update, delete on public.external_signals to service_role;
grant select on public.v_project_external_signals to authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
