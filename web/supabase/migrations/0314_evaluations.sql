-- 0314_evaluations.sql
-- ---------------------------------------------------------------------------
-- T0270 (G12 sprint S3) — "Startups I'm evaluating": the `evaluations`
-- ownership object + the six investor / advisor tables the code already
-- reads but no migration ever created.
--
-- Why
--   1. `evaluations` (docs/plans/evaluator-traction-2026-09-10.md §3c-4,
--      §9-pre G12-8). An evaluator (investor / accelerator / incubator /
--      advisor / service provider — see 0310) enters startups they are
--      assessing. Each becomes a `projects` row *owned by the evaluator*
--      (`projects.user_id = evaluator`, attribution_* untouched) plus one
--      `evaluations` row that says who is evaluating it, how the founder
--      relates to it (`owner_kind`) and what the founder has consented to
--      share (`consent_tier`, the same three tiers as
--      web/src/lib/mentor/access-tiers.ts). Report routes are owner-scoped
--      by cookie/email today; T0271 (A$3 report inside the workspace) calls
--      `canAccessProjectAsEvaluator()` against this table instead of
--      `projects.user_id` alone.
--
--      Invite/claim: `invite_token` is minted when the evaluator supplies a
--      founder email; the founder clicks a magic-link-style URL and, once
--      logged in, POST /api/evaluations/claim/[token] flips
--      `owner_kind='founder_claimed'`, `consent_tier='reports_shared'`,
--      `claimed_at=now()`. `projects.user_id` is deliberately NOT
--      transferred: the evaluator paid for / owns the workspace row, their
--      plan `profiles` quota counts it, and moving it would strand every
--      evaluator-scoped read (this table, `svi_snapshots.project_id`,
--      credits ledger). Co-ownership is expressed by this row, not by
--      rewriting the project's owner.
--
--      `website` / `state` live here rather than on `projects` because
--      `projects` has no such columns (0020 + 0049/0092/0118/0273/0298 add
--      none) and adding evaluator intake fields to the founder object would
--      widen every founder surface for a field only evaluators capture.
--
--   2. Six tables referenced by shipped code with NO migration (G12-9):
--        investor_portfolio     ← lib/investor-portal.ts getPortfolio()
--        watchlist_digest       ← workspace/investor/digest/page.tsx
--        advisor_client_roster  ← workspace/advisor/roster/page.tsx
--        engagement_notes       ← workspace/advisor/notes/page.tsx (read)
--        advisor_notes          ← lib/advisor-portal.ts + api/advisor/notes (write)
--        advisor_portal         ← lib/advisor-portal.ts getClientRoster()
--      Every one of those surfaces catches the 42P01 "relation does not
--      exist" error and renders an empty state, so a paying Scout / Firm
--      user sees an empty portfolio, an empty roster and a "table missing"
--      digest no matter what they do. Columns below are exactly the ones
--      the reads select / the writes insert — nothing speculative.
--
--      `engagement_notes` is a VIEW over `advisor_notes` (security_invoker,
--      PG 15+): the notes page *reads* engagement_notes while its form
--      *writes* advisor_notes via /api/advisor/notes. Two tables would mean
--      the page never shows the note that was just saved; one table plus
--      a view keeps both code paths working without touching either.
--      author_name / author_email come from app_users via the advisor id.
--
--   Not touched: 0066 `watchlist` (listing-keyed, G12-10) — evaluator
--   Progress Radar (T0273) keys on `evaluations.project_id`.
--
-- RLS: owner policies on the user column each surface filters by
--   (evaluator_user_id / investor_user_id / account_id / advisor_id) +
--   service-role ALL, per 0311. The app reads through getSupabaseAdmin()
--   (service role) and gates in code; the owner policies are defence in
--   depth for any future anon/authenticated client.
--
-- Rollback
--   drop view  if exists public.engagement_notes;
--   drop table if exists public.advisor_notes, public.advisor_portal,
--     public.advisor_client_roster, public.watchlist_digest,
--     public.investor_portfolio, public.evaluations;
--   (public.set_updated_at() is shared with 0304/0311 — leave it in place.)
--
-- Apply by hand (self-hosted Supabase; migrations are not run on deploy):
--   docker cp web/supabase/migrations/0314_evaluations.sql supabase-db:/tmp/0314.sql
--   docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/0314.sql
-- ---------------------------------------------------------------------------

begin;

