-- 0393_investor_mandates_v2.sql
-- ---------------------------------------------------------------------------
-- G13-W3-T2 (S-T2) — Investor mandate v2: the tables behind
-- /workspace/investor/mandate, the nightly `mandate-fit-refresh` cron and
-- the deal-flow join keyed on project_id
-- (docs/plans/investor-clarity-2026-09-15/10-ba-investor-dossier-taxonomy.md
-- §B.7 mandate form, §B.8 FIT_WEIGHTS_V2, §C.1, §D.1 E2.1–E2.5; decision D2
-- in docs/plans/investor-clarity-2026-09-15.md §3).
--
-- CREATE, not ALTER. The BA spec reads "ALTER investor_mandates" because it
-- assumed 20260822_investor_portal_core.sql was live; it is DEFERRED
-- (scripts/db/parity-exceptions.json — 17 tables, no reader, no RLS) and
-- `\d public.investor_mandates` on production returns "Did not find any
-- relation" (checked 2026-09-16). So this file creates the FOUR tables the
-- feature reads with exactly the columns it needs, idempotently, and keeps
-- every statement tolerant of the deferred file having been applied first
-- (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS for every column,
-- DROP NOT NULL guarded in DO blocks). The deferred file stays waived.
--
--   public.investor_organisations         — Firm / Program grouping. A user
--       gets a *personal* org on first mandate save (is_personal = true,
--       owner_user_id = the user; one per user); shared orgs + seat invites
--       ship in S-D3 / E4.5.
--   public.investor_organisation_members  — seats. Personal orgs get one
--       row (the owner, role investment_partner).
--   public.investor_mandates              — the 7-section mandate (§B.7).
--       org_id nullable, owner_user_id nullable, CHECK at least one.
--       Scout: one mandate; Program: many (plan limit read in code).
--       `weights` = per-mandate FIT_WEIGHTS_V2 override (sum 100, validated
--       in src/lib/investors/fit-v2.ts). `discoverable` moves the 0323
--       app_users.investor_discoverable semantics per mandate; the user flag
--       stays the master switch (both must be true for the founder-facing
--       "Investors who match").
--   public.mandate_fit_scores             — (mandate_id, project_id) →
--       score 0–100 + reasons / gaps / blockers / breakdown, written by the
--       nightly cron. Keyed on PROJECT_ID — this is what replaces the
--       email → account_id join deal-flow used to guess with (Gap 4).
--
-- W2 post-ship review follow-ups that belong here (they need the org table):
--   (a) evaluation_assessments: UPDATE policy gains WITH CHECK
--       (assessor_user_id = auth.uid()) so a seat cannot re-home a row;
--       SELECT on the base table is REVOKED from anon / authenticated — the
--       founder reads through v_assessment_founder_view only (re-created as
--       a definer view with the founder predicate inlined; the app itself
--       reads via service role and masks in code).
--   (b) evaluation_assessments.org_id → FK investor_organisations(id) ON
--       DELETE SET NULL + "same-org seat may SELECT" policy (§C.1).
--   (c) startup_taxonomy: the evaluator UPDATE path is split from the
--       founder's and gains WITH CHECK — an evaluator can never write a row
--       that is confirmed (confirmed_at / confirmed_by) or that carries a
--       protected tag (female_founded / first_nations — DQ-4 / DQ-5).
--
-- House rules
--   * Three NEW foreign keys on public.app_users(id) —
--     investor_organisations.owner_user_id, investor_organisation_members.
--     user_id, investor_mandates.owner_user_id (all CASCADE, mode delete).
--     Each has its erasure-map entry (web/src/lib/privacy/erasure-map.ts,
--     132 entries) and fixture row; erase_account() is re-emitted at the
--     bottom of this file from that map (ERASURE_MIGRATION_FILE points here).
--   * Every reader is 42P01-guarded and renders "not migrated" until this
--     file is applied (house pattern, 0314 / 0392 / 0394).
--   * RLS: owner or org member may SELECT; owner (or org member) may write;
--     service-role all. Fit scores are readable by the mandate's owner /
--     org members only — never by founders (the founder direction is
--     computed live from discoverable mandates, no email ever leaves).
--
-- Idempotent. Apply by hand (never on deploy) — BEFORE deploying the
-- release that ships /workspace/investor/mandate v2:
--   scripts/db/apply-migration.sh web/supabase/migrations/0393_investor_mandates_v2.sql
-- then add the crontab line from docs/ops/crontab-setup.md
-- (mandate-fit-refresh, nightly 16:20 UTC).
--
-- Rollback
--   drop table if exists public.mandate_fit_scores;
--   drop table if exists public.investor_mandates;
--   drop table if exists public.investor_organisation_members;
--   alter table public.evaluation_assessments drop constraint if exists evaluation_assessments_org_id_fkey;
--   drop policy if exists evaluation_assessments_org_seat_select on public.evaluation_assessments;
--   drop table if exists public.investor_organisations;
--   (then re-apply 0386 for erase_account() and 0392 §2–3 for the
--   evaluation_assessments policies / grants / view, 0394 §3 for the
--   startup_taxonomy update policy.)
-- ---------------------------------------------------------------------------

BEGIN;

