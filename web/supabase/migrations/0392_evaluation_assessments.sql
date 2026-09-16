-- 0392_evaluation_assessments.sql
-- ---------------------------------------------------------------------------
-- G13-W2-D1 (S-D1) — Evaluator Assessment: the structured investment
-- opinion an evaluator records against ONE evaluation
-- (docs/plans/investor-clarity-2026-09-15/10-ba-investor-dossier-taxonomy.md
-- §A.3 block 4, §A.4, §C.1; decision D2 in
-- docs/plans/investor-clarity-2026-09-15.md §3).
--
--   public.evaluation_assessments — one row per (evaluation, assessor seat,
--   version). The highest version is "current"; older versions are the
--   history ("did the startup move or did my opinion move"). Written by
--   S-D2 (form + PUT/submit/share routes); S-D1 only READS it through
--   web/src/lib/evaluations/assessments.ts with the viewer-role masking
--   described in §C.1 (founder never sees decision / conviction /
--   private_notes / valuation_view / thesis_fit_pct — only the four
--   allow-listed fields, and only once shared_with_founder_at is set).
--
--   watchlist.project_id — the §E3.6 ALTER the plan pins to 0392: the 0066
--   watchlist is ticker-keyed; the dossier is keyed on projects. The column
--   is nullable and backfilled only where the ticker resolves to exactly one
--   project (startup_listings.startup_id = projects.user_id) so nothing is
--   guessed. Writers land in S-D3.
--
-- House rules
--   * FK to public.evaluations(id) and public.projects(id) ONLY.
--     `assessor_user_id` carries an app_users.id but deliberately has NO FK
--     to app_users: the erasure map (web/src/lib/privacy/erasure-map.ts)
--     pins the app_users FK inventory (129 entries, fixture-checked) and an
--     unmapped FK fails that suite. The row still disappears with the user:
--     app_users → evaluations (0314, CASCADE) → evaluation_assessments
--     (CASCADE here). Same pattern as startup_taxonomy.confirmed_by (0394).
--   * `org_id` has NO FK either: investor_organisations lives in the
--     DEFERRED 20260822_investor_portal_core.sql (scripts/db/
--     parity-exceptions.json) and does not exist in production. The FK +
--     the "same-org seat may select" policy ship with 0393 (S-T2 / S-D3)
--     once that migration is applied. Likewise the ic_reports /
--     mandate_fit_scores ALTERs the BA spec lists for 0392 move to 0393 —
--     both tables are in the deferred file.
--   * `snapshot_id` FKs svi_snapshots(id) ON DELETE SET NULL: an assessment
--     outlives a re-scored / pruned snapshot; the Δ callout just says
--     "snapshot no longer available".
--   * RLS mirrors the evaluator-scoped neighbours (0314 evaluations, 0322
--     evaluation_batches): assessor owns the row (select/insert/update/
--     delete); founder of a claimed evaluation may SELECT only rows that
--     have been shared (column masking is done by the API serialiser and
--     the `v_assessment_founder_view` view below — the founder policy is
--     defence in depth for any future anon/authenticated client; the app
--     reads through getSupabaseAdmin() and masks in code); service-role all.
--
-- Idempotent. Apply by hand (never on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0392_evaluation_assessments.sql
--
-- ORDER MATTERS: apply BEFORE deploying the release that ships
-- /workspace/evaluations/[evaluationId]. The reader is 42P01-guarded and
-- renders "Assessment not available yet" when the table is missing, but
-- nothing is stored until it exists.
--
-- Rollback
--   drop view  if exists public.v_assessment_founder_view;
--   drop table if exists public.evaluation_assessments;
--   alter table public.watchlist drop column if exists project_id;
--   (public.set_updated_at() is shared with 0304/0311/0314/0323/0394 — leave it.)
-- ---------------------------------------------------------------------------

begin;

-- ─── 0. shared updated_at helper (idempotent, same body as 0304/0311/0314/0394)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── 1. evaluation_assessments ───────────────────────────────────────────────
create table if not exists public.evaluation_assessments (
  id                      uuid primary key default gen_random_uuid(),
  evaluation_id           uuid not null references public.evaluations(id) on delete cascade,
  -- denormalised for cohort / decision-tally queries (P1, P4)
  project_id              uuid not null references public.projects(id) on delete cascade,
  -- the seat who wrote it (app_users.id) — NO FK on purpose, see header
  assessor_user_id        uuid not null,
  -- Firm / Program grouping (investor_organisations.id) — NO FK yet, see header
  org_id                  uuid,
  -- which AI snapshot was on screen when the view was recorded
  snapshot_id             uuid references public.svi_snapshots(id) on delete set null,
  version                 integer not null default 1 check (version >= 1),
  status                  text not null default 'draft'
                          check (status in ('draft','submitted')),
  -- required on submit (enforced in code + by the CHECK below)
  decision                text check (decision is null or decision in ('pass','track','proceed')),
  conviction              smallint check (conviction is null or (conviction between 1 and 5)),
  -- prefilled from mandate_fit_scores (S-T2), editable
  thesis_fit_pct          smallint check (thesis_fit_pct is null or (thesis_fit_pct between 0 and 100)),
  -- {FTV:{rating:1..5, stance:'agree'|'disagree'|'unsure', note}, … 8 keys} (Appendix 2)
  dimension_ratings       jsonb not null default '{}'::jsonb check (jsonb_typeof(dimension_ratings) = 'object'),
  -- {idea:{stance, note}, … 13 keys} (optional)
  criterion_ratings       jsonb not null default '{}'::jsonb check (jsonb_typeof(criterion_ratings) = 'object'),
  -- {low_aud, high_aud, method_note}
  valuation_view          jsonb check (valuation_view is null or jsonb_typeof(valuation_view) = 'object'),
  -- [{title, severity:'low'|'medium'|'high'|'critical', dimension, note, source:'ai'|'evaluator'}]
  risks                   jsonb not null default '[]'::jsonb check (jsonb_typeof(risks) = 'array'),
  -- [{text, dimension, sent_at}]
  questions_for_founder   jsonb not null default '[]'::jsonb check (jsonb_typeof(questions_for_founder) = 'array'),
  -- NEVER shared, NEVER returned to other seats
  private_notes           text check (private_notes is null or char_length(private_notes) <= 20000),
  -- shared only once shared_with_founder_at is set
  shared_notes            text check (shared_notes is null or char_length(shared_notes) <= 20000),
  -- which allow-listed sections the assessor ticked in the share dialog
  -- (subset of dimension_ratings | risks | questions_for_founder | shared_notes)
  shared_fields           text[] not null default '{}'
                          check (shared_fields <@ array['dimension_ratings','risks','questions_for_founder','shared_notes']::text[]),
  shared_with_founder_at  timestamptz,
  submitted_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- a submitted row must carry a decision (S3 acceptance)
  constraint evaluation_assessments_submitted_needs_decision
    check (status = 'draft' or (decision is not null and submitted_at is not null)),
  unique (evaluation_id, assessor_user_id, version)
);

comment on table public.evaluation_assessments is
  'G13 S-D1/S-D2: one evaluator seat''s structured verdict on one evaluation (version history; latest = current). Private by default — the founder sees only shared_fields once shared_with_founder_at is set (v_assessment_founder_view). assessor_user_id / org_id intentionally carry no FK (erasure-map house rule; investor_organisations is in the deferred portal-core migration).';
comment on column public.evaluation_assessments.assessor_user_id is 'app_users.id of the seat; NO FK on purpose (erasure map pins the app_users FK inventory). Row cascades via evaluations.';
comment on column public.evaluation_assessments.org_id is 'investor_organisations.id for Firm/Program seat grouping. FK + same-org RLS arrive with 0393 once 20260822_investor_portal_core.sql is applied.';
comment on column public.evaluation_assessments.private_notes is 'Never shared with the founder, never returned to other seats.';
comment on column public.evaluation_assessments.shared_fields is 'Allow-list subset the assessor ticked; the API serialiser never emits decision / conviction / private_notes / valuation_view / thesis_fit_pct to the founder regardless.';

-- Dossier read path: latest version for (evaluation, seat).
create index if not exists evaluation_assessments_eval_seat_version_idx
  on public.evaluation_assessments (evaluation_id, assessor_user_id, version desc);
-- Cohort / decision tally + LP report counts (P1, P4).
create index if not exists evaluation_assessments_project_status_idx
  on public.evaluation_assessments (project_id, status, submitted_at desc);
-- Firm / Program consensus rows.
create index if not exists evaluation_assessments_org_idx
  on public.evaluation_assessments (org_id, evaluation_id)
  where org_id is not null;

drop trigger if exists evaluation_assessments_set_updated_at on public.evaluation_assessments;
create trigger evaluation_assessments_set_updated_at
  before update on public.evaluation_assessments
  for each row execute function public.set_updated_at();

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────
alter table public.evaluation_assessments enable row level security;

drop policy if exists evaluation_assessments_assessor_select on public.evaluation_assessments;
create policy evaluation_assessments_assessor_select on public.evaluation_assessments
  for select using (assessor_user_id = auth.uid());

-- Founder of a claimed evaluation: rows only once shared. Column-level
-- masking is the view + serialiser's job (RLS is row-level only).
drop policy if exists evaluation_assessments_founder_shared_select on public.evaluation_assessments;
create policy evaluation_assessments_founder_shared_select on public.evaluation_assessments
  for select using (
    shared_with_founder_at is not null
    and exists (
      select 1 from public.evaluations e
       where e.id = evaluation_assessments.evaluation_id
         and e.founder_user_id = auth.uid()
         and e.owner_kind = 'founder_claimed'
    )
  );

drop policy if exists evaluation_assessments_assessor_insert on public.evaluation_assessments;
create policy evaluation_assessments_assessor_insert on public.evaluation_assessments
  for insert with check (
    assessor_user_id = auth.uid()
    and exists (
      select 1 from public.evaluations e
       where e.id = evaluation_assessments.evaluation_id
         and e.evaluator_user_id = auth.uid()
    )
  );

drop policy if exists evaluation_assessments_assessor_update on public.evaluation_assessments;
create policy evaluation_assessments_assessor_update on public.evaluation_assessments
  for update using (assessor_user_id = auth.uid());

drop policy if exists evaluation_assessments_assessor_delete on public.evaluation_assessments;
create policy evaluation_assessments_assessor_delete on public.evaluation_assessments
  for delete using (assessor_user_id = auth.uid());

drop policy if exists evaluation_assessments_service_all on public.evaluation_assessments;
create policy evaluation_assessments_service_all on public.evaluation_assessments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ─── 3. founder view — the ONLY columns a founder may ever read (§C.1) ──────
-- security_invoker so the founder policy above still applies underneath.
-- decision / conviction / private_notes / valuation_view / thesis_fit_pct
-- are absent by construction; un-ticked sections read as empty / NULL.
drop view if exists public.v_assessment_founder_view;
create view public.v_assessment_founder_view
with (security_invoker = true) as
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
where a.shared_with_founder_at is not null;

comment on view public.v_assessment_founder_view is
  'G13 §C.1: founder-facing projection of evaluation_assessments — only the four allow-listed sections, only when shared. decision / conviction / private_notes / valuation_view / thesis_fit_pct are not selectable here.';

-- ─── 4. watchlist.project_id (§E3.6 — the plan pins this ALTER to 0392) ────
alter table public.watchlist
  add column if not exists project_id uuid references public.projects(id) on delete set null;

comment on column public.watchlist.project_id is
  'G13 S-D1: the projects row behind the ticker so watchlist rows can deep-link the Investor Dossier. Nullable; backfilled only where the ticker resolves to exactly one project. Written by S-D3.';

create index if not exists watchlist_project_idx
  on public.watchlist (project_id)
  where project_id is not null;

-- Backfill: ticker → startup_listings.startup_id (the founder) → the one
-- project that founder owns. Founders with several projects are left NULL
-- (nothing is guessed). Safe to re-run — only NULL rows are touched.
update public.watchlist w
   set project_id = p.id
  from public.startup_listings sl
  join public.projects p on p.user_id = sl.startup_id
 where w.project_id is null
   and sl.ticker = w.ticker
   and (select count(*) from public.projects p2 where p2.user_id = sl.startup_id) = 1;

commit;

notify pgrst, 'reload schema';
