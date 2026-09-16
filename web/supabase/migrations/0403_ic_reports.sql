-- 0403_ic_reports.sql
-- ---------------------------------------------------------------------------
-- G13-W5-D3 (S-D3) — Seats & consensus, IC memo, portfolio write, intro →
-- CRM (docs/plans/investor-clarity-2026-09-15/10-ba-investor-dossier-
-- taxonomy.md §A.3 blocks 4/6, §A.4 "IC memo", §A.5 E4.5–E4.7, E3.6, E2.6;
-- goal doc §3 D2, F3).
--
--   1. public.ic_reports — one row per IC memo / one-pager export from the
--      Investor Dossier (`kind` memo | one_page). The BA spec proposed
--      "reuse ic_reports with ALTER"; the table only exists in the DEFERRED
--      20260822_investor_portal_core.sql (parity-exceptions.json) and
--      `\d public.ic_reports` on production returns "Did not find any
--      relation" (checked 2026-09-16), so it is CREATED here with the
--      columns the feature reads. `sections` jsonb = {summary, svi_table,
--      valuation, thesis_fit, risks, questions, decision, seats} — the
--      decision record frozen at export time; the PDF is re-rendered from
--      the persisted snapshot + these sections (never stored as bytes).
--   2. public.investor_organisation_invites — seat invites for the Firm /
--      Program org (E4.5). Token-keyed magic link; accepted by the signed-in
--      user whose email matches; seat limit (plans.usage_limits.seats
--      1 / 3 / 5) is enforced in code before the row is written.
--   3. public.investor_portfolio.project_id — the projects row behind the
--      text `startup_id` so "Mark as invested" from the dossier is keyed on
--      the project (E3.6). Nullable; existing rows are left NULL.
--
-- House rules
--   * FKs to public.evaluations / public.projects / public.svi_snapshots /
--     public.investor_organisations ONLY. `user_id`, `generated_by`,
--     `assessment_id` and `invited_by` carry app_users / assessment ids but
--     deliberately have NO FK: the erasure map (web/src/lib/privacy/
--     erasure-map.ts) pins the app_users FK inventory (132 entries,
--     fixture-checked) and an unmapped FK fails that suite. Rows still
--     disappear with the user: app_users → evaluations (0314, CASCADE) →
--     ic_reports (CASCADE here); invites die with the org (0393 CASCADE on
--     owner_user_id).
--   * RLS mirrors 0392: owner (user_id = auth.uid()) or same-org seat may
--     SELECT; owner insert/update/delete; service-role all. The app reads
--     through getSupabaseAdmin() and checks ownership in code.
--
-- Idempotent. Apply by hand (never on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0403_ic_reports.sql
--
-- ORDER MATTERS: apply AFTER 0393 (investor_organisations) and BEFORE
-- deploying the release that ships "Export IC" / seat invites. Every reader
-- is 42P01-guarded and renders "not available yet" until this is applied.
--
-- Rollback
--   drop table if exists public.investor_organisation_invites;
--   drop table if exists public.ic_reports;
--   alter table public.investor_portfolio drop column if exists project_id;
-- ---------------------------------------------------------------------------

begin;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── 1. ic_reports ───────────────────────────────────────────────────────────
create table if not exists public.ic_reports (
  id             uuid primary key default gen_random_uuid(),
  evaluation_id  uuid not null references public.evaluations(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  -- the seat who exported (app_users.id) — NO FK on purpose, see header
  user_id        uuid not null,
  -- the current assessment row the memo was built from — NO FK (row may be superseded)
  assessment_id  uuid,
  snapshot_id    uuid references public.svi_snapshots(id) on delete set null,
  kind           text not null default 'memo' check (kind in ('memo','one_page')),
  -- {summary, svi_table, valuation, thesis_fit, risks, questions, decision, seats}
  sections       jsonb not null default '{}'::jsonb check (jsonb_typeof(sections) = 'object'),
  -- F3: the memo prints the dimension weights only for Program and above
  weights_shown  boolean not null default false,
  generated_by   uuid not null,
  pages          smallint,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Deferred-file tolerance (its shape differs): re-assert every column.
alter table public.ic_reports
  add column if not exists evaluation_id uuid references public.evaluations(id) on delete cascade,
  add column if not exists project_id    uuid references public.projects(id) on delete cascade,
  add column if not exists user_id       uuid,
  add column if not exists assessment_id uuid,
  add column if not exists snapshot_id   uuid references public.svi_snapshots(id) on delete set null,
  add column if not exists kind          text not null default 'memo',
  add column if not exists sections      jsonb not null default '{}'::jsonb,
  add column if not exists weights_shown boolean not null default false,
  add column if not exists generated_by  uuid,
  add column if not exists pages         smallint,
  add column if not exists created_at    timestamptz not null default now(),
  add column if not exists updated_at    timestamptz not null default now();

comment on table public.ic_reports is
  'G13 S-D3 (0403): IC memo / one-pager exports from the Investor Dossier. sections jsonb freezes the decision record at export time; the PDF is rendered from the persisted snapshot + sections on GET. user_id / generated_by / assessment_id carry no FK (erasure-map house rule); rows cascade via evaluations.';
comment on column public.ic_reports.sections is
  '{summary, svi_table, valuation, thesis_fit, risks, questions, decision, seats} — never private_notes.';

create index if not exists ic_reports_evaluation_idx
  on public.ic_reports (evaluation_id, created_at desc);
create index if not exists ic_reports_user_idx
  on public.ic_reports (user_id, created_at desc);

drop trigger if exists ic_reports_set_updated_at on public.ic_reports;
create trigger ic_reports_set_updated_at
  before update on public.ic_reports
  for each row execute function public.set_updated_at();

alter table public.ic_reports enable row level security;

drop policy if exists ic_reports_owner_select on public.ic_reports;
create policy ic_reports_owner_select on public.ic_reports
  for select using (user_id = auth.uid());
drop policy if exists ic_reports_org_seat_select on public.ic_reports;
create policy ic_reports_org_seat_select on public.ic_reports
  for select using (
    exists (
      select 1
        from public.investor_organisation_members me
        join public.investor_organisation_members owner
          on owner.org_id = me.org_id
       where me.user_id = auth.uid()
         and owner.user_id = ic_reports.user_id
    )
  );
drop policy if exists ic_reports_owner_write on public.ic_reports;
create policy ic_reports_owner_write on public.ic_reports
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists ic_reports_service_all on public.ic_reports;
create policy ic_reports_service_all on public.ic_reports
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 2. investor_organisation_invites (E4.5 seats) ──────────────────────────
create table if not exists public.investor_organisation_invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.investor_organisations(id) on delete cascade,
  email        text not null check (email = lower(email)),
  role         text not null default 'investment_partner',
  token        text not null unique,
  -- app_users.id of the org owner who sent it — NO FK (erasure-map rule)
  invited_by   uuid not null,
  expires_at   timestamptz not null default (now() + interval '14 days'),
  accepted_at  timestamptz,
  accepted_by  uuid,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (org_id, email)
);
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.investor_organisation_invites'::regclass
       and conname = 'investor_organisation_invites_role_check'
  ) then
    alter table public.investor_organisation_invites
      add constraint investor_organisation_invites_role_check
      check (role in ('investor_viewer','investor_analyst','investment_manager','investment_partner','ic_member','fund_admin','accelerator_analyst','institutional_admin'));
  end if;
end $$;

comment on table public.investor_organisation_invites is
  'G13 S-D3 (0403): seat invites for a Firm / Program investor organisation. One open invite per (org, email); the seat limit (plans.usage_limits.seats) counts members + open invites and is enforced in code before insert. invited_by / accepted_by carry no FK (erasure-map rule); rows cascade with the org.';

create index if not exists investor_organisation_invites_org_idx
  on public.investor_organisation_invites (org_id, created_at desc);

alter table public.investor_organisation_invites enable row level security;

drop policy if exists investor_organisation_invites_owner_all on public.investor_organisation_invites;
create policy investor_organisation_invites_owner_all on public.investor_organisation_invites
  for all using (
    exists (select 1 from public.investor_organisations o
             where o.id = investor_organisation_invites.org_id and o.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from public.investor_organisations o
             where o.id = investor_organisation_invites.org_id and o.owner_user_id = auth.uid())
  );
drop policy if exists investor_organisation_invites_service_all on public.investor_organisation_invites;
create policy investor_organisation_invites_service_all on public.investor_organisation_invites
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 3. investor_portfolio.project_id (E3.6 portfolio write) ────────────────
alter table public.investor_portfolio
  add column if not exists project_id uuid references public.projects(id) on delete set null;

comment on column public.investor_portfolio.project_id is
  'G13 S-D3: the projects row behind startup_id so "Mark as invested" from the Investor Dossier is keyed on the project. Nullable; rows written before 0403 stay NULL.';

create index if not exists investor_portfolio_project_idx
  on public.investor_portfolio (investor_user_id, project_id)
  where project_id is not null;

commit;

notify pgrst, 'reload schema';