-- ─── 0. shared updated_at helper (same body as 0304/0311/0314/0392/0394) ───
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── 1. investor_organisations ──────────────────────────────────────────────
create table if not exists public.investor_organisations (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null,
  name           text not null,
  kind           text not null default 'angel',
  home_country   text default 'AU',
  owner_user_id  uuid references public.app_users(id) on delete cascade,
  is_personal    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Deferred-file tolerance: every column above, re-asserted.
alter table public.investor_organisations
  add column if not exists owner_user_id uuid references public.app_users(id) on delete cascade,
  add column if not exists is_personal   boolean not null default false,
  add column if not exists home_country  text default 'AU',
  add column if not exists updated_at    timestamptz not null default now();
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_organisations'::regclass and conname = 'investor_organisations_kind_check'
  ) then
    alter table public.investor_organisations
      add constraint investor_organisations_kind_check
      check (kind in ('vc','angel','family_office','cvc','accelerator','government','institutional'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_organisations'::regclass and conname = 'investor_organisations_slug_key'
  ) then
    alter table public.investor_organisations add constraint investor_organisations_slug_key unique (slug);
  end if;
end $$;
-- One personal org per user.
create unique index if not exists investor_organisations_personal_owner_idx
  on public.investor_organisations (owner_user_id)
  where is_personal = true and owner_user_id is not null;
create index if not exists investor_organisations_owner_idx
  on public.investor_organisations (owner_user_id)
  where owner_user_id is not null;

comment on table public.investor_organisations is
  'G13 S-T2 (0393): investor firm / fund / program grouping. is_personal rows are auto-created per user on first mandate save (owner_user_id = the user, one per user); shared orgs + seat invites arrive in S-D3. company_id-style columns from the deferred 20260822 file are NOT used here.';
comment on column public.investor_organisations.owner_user_id is
  'app_users.id of the creator / personal owner (FK, CASCADE; erasure-map mode delete). NULL only for orgs seeded by hand.';

drop trigger if exists investor_organisations_set_updated_at on public.investor_organisations;
create trigger investor_organisations_set_updated_at
  before update on public.investor_organisations
  for each row execute function public.set_updated_at();

-- ─── 2. investor_organisation_members ───────────────────────────────────────
create table if not exists public.investor_organisation_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.investor_organisations(id) on delete cascade,
  user_id     uuid not null references public.app_users(id) on delete cascade,
  role        text not null default 'investment_partner',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
do $$
begin
  -- Deferred-file tolerance: its user_id has no FK; add ours when missing.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_organisation_members'::regclass
       and conname = 'investor_organisation_members_user_id_fkey'
  ) then
    alter table public.investor_organisation_members
      add constraint investor_organisation_members_user_id_fkey
      foreign key (user_id) references public.app_users(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_organisation_members'::regclass
       and conname = 'investor_organisation_members_role_check'
  ) then
    alter table public.investor_organisation_members
      add constraint investor_organisation_members_role_check
      check (role in ('investor_viewer','investor_analyst','investment_manager','investment_partner','ic_member','fund_admin','accelerator_analyst','institutional_admin'));
  end if;
end $$;
create index if not exists investor_organisation_members_user_idx
  on public.investor_organisation_members (user_id);

comment on table public.investor_organisation_members is
  'G13 S-T2 (0393): seats in an investor organisation. Personal orgs carry exactly one row (the owner). user_id FKs app_users (CASCADE; erasure-map mode delete).';

-- ─── 3. investor_mandates (§B.7 — 7 sections) ───────────────────────────────
create table if not exists public.investor_mandates (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid references public.investor_organisations(id) on delete cascade,
  owner_user_id         uuid references public.app_users(id) on delete cascade,
  -- §1 identity
  label                 text not null,
  thesis                text,
  is_default            boolean not null default true,
  discoverable          boolean not null default false,
  is_active             boolean not null default true,
  -- §2 appetite (taxonomy vocab — src/lib/taxonomy/startup-taxonomy.ts)
  sectors_include       text[] not null default '{}',
  sectors_exclude       text[] not null default '{}',
  business_models       text[] not null default '{}',
  customer_types        text[] not null default '{}',
  -- §3 stage & cheque
  stages                text[] not null default '{}',
  cheque_min_aud        numeric(14,2),
  cheque_max_aud        numeric(14,2),
  lead_or_follow        text,
  ownership_target_pct  numeric(5,2),
  followon_reserve_pct  numeric(5,2),
  -- §4 geography (AU states + national / anz / apac / global)
  geographies           text[] not null default '{}',
  -- §5 traction floors
  revenue_min_aud       numeric(14,2),
  growth_min_pct        numeric(7,2),
  min_svi               smallint,
  -- §6 tags & ESG
  tags_include          text[] not null default '{}',
  tags_exclude          text[] not null default '{}',
  esg_constraints       text[] not null default '{}',
  risk_tolerance        text,
  -- §7 weights (Program only) — FIT_WEIGHTS_V2 override, sum 100
  weights               jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- Deferred-file tolerance: the 20260822 shape has org_id NOT NULL and lacks
-- the v2 columns.
alter table public.investor_mandates
  add column if not exists owner_user_id        uuid references public.app_users(id) on delete cascade,
  add column if not exists thesis               text,
  add column if not exists is_default           boolean not null default true,
  add column if not exists discoverable         boolean not null default false,
  add column if not exists is_active            boolean not null default true,
  add column if not exists business_models      text[] not null default '{}',
  add column if not exists customer_types       text[] not null default '{}',
  add column if not exists tags_include         text[] not null default '{}',
  add column if not exists tags_exclude         text[] not null default '{}',
  add column if not exists min_svi              smallint,
  add column if not exists sectors_include      text[] not null default '{}',
  add column if not exists sectors_exclude      text[] not null default '{}',
  add column if not exists stages               text[] not null default '{}',
  add column if not exists geographies          text[] not null default '{}',
  add column if not exists esg_constraints      text[] not null default '{}',
  add column if not exists weights              jsonb not null default '{}'::jsonb,
  add column if not exists updated_at           timestamptz not null default now();
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'investor_mandates'
       and column_name = 'org_id' and is_nullable = 'NO'
  ) then
    alter table public.investor_mandates alter column org_id drop not null;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_mandates'::regclass and conname = 'investor_mandates_owner_or_org_check'
  ) then
    alter table public.investor_mandates
      add constraint investor_mandates_owner_or_org_check
      check (org_id is not null or owner_user_id is not null);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_mandates'::regclass and conname = 'investor_mandates_lead_or_follow_check'
  ) then
    alter table public.investor_mandates
      add constraint investor_mandates_lead_or_follow_check
      check (lead_or_follow is null or lead_or_follow in ('lead','follow','both'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_mandates'::regclass and conname = 'investor_mandates_risk_tolerance_check'
  ) then
    alter table public.investor_mandates
      add constraint investor_mandates_risk_tolerance_check
      check (risk_tolerance is null or risk_tolerance in ('low','medium','high'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_mandates'::regclass and conname = 'investor_mandates_min_svi_check'
  ) then
    alter table public.investor_mandates
      add constraint investor_mandates_min_svi_check
      check (min_svi is null or (min_svi between 0 and 100));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_mandates'::regclass and conname = 'investor_mandates_cheque_range_check'
  ) then
    alter table public.investor_mandates
      add constraint investor_mandates_cheque_range_check
      check (cheque_min_aud is null or cheque_max_aud is null or cheque_min_aud <= cheque_max_aud);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_mandates'::regclass and conname = 'investor_mandates_weights_object_check'
  ) then
    alter table public.investor_mandates
      add constraint investor_mandates_weights_object_check
      check (jsonb_typeof(weights) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_mandates'::regclass and conname = 'investor_mandates_thesis_len_check'
  ) then
    alter table public.investor_mandates
      add constraint investor_mandates_thesis_len_check
      check (thesis is null or char_length(thesis) <= 280);
  end if;