-- ─── 0. shared updated_at helper (idempotent, same body as 0304/0311) ────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── 1. evaluations ──────────────────────────────────────────────────────────
create table if not exists public.evaluations (
  id                 uuid primary key default gen_random_uuid(),
  evaluator_user_id  uuid not null references public.app_users(id) on delete cascade,
  project_id         uuid not null references public.projects(id) on delete cascade,
  owner_kind         text not null default 'evaluator'
                     check (owner_kind in ('evaluator','founder_invited','founder_claimed')),
  -- Mirrors MENTOR_ACCESS_TIERS in web/src/lib/mentor/access-tiers.ts.
  consent_tier       text not null default 'attributed_only'
                     check (consent_tier in ('attributed_only','reports_shared','full_mentor')),
  founder_email      text,
  founder_user_id    uuid references public.app_users(id) on delete set null,
  invite_token       text unique,
  invited_at         timestamptz,
  claimed_at         timestamptz,
  label              text,
  notes              text check (notes is null or char_length(notes) <= 20000),
  -- Evaluator intake fields with no home on `projects` (see header).
  website            text,
  state              text check (state is null or state in ('NSW','VIC','QLD','WA','SA','TAS','ACT','NT','national')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (evaluator_user_id, project_id)
);

create index if not exists evaluations_evaluator_idx
  on public.evaluations (evaluator_user_id, created_at desc);
create index if not exists evaluations_project_idx
  on public.evaluations (project_id);
create index if not exists evaluations_founder_user_idx
  on public.evaluations (founder_user_id)
  where founder_user_id is not null;

comment on table public.evaluations is
  'One row per (evaluator, startup they are evaluating). The startup is a projects row owned by the evaluator (projects.user_id = evaluator_user_id). owner_kind tracks whether the founder was invited / claimed it; consent_tier reuses the mentor access tiers (attributed_only < reports_shared < full_mentor). projects.user_id is never transferred on claim — see migration 0314 header. Added by T0270.';

alter table public.evaluations enable row level security;

drop policy if exists evaluations_evaluator_select on public.evaluations;
create policy evaluations_evaluator_select on public.evaluations
  for select using (evaluator_user_id = auth.uid() or founder_user_id = auth.uid());

drop policy if exists evaluations_evaluator_insert on public.evaluations;
create policy evaluations_evaluator_insert on public.evaluations
  for insert with check (evaluator_user_id = auth.uid());

drop policy if exists evaluations_evaluator_update on public.evaluations;
create policy evaluations_evaluator_update on public.evaluations
  for update using (evaluator_user_id = auth.uid());

drop policy if exists evaluations_evaluator_delete on public.evaluations;
create policy evaluations_evaluator_delete on public.evaluations
  for delete using (evaluator_user_id = auth.uid());

drop policy if exists evaluations_service_all on public.evaluations;
create policy evaluations_service_all on public.evaluations
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 2. investor_portfolio (lib/investor-portal.ts getPortfolio) ─────────────
-- select: id, startup_id, company_name, valuation_aud, ownership_pct,
--         latest_quarterly_report_id, invested_at   where investor_user_id
create table if not exists public.investor_portfolio (
  id                         uuid primary key default gen_random_uuid(),
  investor_user_id           uuid not null references public.app_users(id) on delete cascade,
  -- Listing / ticker / project id as text: deal-flow rows come from
  -- startup_scores (text ids) and evaluator projects from projects (uuid).
  startup_id                 text not null,
  company_name               text not null,
  valuation_aud              numeric,
  ownership_pct              numeric check (ownership_pct is null or (ownership_pct >= 0 and ownership_pct <= 100)),
  latest_quarterly_report_id uuid,
  invested_at                timestamptz not null default now(),
  notes                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (investor_user_id, startup_id)
);

create index if not exists investor_portfolio_investor_idx
  on public.investor_portfolio (investor_user_id, invested_at desc);

alter table public.investor_portfolio enable row level security;

drop policy if exists investor_portfolio_owner_all on public.investor_portfolio;
create policy investor_portfolio_owner_all on public.investor_portfolio
  for all using (investor_user_id = auth.uid()) with check (investor_user_id = auth.uid());

drop policy if exists investor_portfolio_service_all on public.investor_portfolio;
create policy investor_portfolio_service_all on public.investor_portfolio
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 3. watchlist_digest (workspace/investor/digest/page.tsx) ────────────────
-- select: id, sent_at, summary_md, tickers   where account_id   order sent_at
-- Written by the watchlist-digest cron (one row per send).
create table if not exists public.watchlist_digest (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.app_users(id) on delete cascade,
  sent_at     timestamptz not null default now(),
  summary_md  text,
  tickers     text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists watchlist_digest_account_idx
  on public.watchlist_digest (account_id, sent_at desc);

alter table public.watchlist_digest enable row level security;

drop policy if exists watchlist_digest_owner_select on public.watchlist_digest;
create policy watchlist_digest_owner_select on public.watchlist_digest
  for select using (account_id = auth.uid());

drop policy if exists watchlist_digest_service_all on public.watchlist_digest;
create policy watchlist_digest_service_all on public.watchlist_digest
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 4. advisor_client_roster (workspace/advisor/roster/page.tsx) ────────────
-- select: id, client_name, startup_ticker, latest_svi, last_engagement,
--         next_check_in   where advisor_id   order last_engagement desc
-- Roster row id is the `client_id` the notes page / API pass around.
create table if not exists public.advisor_client_roster (
  id               uuid primary key default gen_random_uuid(),
  advisor_id       uuid not null references public.app_users(id) on delete cascade,
  client_name      text not null,
  startup_ticker   text,
  project_id       uuid references public.projects(id) on delete set null,
  latest_svi       numeric,
  last_engagement  timestamptz,
  next_check_in    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists advisor_client_roster_advisor_idx
  on public.advisor_client_roster (advisor_id, last_engagement desc nulls last);

alter table public.advisor_client_roster enable row level security;

drop policy if exists advisor_client_roster_owner_all on public.advisor_client_roster;
create policy advisor_client_roster_owner_all on public.advisor_client_roster
  for all using (advisor_id = auth.uid()) with check (advisor_id = auth.uid());

drop policy if exists advisor_client_roster_service_all on public.advisor_client_roster;
create policy advisor_client_roster_service_all on public.advisor_client_roster
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 5. advisor_portal (lib/advisor-portal.ts getClientRoster) ───────────────
-- select: client_id, startup_name, founder_name, svi, last_activity_at,
--         engagement   where advisor_id   order last_activity_at desc
create table if not exists public.advisor_portal (
  id                uuid primary key default gen_random_uuid(),
  advisor_id        uuid not null references public.app_users(id) on delete cascade,
  client_id         uuid not null references public.advisor_client_roster(id) on delete cascade,
  startup_name      text not null default '',
  founder_name      text,
  svi               numeric,
  last_activity_at  timestamptz,
  engagement        text not null default 'active'
                    check (engagement in ('active','at_risk','dormant')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (advisor_id, client_id)
);

create index if not exists advisor_portal_advisor_idx
  on public.advisor_portal (advisor_id, last_activity_at desc nulls last);

alter table public.advisor_portal enable row level security;

drop policy if exists advisor_portal_owner_all on public.advisor_portal;
create policy advisor_portal_owner_all on public.advisor_portal
  for all using (advisor_id = auth.uid()) with check (advisor_id = auth.uid());

drop policy if exists advisor_portal_service_all on public.advisor_portal;
create policy advisor_portal_service_all on public.advisor_portal
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 6. advisor_notes (lib/advisor-portal.ts getClientNotes / saveNote) ──────
-- insert: advisor_id, client_id, body
-- select: id, client_id, advisor_id, body, created_at, updated_at
create table if not exists public.advisor_notes (
  id          uuid primary key default gen_random_uuid(),
  advisor_id  uuid not null references public.app_users(id) on delete cascade,
  client_id   uuid not null references public.advisor_client_roster(id) on delete cascade,
  body        text not null check (char_length(body) <= 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists advisor_notes_client_idx
  on public.advisor_notes (advisor_id, client_id, created_at desc);

alter table public.advisor_notes enable row level security;

drop policy if exists advisor_notes_owner_all on public.advisor_notes;
create policy advisor_notes_owner_all on public.advisor_notes
  for all using (advisor_id = auth.uid()) with check (advisor_id = auth.uid());

drop policy if exists advisor_notes_service_all on public.advisor_notes;
create policy advisor_notes_service_all on public.advisor_notes
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 7. engagement_notes (workspace/advisor/notes/page.tsx — read side) ──────
-- select: id, client_id, author_name, author_email, body, created_at
--         where advisor_id, client_id   order created_at desc
-- security_invoker so advisor_notes RLS applies to whoever queries the view.
drop view if exists public.engagement_notes;
create view public.engagement_notes
  with (security_invoker = true) as
  select n.id,
         n.advisor_id,
         n.client_id,
         u.display_name as author_name,
         u.email        as author_email,
         n.body,
         n.created_at,
         n.updated_at
    from public.advisor_notes n
    left join public.app_users u on u.id = n.advisor_id;

comment on view public.engagement_notes is
  'Read model for /workspace/advisor/notes over advisor_notes (the table /api/advisor/notes writes). Added by migration 0314.';

-- ─── 8. updated_at touch triggers ────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'evaluations','investor_portfolio','advisor_client_roster','advisor_portal','advisor_notes'
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
