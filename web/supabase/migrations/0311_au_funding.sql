-- 0311_au_funding.sql
-- ---------------------------------------------------------------------------
-- G11 Money Finder (T0239, sprint S2): au_grants · au_programs ·
-- funding_reports · project_grant_profiles.
--
-- Why
--   The "Do you need money?" flow (docs/plans/money-finder-2026-09-10.md §4b)
--   needs a queryable catalogue of Australian grants / tax incentives and of
--   accelerator / incubator / angel programs in all 8 capitals, plus a place
--   to persist the A$3 Trust BizReport-style funding report and the numeric
--   founder profile that feeds estimateRdti() / evaluateEsic().
--
--   Postgres, not runtime JSON: the self-upgrade loop runs `git reset --hard`
--   nightly (web/scripts/self-upgrade-agent.sh), so cron / admin writes to a
--   tracked JSON file are lost within 24h. The directory pages need filters +
--   last_verified_at ordering, and admin review edits (/admin/funding) need
--   RLS-backed rows rather than fs writes (admin/accelerators/page.tsx hard-
--   codes an fs path — do not copy that pattern).
--
--   Enums are text + CHECK lists mirroring §5d of the plan so the seed files
--   (web/content/data/*-au.seed.json) load without a cast layer. Free-text
--   columns that the research left unnormalised (co_contribution,
--   application_window, equity_pct, cost_to_founder) stay unchecked on
--   purpose — the refresh cron (G11-P7) normalises them later.
--
--   Number: 0308 was the number in the plan; 0309 / 0310 were claimed by
--   G12 plan-row syncs, so this claims 0311.
--
-- Rows
--   Seeded by `node scripts/seed-au-funding.mjs` (idempotent upsert on id;
--   56 grants incl. the `data-sources-registry` row with
--   exclude_from_matching=true, 199 programs). Re-run after every seed edit.
--
-- Rollback
--   drop table if exists project_grant_profiles;
--   drop table if exists funding_reports;
--   drop table if exists au_programs;
--   drop table if exists au_grants;
--   (public.set_updated_at() is shared with 0304 — leave it in place.)
-- ---------------------------------------------------------------------------

begin;

-- ─── 1. au_grants ────────────────────────────────────────────────────────────
create table if not exists public.au_grants (
  id                    text primary key,
  name                  text not null,
  provider              text,
  level                 text not null
                        check (level in ('federal','state','territory','local','university','private','rdc')),
  state                 text not null default 'national'
                        check (state in ('national','NSW','VIC','QLD','WA','SA','TAS','ACT','NT')),
  funding_type          text not null
                        check (funding_type in (
                          'grant','matched_grant','voucher','rebate',
                          'tax_offset_refundable','tax_offset_nonrefundable','tax_deduction',
                          'loan_concessional','loan_unsecured','equity','co_investment',
                          'accelerator','competition_showcase','advisory_service',
                          'wage_subsidy','procurement_access')),
  amount_min_aud        numeric,
  amount_max_aud        numeric,
  amount_note           text,
  co_contribution       text,
  stage_tags            text[] not null default '{}',
  industry_tags         text[] not null default '{}',
  demographic_tags      text[] not null default '{}',
  eligibility           jsonb  not null default '{}'::jsonb,
  application_window    text,
  opens_at              date,
  closes_at             date,
  lodgement_deadline    text,
  next_round_note       text,
  status                text not null default 'open'
                        check (status in ('open','closed','paused','upcoming')),
  superseded_by         text,
  exclude_from_matching boolean not null default false,
  official_url          text not null,
  source_url            text,
  summary               text,
  how_to_apply          text,
  evidence_needed       text[] not null default '{}',
  last_verified_at      date,
  verified_by           text not null default 'seed'
                        check (verified_by in ('seed','cron','agent','human')),
  status_confidence     text not null default 'medium'
                        check (status_confidence in ('high','medium','low')),
  sources               jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists au_grants_state_status_idx on public.au_grants (state, status);
create index if not exists au_grants_confidence_idx  on public.au_grants (status_confidence, last_verified_at);

comment on table public.au_grants is
  'AU grants / tax incentives / vouchers catalogue for the Money Finder (G11 §4b). Seeded from content/data/grants-au.seed.json; refreshed by the G11-P7 cron; reviewed at /admin/funding. exclude_from_matching=true rows (e.g. data-sources-registry) never surface to founders.';

alter table public.au_grants enable row level security;

drop policy if exists au_grants_public_read on public.au_grants;
create policy au_grants_public_read on public.au_grants
  for select using (true);

drop policy if exists au_grants_service_write on public.au_grants;
create policy au_grants_service_write on public.au_grants
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 2. au_programs ──────────────────────────────────────────────────────────
create table if not exists public.au_programs (
  id                  text primary key,
  name                text not null,
  operator            text,
  program_type        text not null
                      check (program_type in (
                        'accelerator','incubator','pre_accelerator','community','competition',
                        'corporate','university','government','event','angel_group','vc',
                        'rd_advance_loan','advisory')),
  city                text not null,
  -- Derived (capitalForCity in src/lib/funding/seed-map.ts): Gold Coast /
  -- Sunshine Coast / Regional QLD → Brisbane, Wollongong → Sydney, Geelong →
  -- Melbourne, Launceston → Hobart, Remote → Remote. Drives
  -- /funding/programs/[city] (G11-5).
  capital             text not null
                      check (capital in ('Sydney','Melbourne','Brisbane','Perth','Adelaide','Canberra','Hobart','Darwin','Remote')),
  state               text not null default 'national'
                      check (state in ('national','NSW','VIC','QLD','WA','SA','TAS','ACT','NT')),
  venue               text,
  stage_tags          text[] not null default '{}',
  industry_tags       text[] not null default '{}',
  demographic_tags    text[] not null default '{}',
  length_weeks        integer,
  intake_months       integer[] not null default '{}',
  applications_open   text,
  applications_close  text,
  next_cohort_start   text,
  benefits            text[] not null default '{}',
  funding_aud         numeric,
  equity_pct          text,
  cost_to_founder     text,
  eligibility         jsonb not null default '{}'::jsonb,
  status              text not null default 'open'
                      check (status in ('open','closed','paused','upcoming')),
  official_url        text not null,
  summary             text,
  last_verified_at    date,
  verified_by         text not null default 'seed'
                      check (verified_by in ('seed','cron','agent','human')),
  status_confidence   text not null default 'medium'
                      check (status_confidence in ('high','medium','low')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists au_programs_capital_status_idx on public.au_programs (capital, status);
create index if not exists au_programs_confidence_idx     on public.au_programs (status_confidence, last_verified_at);

comment on table public.au_programs is
  'AU accelerators / incubators / angel groups / events per capital for the Money Finder (G11 §4b). Seeded from content/data/programs-au.seed.json; capital is derived from city so one page per capital groups its satellites.';

alter table public.au_programs enable row level security;

drop policy if exists au_programs_public_read on public.au_programs;
create policy au_programs_public_read on public.au_programs
  for select using (true);

drop policy if exists au_programs_service_write on public.au_programs;
create policy au_programs_service_write on public.au_programs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 3. funding_reports ──────────────────────────────────────────────────────
create table if not exists public.funding_reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.app_users(id) on delete set null,
  guest_email       text,
  project_id        uuid references public.projects(id) on delete set null,
  intake            jsonb not null default '{}'::jsonb,
  grant_matches     jsonb not null default '[]'::jsonb,
  program_matches   jsonb not null default '[]'::jsonb,
  timeline          jsonb not null default '[]'::jsonb,
  narrative_md      text,
  credits_cost      numeric not null default 0,
  paid_via          text check (paid_via in ('one_off','credits','plan')),
  stripe_session_id text unique,
  status            text not null default 'pending',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists funding_reports_user_idx    on public.funding_reports (user_id, created_at desc);
create index if not exists funding_reports_project_idx on public.funding_reports (project_id);

comment on table public.funding_reports is
  'One row per generated Money Finder report (guest or member). intake mirrors project_grant_profiles for guests; stripe_session_id dedupes the A$3 one-off webhook.';

alter table public.funding_reports enable row level security;

drop policy if exists funding_reports_owner_read on public.funding_reports;
create policy funding_reports_owner_read on public.funding_reports
  for select using (user_id = auth.uid());

drop policy if exists funding_reports_service_all on public.funding_reports;
create policy funding_reports_service_all on public.funding_reports
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 4. project_grant_profiles ───────────────────────────────────────────────
-- 1:1 with projects. Numeric A$ figures (not bands) because estimateRdti() /
-- evaluateEsic() in src/lib take money, not buckets.
create table if not exists public.project_grant_profiles (
  project_id               uuid primary key references public.projects(id) on delete cascade,
  state                    text check (state is null or state in ('NSW','VIC','QLD','WA','SA','TAS','ACT','NT')),
  city                     text,
  abn                      text,
  acn                      text,
  entity_type              text check (entity_type is null or entity_type in ('pty_ltd','sole_trader','trust','partnership')),
  incorporated_at          date,
  turnover_aud             numeric,
  prior_year_expenses_aud  numeric,
  prior_year_income_aud    numeric,
  rd_spend_aud             numeric,
  headcount                integer,
  founder_demographics     text[] not null default '{}',
  university_affiliations  text[] not null default '{}',
  export_intent            boolean not null default false,
  listed                   boolean not null default false,
  prior_raise_aud          numeric,
  updated_at               timestamptz not null default now()
);

comment on table public.project_grant_profiles is
  'Founder-entered eligibility facts for grant matching (G11 §4b). 1:1 with projects; owner-only via projects.user_id.';

alter table public.project_grant_profiles enable row level security;

drop policy if exists project_grant_profiles_owner_select on public.project_grant_profiles;
create policy project_grant_profiles_owner_select on public.project_grant_profiles
  for select using (
    exists (select 1 from public.projects p
             where p.id = project_grant_profiles.project_id and p.user_id = auth.uid())
  );

drop policy if exists project_grant_profiles_owner_insert on public.project_grant_profiles;
create policy project_grant_profiles_owner_insert on public.project_grant_profiles
  for insert with check (
    exists (select 1 from public.projects p
             where p.id = project_grant_profiles.project_id and p.user_id = auth.uid())
  );

drop policy if exists project_grant_profiles_owner_update on public.project_grant_profiles;
create policy project_grant_profiles_owner_update on public.project_grant_profiles
  for update using (
    exists (select 1 from public.projects p
             where p.id = project_grant_profiles.project_id and p.user_id = auth.uid())
  );

drop policy if exists project_grant_profiles_service_all on public.project_grant_profiles;
create policy project_grant_profiles_service_all on public.project_grant_profiles
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 5. updated_at touch triggers (shared helper from 0304) ──────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'au_grants','au_programs','funding_reports','project_grant_profiles'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I;', t, t);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