end $$;
create index if not exists investor_mandates_owner_idx
  on public.investor_mandates (owner_user_id, is_default desc, updated_at desc)
  where owner_user_id is not null;
create index if not exists investor_mandates_org_idx
  on public.investor_mandates (org_id)
  where org_id is not null;
-- Nightly cron scan + founder-direction candidates.
create index if not exists investor_mandates_active_idx
  on public.investor_mandates (is_active, discoverable)
  where is_active = true;

comment on table public.investor_mandates is
  'G13 S-T2 (0393): one investment mandate (§B.7, 7 sections). Scout: one per user; Firm / Program: many per org (limit in code from plan usage_limits.mandates). Vocabulary = startup_taxonomy (industries / business models / customer types / canonical stages / AU states + anz/apac/global / tags). weights = FIT_WEIGHTS_V2 override, validated to sum 100 in code. app_users.investor_prefs stays a read-through mirror for ONE release (written only by the mandate API).';
comment on column public.investor_mandates.owner_user_id is
  'app_users.id of the author (FK, CASCADE; erasure-map mode delete). Either this or org_id is set.';
comment on column public.investor_mandates.discoverable is
  'Per-mandate half of the 0323 opt-in: the founder-facing "Investors who match" lists this mandate only when this AND app_users.investor_discoverable are true.';

drop trigger if exists investor_mandates_set_updated_at on public.investor_mandates;
create trigger investor_mandates_set_updated_at
  before update on public.investor_mandates
  for each row execute function public.set_updated_at();

-- ─── 4. mandate_fit_scores — keyed on (mandate_id, project_id) ──────────────
create table if not exists public.mandate_fit_scores (
  id           uuid primary key default gen_random_uuid(),
  mandate_id   uuid not null references public.investor_mandates(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  score        numeric(5,2) not null check (score >= 0 and score <= 100),
  reasons      jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  gaps         jsonb not null default '[]'::jsonb check (jsonb_typeof(gaps) = 'array'),
  blockers     jsonb not null default '[]'::jsonb check (jsonb_typeof(blockers) = 'array'),
  breakdown    jsonb not null default '[]'::jsonb check (jsonb_typeof(breakdown) = 'array'),
  snapshot_id  uuid references public.svi_snapshots(id) on delete set null,
  computed_at  timestamptz not null default now(),
  unique (mandate_id, project_id)
);
-- Deferred-file tolerance: its row is company_id-keyed with UNIQUE(company_id, mandate_id).
alter table public.mandate_fit_scores
  add column if not exists project_id  uuid references public.projects(id) on delete cascade,
  add column if not exists gaps        jsonb not null default '[]'::jsonb,
  add column if not exists blockers    jsonb not null default '[]'::jsonb,
  add column if not exists breakdown   jsonb not null default '[]'::jsonb,
  add column if not exists snapshot_id uuid references public.svi_snapshots(id) on delete set null;
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'mandate_fit_scores'
       and column_name = 'company_id' and is_nullable = 'NO'
  ) then
    alter table public.mandate_fit_scores alter column company_id drop not null;
  end if;
end $$;
create unique index if not exists mandate_fit_scores_mandate_project_key
  on public.mandate_fit_scores (mandate_id, project_id);
-- Deal-flow ranking (one mandate, best first) and the founder-side lookup.
create index if not exists mandate_fit_scores_mandate_score_idx
  on public.mandate_fit_scores (mandate_id, score desc);
create index if not exists mandate_fit_scores_project_idx
  on public.mandate_fit_scores (project_id, score desc);

comment on table public.mandate_fit_scores is
  'G13 S-T2 (0393): nightly FIT_WEIGHTS_V2 result per (mandate, project) — score 0–100, reasons / gaps (strings), blockers (hard gates), breakdown (per-axis points). Written by /api/cron/mandate-fit-refresh; read by deal-flow keyed on project_id (replaces the scores.email → svi_index_snapshots.account_id guess).';

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────
alter table public.investor_organisations        enable row level security;
alter table public.investor_organisation_members enable row level security;
alter table public.investor_mandates             enable row level security;
alter table public.mandate_fit_scores            enable row level security;

-- Helper predicate: is auth.uid() a seat of org?  Inlined below (no SQL
-- function so the deferred file's lack of helpers never matters).

-- investor_organisations: owner or member reads; owner writes.
drop policy if exists investor_organisations_member_select on public.investor_organisations;
create policy investor_organisations_member_select on public.investor_organisations
  for select using (
    owner_user_id = auth.uid()
    or exists (select 1 from public.investor_organisation_members m
                where m.org_id = investor_organisations.id and m.user_id = auth.uid())
  );
drop policy if exists investor_organisations_owner_insert on public.investor_organisations;
create policy investor_organisations_owner_insert on public.investor_organisations
  for insert with check (owner_user_id = auth.uid());
drop policy if exists investor_organisations_owner_update on public.investor_organisations;
create policy investor_organisations_owner_update on public.investor_organisations
  for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists investor_organisations_owner_delete on public.investor_organisations;
create policy investor_organisations_owner_delete on public.investor_organisations
  for delete using (owner_user_id = auth.uid());
drop policy if exists investor_organisations_service_all on public.investor_organisations;
create policy investor_organisations_service_all on public.investor_organisations
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- members: a seat sees its org's seats; the org owner manages seats.
drop policy if exists investor_organisation_members_seat_select on public.investor_organisation_members;
create policy investor_organisation_members_seat_select on public.investor_organisation_members
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.investor_organisation_members me
                where me.org_id = investor_organisation_members.org_id and me.user_id = auth.uid())
  );
drop policy if exists investor_organisation_members_owner_write on public.investor_organisation_members;
create policy investor_organisation_members_owner_write on public.investor_organisation_members
  for all using (
    exists (select 1 from public.investor_organisations o
             where o.id = investor_organisation_members.org_id and o.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from public.investor_organisations o
             where o.id = investor_organisation_members.org_id and o.owner_user_id = auth.uid())
  );
drop policy if exists investor_organisation_members_service_all on public.investor_organisation_members;
create policy investor_organisation_members_service_all on public.investor_organisation_members
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- mandates: owner or org member (§B.7 "RLS: owner or org member").
drop policy if exists investor_mandates_owner_or_member_select on public.investor_mandates;
create policy investor_mandates_owner_or_member_select on public.investor_mandates
  for select using (
    owner_user_id = auth.uid()
    or (org_id is not null and exists (
          select 1 from public.investor_organisation_members m
           where m.org_id = investor_mandates.org_id and m.user_id = auth.uid()))
  );
drop policy if exists investor_mandates_owner_or_member_insert on public.investor_mandates;
create policy investor_mandates_owner_or_member_insert on public.investor_mandates
  for insert with check (
    owner_user_id = auth.uid()
    or (org_id is not null and exists (
          select 1 from public.investor_organisation_members m
           where m.org_id = investor_mandates.org_id and m.user_id = auth.uid()))
  );
drop policy if exists investor_mandates_owner_or_member_update on public.investor_mandates;
create policy investor_mandates_owner_or_member_update on public.investor_mandates
  for update using (
    owner_user_id = auth.uid()
    or (org_id is not null and exists (
          select 1 from public.investor_organisation_members m
           where m.org_id = investor_mandates.org_id and m.user_id = auth.uid()))
  ) with check (
    owner_user_id = auth.uid()
    or (org_id is not null and exists (
          select 1 from public.investor_organisation_members m
           where m.org_id = investor_mandates.org_id and m.user_id = auth.uid()))
  );
drop policy if exists investor_mandates_owner_delete on public.investor_mandates;
create policy investor_mandates_owner_delete on public.investor_mandates
  for delete using (owner_user_id = auth.uid());
drop policy if exists investor_mandates_service_all on public.investor_mandates;
create policy investor_mandates_service_all on public.investor_mandates
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- fit scores: readable through the mandate; written by the cron (service role) only.
drop policy if exists mandate_fit_scores_mandate_select on public.mandate_fit_scores;
create policy mandate_fit_scores_mandate_select on public.mandate_fit_scores
  for select using (
    exists (
      select 1 from public.investor_mandates im
       where im.id = mandate_fit_scores.mandate_id
         and (im.owner_user_id = auth.uid()
              or (im.org_id is not null and exists (
                    select 1 from public.investor_organisation_members m
                     where m.org_id = im.org_id and m.user_id = auth.uid())))
    )
  );
drop policy if exists mandate_fit_scores_service_all on public.mandate_fit_scores;
create policy mandate_fit_scores_service_all on public.mandate_fit_scores
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Founders never read fit tables directly; anon never reads any of them.
revoke all on public.investor_organisations, public.investor_organisation_members,
              public.investor_mandates, public.mandate_fit_scores from anon;
revoke insert, update, delete on public.mandate_fit_scores from authenticated;

-- ─── 6. W2 follow-up (a)+(b): evaluation_assessments hardening ──────────────
-- (a) UPDATE may not re-home the row to another seat.
drop policy if exists evaluation_assessments_assessor_update on public.evaluation_assessments;
create policy evaluation_assessments_assessor_update on public.evaluation_assessments
  for update using (assessor_user_id = auth.uid()) with check (assessor_user_id = auth.uid());

-- (b) org_id → investor_organisations (SET NULL: an assessment outlives a
--     dissolved org) + same-org seats may SELECT (column masking of
--     private_notes stays the serialiser's job — §C.1).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.evaluation_assessments'::regclass and conname = 'evaluation_assessments_org_id_fkey'
  ) then
    alter table public.evaluation_assessments
      add constraint evaluation_assessments_org_id_fkey
      foreign key (org_id) references public.investor_organisations(id) on delete set null;
  end if;
end $$;
comment on column public.evaluation_assessments.org_id is
  'investor_organisations.id for Firm/Program seat grouping (FK since 0393, ON DELETE SET NULL). Same-org seats may SELECT the row; private_notes are still masked by the serialiser.';
drop policy if exists evaluation_assessments_org_seat_select on public.evaluation_assessments;
create policy evaluation_assessments_org_seat_select on public.evaluation_assessments
  for select using (
    org_id is not null
    and exists (select 1 from public.investor_organisation_members m
                 where m.org_id = evaluation_assessments.org_id and m.user_id = auth.uid())
  );

-- (a) The founder never touches the base table: SELECT revoked from anon /
--     authenticated; the founder projection is the view below. The view is
--     re-created WITHOUT security_invoker (definer = table owner) with the
--     founder predicate inlined, so it works once table SELECT is gone and
--     still returns only the caller's own claimed evaluations. The 0392
--     founder_shared_select policy stays as documentation / defence in
--     depth for a future grant.
revoke select on public.evaluation_assessments from anon, authenticated;
drop view if exists public.v_assessment_founder_view;
create view public.v_assessment_founder_view
with (security_barrier = true) as
select
  a.id,
  a.evaluation_id,
  a.project_id,
  a.version,
  a.shared_with_founder_at,
  a.shared_fields,
  case when 'dimension_ratings'     = any(a.shared_fields) then a.dimension_ratings     else '{}'::jsonb end as dimension_ratings,
  case when 'risks'                 = any(a.shared_fields) then a.risks                 else '[]'::jsonb end as risks,
  case when 'questions_for_founder' = any(a.shared_fields) then a.questions_for_founder else '[]'::jsonb end as questions_for_founder,
  case when 'shared_notes'          = any(a.shared_fields) then a.shared_notes          else null        end as shared_notes,
  a.updated_at
from public.evaluation_assessments a
where a.shared_with_founder_at is not null
  and exists (
    select 1 from public.evaluations e
     where e.id = a.evaluation_id
       and e.founder_user_id = auth.uid()
       and e.owner_kind = 'founder_claimed'
  );
comment on view public.v_assessment_founder_view is
  'G13 §C.1: founder-facing projection of evaluation_assessments — only the four allow-listed sections, only when shared, only the caller''s own claimed evaluations (predicate inlined; definer view since 0393 because table SELECT is revoked from authenticated). decision / conviction / private_notes / valuation_view / thesis_fit_pct are not selectable here.';
revoke all on public.v_assessment_founder_view from anon;
grant select on public.v_assessment_founder_view to authenticated, service_role;

-- ─── 7. W2 follow-up (c): startup_taxonomy evaluator UPDATE guard ────────────
-- 0394's single owner_update policy let an evaluator seat (evaluations.
-- evaluator_user_id) rewrite confirmed_* and protected tags. Split: the
-- project owner keeps the unrestricted path; the evaluator path gains a
-- WITH CHECK that rejects any resulting row that is confirmed or that
-- carries a protected tag (DQ-4: founder-declared only; DQ-5: confirmed
-- fields are never overwritten). The pipeline / API write via service role
-- and apply the same rules in code (store.ts isFieldLocked / isTagLocked).
drop policy if exists startup_taxonomy_owner_update on public.startup_taxonomy;
create policy startup_taxonomy_owner_update on public.startup_taxonomy
  for update using (
    exists (select 1 from public.projects p
             where p.id = startup_taxonomy.project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p
             where p.id = startup_taxonomy.project_id and p.user_id = auth.uid())
  );
drop policy if exists startup_taxonomy_evaluator_update on public.startup_taxonomy;
create policy startup_taxonomy_evaluator_update on public.startup_taxonomy
  for update using (
    exists (select 1 from public.evaluations e
             where e.project_id = startup_taxonomy.project_id and e.evaluator_user_id = auth.uid())
  ) with check (
    exists (select 1 from public.evaluations e
             where e.project_id = startup_taxonomy.project_id and e.evaluator_user_id = auth.uid())
    and confirmed_at is null
    and confirmed_by is null
    and not (tags && array['female_founded','first_nations']::text[])
  );
comment on policy startup_taxonomy_evaluator_update on public.startup_taxonomy is
  'G13 S-T2 (0393, W2 follow-up c): an evaluator seat may update only unconfirmed rows and may never write a protected tag (DQ-4 / DQ-5).';

-- ─── 8. erase_account() re-emitted from the 132-entry erasure map ───────────
-- Three new app_users FKs (investor_organisations.owner_user_id,
-- investor_organisation_members.user_id, investor_mandates.owner_user_id —
-- all CASCADE, mode delete, order 30). The function body below is 0386's
-- byte-for-byte except the generated VALUES blocks (rendered from
-- web/src/lib/privacy/erasure-map.ts and pinned by erasure-map.test.ts).
-- The loop skips tables that do not exist yet, so the map is safe on an
-- install where this file has not created them.
--
-- (0386) -- ---------------------------------------------------------------------------
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS deletion_requested_at       timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_reason             text,
  ADD COLUMN IF NOT EXISTS deletion_cancel_token_hash  text,
  ADD COLUMN IF NOT EXISTS deletion_reauth_token_hash  text,
  ADD COLUMN IF NOT EXISTS deletion_reauth_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS erased_at                   timestamptz;

CREATE INDEX IF NOT EXISTS app_users_deletion_due_idx
  ON public.app_users (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL AND erased_at IS NULL;

COMMENT ON COLUMN public.app_users.deletion_requested_at IS
  'Self-service deletion requested at (7-day grace; cron account-erasure executes after). NULL = no pending request.';
COMMENT ON COLUMN public.app_users.erased_at IS
  'Set by erase_account(): the row is a pseudonymous tombstone kept only so NOT NULL ledger FKs (credit_transactions, usage_logs, app_user_audit_log, …) stay valid for the 7-year financial period.';

CREATE OR REPLACE FUNCTION public.erase_account(p_user_id uuid, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_role        text;
  v_email       text;
  v_erased_at   timestamptz;
  v_stripe      text;
  v_hash        text;
  v_anon_email  text;
  v_anon_lit    text;
  v_step        record;
  v_n           bigint;
  v_where       text;
  v_set         text;
  v_steps       jsonb := '[]'::jsonb;
  v_paths       jsonb := '[]'::jsonb;
  v_skipped     int := 0;
  v_tables      int := 0;
  v_t_delete    bigint := 0;
  v_t_anon      bigint := 0;
  v_t_detach    bigint := 0;
  v_t_pdetach   bigint := 0;
  v_t_extras    bigint := 0;
BEGIN
  -- ── guard: service_role (PostgREST) or direct SQL only ─────────────────
  v_role := current_setting('request.jwt.claim.role', true);
  IF v_role IS NULL OR v_role = '' THEN
    BEGIN
      v_role := (nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'role';
    EXCEPTION WHEN OTHERS THEN
      v_role := NULL;
    END;
  END IF;
  IF coalesce(v_role, '') NOT IN ('', 'service_role') THEN
    RAISE EXCEPTION 'erase_account: service_role only' USING ERRCODE = '42501';
  END IF;

  SELECT email, erased_at, stripe_customer_id
    INTO v_email, v_erased_at, v_stripe
    FROM public.app_users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'erase_account: user % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;

  v_hash := left(encode(sha256(convert_to(p_user_id::text, 'UTF8')), 'hex'), 24);
  v_anon_email := 'deleted+' || v_hash || '@erased.blockid.au';
  v_anon_lit := quote_literal(v_anon_email);

  -- storage objects the caller purges after COMMIT (bucket "dataroom")
  IF to_regclass('public.dataroom_files') IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(storage_path), '[]'::jsonb) INTO v_paths
      FROM public.dataroom_files
     WHERE user_id = p_user_id AND storage_path IS NOT NULL AND storage_path <> '';
  END IF;

  -- ── 0 · NO ACTION / RESTRICT children of the user's projects (and of the
  --        legacy svi_accounts rows that cascade from them) ──────────────
  FOR v_step IN
    SELECT * FROM (VALUES
-- BEGIN project-detaches (generated from src/lib/privacy/erasure-map.ts)
      ('reseller_attributions'::text, 'subject_project_id'::text, 'projects'::text),
      ('credit_transactions'::text, 'project_id'::text, 'projects'::text),
      ('usage_logs'::text, 'project_id'::text, 'projects'::text),
      ('ai_runs'::text, 'business_id'::text, 'projects'::text),
      ('reseller_credit_grants'::text, 'sandbox_project_id'::text, 'projects'::text),
      ('advisor_client_roster'::text, 'project_id'::text, 'projects'::text),
      ('data_rooms'::text, 'project_id'::text, 'projects'::text),
      ('funding_reports'::text, 'project_id'::text, 'projects'::text),
      ('pitchdeck_analyses'::text, 'project_id'::text, 'projects'::text),
      ('user_actions'::text, 'account_id'::text, 'svi_accounts'::text),
      ('cohort_members'::text, 'svi_account_id'::text, 'svi_accounts'::text)
-- END project-detaches
    ) AS t(tbl, col, parent)
  LOOP
    IF to_regclass('public.' || quote_ident(v_step.tbl)) IS NULL THEN CONTINUE; END IF;
    IF v_step.parent = 'svi_accounts' THEN
      IF to_regclass('public.svi_accounts') IS NULL THEN CONTINUE; END IF;
      v_where := format('%I IN (SELECT id FROM public.svi_accounts WHERE lower(email) = %L OR project_id IN (SELECT id FROM public.projects WHERE user_id = %L))',
                        v_step.col, lower(v_email), p_user_id);
    ELSE
      v_where := format('%I IN (SELECT id FROM public.projects WHERE user_id = %L)', v_step.col, p_user_id);
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', v_step.tbl, v_where) INTO v_n;
    IF NOT p_dry_run AND v_n > 0 THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %s', v_step.tbl, v_step.col, v_where);
    END IF;
    v_t_pdetach := v_t_pdetach + v_n;
    v_steps := v_steps || jsonb_build_object('table', v_step.tbl, 'column', v_step.col, 'mode', 'detach_project', 'rows', v_n);
  END LOOP;

  -- ── 1 · every FK to app_users, in dependency order ─────────────────────
  FOR v_step IN
    SELECT * FROM (VALUES
-- BEGIN erasure-map (generated from src/lib/privacy/erasure-map.ts — do not edit by hand)
      (10::int, 'api_keys'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (10::int, 'oauth2_tokens'::text, 'subject_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (10::int, 'password_reset_tokens'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (10::int, 'sessions'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (10::int, 'svi_api_keys'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (10::int, 'webhook_endpoints'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (15::int, 'app_users'::text, 'referred_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'app_users'::text, 'verified_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'equity_requests'::text, 'reviewer_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'evaluations'::text, 'founder_user_id'::text, 'detach'::text, NULL::text, 'founder_email = NULL'::text),
      (15::int, 'evidence_versions'::text, 'created_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'fundraise_commitments'::text, 'created_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'mentor_access_grants'::text, 'founder_user_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'project_members'::text, 'invited_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'reseller_credit_grants'::text, 'granted_by_user_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'reseller_customers'::text, 'stage_set_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'reseller_notes'::text, 'author_user_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'reseller_requests'::text, 'decision_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'revocations'::text, 'revoked_by_user_id'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'secondary_offers'::text, 'reviewed_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'sector_multiples_overrides'::text, 'approved_by'::text, 'detach'::text, NULL::text, NULL::text),
      (15::int, 'svi_dimension_evidence'::text, 'verified_by_user_id'::text, 'detach'::text, NULL::text, NULL::text),
      (20::int, 'compliance_s708_certs'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (20::int, 'dataroom_files'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (20::int, 'founder_packs'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (20::int, 'valuation_certificates'::text, 'user_id'::text, 'anonymise'::text, NULL::text, 'score_history_id = NULL'::text),
      (30::int, 'ab_assignments'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_client_roster'::text, 'advisor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_clients'::text, 'advisor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_clients'::text, 'client_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_invites'::text, 'advisor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_notes'::text, 'advisor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'advisor_portal'::text, 'advisor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'analyses'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'analysis_refreshes'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'assembled_reports'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'brand_settings'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'competitors'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_esic_assessments'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_gst_status'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_modern_slavery_status'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_rd_registrations'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_tax_invoice_checks'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'compliance_wgea_status'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'connector_snapshots'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'contact_unlock_requests'::text, 'investor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'credit_balances'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'email_preferences'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'entitlements'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'eoi_book'::text, 'investor_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'equity_splits'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'evaluation_batches'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'evaluation_reports'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'evaluations'::text, 'evaluator_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'evaluator_progress_sends'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'evidence_items'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'feedback_submissions'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'first_principles_sessions'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'founder_profiles'::text, 'account_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'funding_matches'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'funding_plans'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'funding_reports'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'fundraise_rounds'::text, 'account_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'grant_application_drafts'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'gtm_strategies'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'idea_evaluations'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'investor_links'::text, 'founder_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'investor_mandates'::text, 'owner_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'investor_organisation_members'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'investor_organisations'::text, 'owner_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'investor_portfolio'::text, 'investor_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'lifecycle_state'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'mentor_check_ins'::text, 'founder_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'mentor_engagement_snapshots'::text, 'founder_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'mentor_notes'::text, 'founder_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'notifications'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'nurture_email_queue'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'pitchdeck_analyses'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'positioning_statements'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'pricing_tiers'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'project_members'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'published_analyses'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'reseller_customers'::text, 'customer_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'roadmap_milestones'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'secondary_offers'::text, 'account_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'secondary_sim_orders'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'startup_listings'::text, 'startup_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'startup_package_interview'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'startup_score_history'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'subscription_trial_state'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'svi_readiness_snapshots'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'tech_analyses'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'transfer_whitelist'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'user_source_folders'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'watchlist'::text, 'account_id'::text, 'delete'::text, NULL::text, NULL::text),
      (30::int, 'watchlist_digest'::text, 'account_id'::text, 'delete'::text, NULL::text, NULL::text),
      (40::int, 'data_rooms'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (40::int, 'evidence'::text, 'owner_user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (40::int, 'projects'::text, 'user_id'::text, 'delete'::text, NULL::text, NULL::text),
      (50::int, 'ai_runs'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'analytics_events'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'app_user_audit_log'::text, 'user_id'::text, 'anonymise'::text, 'immutable'::text, NULL::text),
      (50::int, 'checkout_session_reseller_commissions'::text, 'founder_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'churn_events'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'consent_events'::text, 'user_id'::text, 'anonymise'::text, NULL::text, 'ip_address = NULL, user_agent = NULL'::text),
      (50::int, 'consents'::text, 'grantor_user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'conversion_events'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'coupon_redemptions'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'credit_transactions'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'equity_requests'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'guest_analyses'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, 'email = {anon_email}'::text),
      (50::int, 'mentor_access_grants'::text, 'granted_by'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'mentor_check_ins'::text, 'mentor_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'mentor_notes'::text, 'mentor_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'onchain_documents'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'pricing_experiment_events'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, NULL::text),
      (50::int, 'referral_events'::text, 'referred_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'referral_events'::text, 'referrer_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'referrals'::text, 'referrer_id'::text, 'anonymise'::text, NULL::text, 'referrer_email = {anon_email}'::text),
      (50::int, 'report_orders'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'reseller_admins'::text, 'user_id'::text, 'anonymise'::text, NULL::text, 'status = ''revoked'', revoked_at = coalesce(revoked_at, now())'::text),
      (50::int, 'reseller_attributions'::text, 'subject_user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'reseller_audit_log'::text, 'actor_user_id'::text, 'anonymise'::text, 'immutable'::text, NULL::text),
      (50::int, 'reseller_audit_log'::text, 'subject_user_id'::text, 'anonymise'::text, 'immutable'::text, NULL::text),
      (50::int, 'reseller_credit_grants'::text, 'target_user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'reseller_requests'::text, 'requested_by'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'revenue_events'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'share_packages'::text, 'owner_user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'startup_package_purchases'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'upload_scans'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'usage_logs'::text, 'user_id'::text, 'anonymise'::text, NULL::text, NULL::text),
      (50::int, 'user_feedback'::text, 'user_id'::text, 'anonymise'::text, 'nullref'::text, 'email = NULL'::text)
-- END erasure-map
    ) AS t(ord, tbl, col, mode, opts, scrub)
    ORDER BY ord, tbl, col
  LOOP
    IF to_regclass('public.' || quote_ident(v_step.tbl)) IS NULL THEN
      v_skipped := v_skipped + 1;
      v_steps := v_steps || jsonb_build_object('table', v_step.tbl, 'column', v_step.col, 'mode', v_step.mode, 'rows', 0, 'skipped', 'table_missing');
      CONTINUE;
    END IF;

    v_where := format('%I = %L', v_step.col, p_user_id);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', v_step.tbl, v_where) INTO v_n;

    IF NOT p_dry_run AND v_n > 0 THEN
      v_set := CASE WHEN v_step.scrub IS NULL THEN NULL ELSE replace(v_step.scrub, '{anon_email}', v_anon_lit) END;
      IF v_step.mode = 'delete' THEN
        EXECUTE format('DELETE FROM public.%I WHERE %s', v_step.tbl, v_where);
      ELSIF v_step.mode = 'detach' THEN
        EXECUTE format('UPDATE public.%I SET %I = NULL%s WHERE %s',
                       v_step.tbl, v_step.col, coalesce(', ' || v_set, ''), v_where);
      ELSIF v_step.mode = 'anonymise' THEN
        IF v_step.opts = 'immutable' THEN
          NULL; -- append-only ledger: counted, never written
        ELSIF v_step.opts = 'nullref' THEN
          EXECUTE format('UPDATE public.%I SET %I = NULL%s WHERE %s',
                         v_step.tbl, v_step.col, coalesce(', ' || v_set, ''), v_where);
        ELSIF v_set IS NOT NULL THEN
          EXECUTE format('UPDATE public.%I SET %s WHERE %s', v_step.tbl, v_set, v_where);
        END IF; -- keep-ref without scrub: nothing to write, the tombstone is the pseudonym
      ELSE
        RAISE EXCEPTION 'erase_account: unknown mode % for %.%', v_step.mode, v_step.tbl, v_step.col;
      END IF;
    END IF;

    IF v_n > 0 THEN v_tables := v_tables + 1; END IF;
    IF v_step.mode = 'delete' THEN v_t_delete := v_t_delete + v_n;
    ELSIF v_step.mode = 'detach' THEN v_t_detach := v_t_detach + v_n;
    ELSE v_t_anon := v_t_anon + v_n;
    END IF;
    v_steps := v_steps || (jsonb_build_object('table', v_step.tbl, 'column', v_step.col, 'mode', v_step.mode, 'rows', v_n)
               || CASE WHEN v_step.opts IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('opts', v_step.opts) END);
  END LOOP;

  -- ── 2 · tables without an FK (keyed by email or unconstrained user_id) ─
  FOR v_step IN
    SELECT * FROM (VALUES
-- BEGIN non-fk-extras (generated from src/lib/privacy/erasure-map.ts)
      ('magic_links'::text, 'email'::text, 'email'::text, 'delete'::text, NULL::text),
      ('email_drips'::text, 'email'::text, 'email'::text, 'delete'::text, NULL::text),
      ('oauth_connections'::text, 'user_email'::text, 'email'::text, 'delete'::text, NULL::text),
      ('oauth_connections_v2'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('founder_notifications'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('founder_digest_sends'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('svi_action_plans'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('analyzer_runs'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('financial_models'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('equity_plans'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('investor_pack_shares'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('report_sections'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('svi_deck_cache'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('svi_signals'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('dividend_records'::text, 'account_id'::text, 'account'::text, 'delete'::text, NULL::text),
      ('share_transactions'::text, 'account_id'::text, 'account'::text, 'delete'::text, NULL::text),
      ('shareholders'::text, 'account_id'::text, 'account'::text, 'delete'::text, NULL::text),
      ('share_classes'::text, 'account_id'::text, 'account'::text, 'delete'::text, NULL::text),
      ('user_insights'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('data_room_checklist'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('term_sheet_analyses'::text, 'user_id'::text, 'user_id'::text, 'delete'::text, NULL::text),
      ('nps_responses'::text, 'email'::text, 'email'::text, 'anonymise'::text, 'email = NULL, user_email = NULL, user_id = NULL'::text),
      ('leads'::text, 'email'::text, 'email'::text, 'anonymise'::text, 'email = {anon_email}'::text),
      ('user_actions'::text, 'email'::text, 'email'::text, 'anonymise'::text, 'email = {anon_email}'::text),
      ('svi_accounts'::text, 'email'::text, 'email'::text, 'anonymise'::text, 'email = {anon_email}'::text)
-- END non-fk-extras
    ) AS t(tbl, col, keyed, mode, scrub)
  LOOP
    IF to_regclass('public.' || quote_ident(v_step.tbl)) IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = v_step.tbl AND column_name = v_step.col) THEN
      v_skipped := v_skipped + 1;
      v_steps := v_steps || jsonb_build_object('table', v_step.tbl, 'column', v_step.col, 'mode', v_step.mode, 'rows', 0, 'skipped', 'table_or_column_missing', 'extra', true);
      CONTINUE;
    END IF;
    v_where := CASE WHEN v_step.keyed = 'email'
                    THEN format('lower(%I) = %L', v_step.col, lower(v_email))
                    WHEN v_step.keyed = 'account'
                    -- legacy account_id columns hold EITHER the app_users id OR a
                    -- svi_accounts id (cap table / dividend register, 2026-06 era)
                    -- cast: the legacy columns are uuid on some tables and text on others
                    THEN format('(%I::text = %L OR %I::text IN (SELECT id::text FROM public.svi_accounts WHERE lower(email) = %L OR project_id IN (SELECT id FROM public.projects WHERE user_id = %L)))',
                                v_step.col, p_user_id::text, v_step.col, lower(v_email), p_user_id)
                    ELSE format('%I = %L', v_step.col, p_user_id) END;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', v_step.tbl, v_where) INTO v_n;
    IF NOT p_dry_run AND v_n > 0 THEN
      IF v_step.mode = 'delete' THEN
        EXECUTE format('DELETE FROM public.%I WHERE %s', v_step.tbl, v_where);
      ELSE
        EXECUTE format('UPDATE public.%I SET %s WHERE %s', v_step.tbl, replace(v_step.scrub, '{anon_email}', v_anon_lit), v_where);
      END IF;
    END IF;
    IF v_n > 0 THEN v_tables := v_tables + 1; END IF;
    v_t_extras := v_t_extras + v_n;
    v_steps := v_steps || jsonb_build_object('table', v_step.tbl, 'column', v_step.col, 'mode', v_step.mode, 'rows', v_n, 'extra', true);
  END LOOP;

  -- ── 3 · tombstone ──────────────────────────────────────────────────────
  IF NOT p_dry_run THEN
    UPDATE public.app_users SET
      email                      = v_anon_email,
      display_name               = 'Deleted user',
      role                       = 'user',
      plan                       = 'free',
      discount_pct               = 0,
      permissions                = '[]'::jsonb,
      investor_discoverable      = false,
      onboarding_completed       = false,
      google_id                  = NULL,
      avatar_url                 = NULL,
      stripe_customer_id         = NULL,
      password_hash              = NULL,
      coupon_code                = NULL,
      cancel_reason              = NULL,
      referral_code              = NULL,
      startup_name               = NULL,
      startup_stage              = NULL,
      industry                   = NULL,
      startup_goals              = NULL,
      investor_firm              = NULL,
      investor_url               = NULL,
      custom_role                = NULL,
      calendar_token             = NULL,
      investor_prefs             = NULL,
      dashboard_layout           = NULL,
      onboarding_state           = NULL,
      jurisdiction               = NULL,
      jurisdiction_source        = NULL,
      segment                    = NULL,
      deletion_reason            = NULL,
      deletion_cancel_token_hash = NULL,
      deletion_reauth_token_hash = NULL,
      deletion_reauth_expires_at = NULL,
      deletion_requested_at      = NULL,
      erased_at                  = now(),
      deleted_at                 = now(),
      anonymized_at              = now()
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'user_id', p_user_id,
    'anon_email', v_anon_email,
    'already_erased', v_erased_at IS NOT NULL,
    'erased_at', CASE WHEN p_dry_run THEN v_erased_at ELSE now() END,
    'stripe_customer_id', v_stripe,
    'storage_paths', jsonb_build_object('dataroom', v_paths),
    'steps', v_steps,
    'totals', jsonb_build_object(
      'delete', v_t_delete, 'anonymise', v_t_anon, 'detach', v_t_detach,
      'detach_project', v_t_pdetach, 'extras', v_t_extras),
    'tables_touched', v_tables,
    'skipped', v_skipped
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.erase_account(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erase_account(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erase_account(uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.erase_account(uuid, boolean) IS
  'Privacy erasure (S24-B): walks src/lib/privacy/erasure-map.ts in one transaction and tombstones the app_users row. service_role / direct SQL only. p_dry_run=true reports counts and writes nothing.';

COMMIT;

NOTIFY pgrst, 'reload schema';
