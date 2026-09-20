-- 0423_cohort_overrides_members.sql
-- ---------------------------------------------------------------------------
-- G21 P2-B — the BlockID Cohort view (docs/plans/g21-fi-upgrade-2026-09-20.md
-- § 2 P2-B; FI § 53/54): reviewer overrides with reason codes, reviewer
-- roles on a batch, and the per-item review columns.
--
--   public.assessment_overrides       one row per human override of ONE
--                                     dimension score (or the total) on ONE
--                                     batch item. Appended, never updated:
--                                     the canonical SVI / dimension score is
--                                     unchanged; the cohort view shows both
--                                     ("model 48 → human 62 · sector_context").
--   public.evaluation_batch_members   owner / reviewer / viewer seats on a
--                                     batch (the batch creator is the owner
--                                     by construction — evaluation_batches.
--                                     user_id — and never needs a row here).
--   evaluation_batch_items            + shortlisted, review_status,
--                                     reviewer_id.
--
-- House rules
--   * FKs: evaluation_batches / evaluation_batch_items (0322) and
--     public.projects(id) — CASCADE. User FKs → public.app_users(id):
--     reviewer_id / invited_by SET NULL (the override / invite is part of
--     the batch's record; the actor pointer is cleared on erasure), members
--     user_id CASCADE (a seat is the user's own row).
--     ► Erasure map: three new app_users FKs (assessment_overrides.reviewer_id,
--       evaluation_batch_members.user_id, evaluation_batch_members.invited_by,
--       evaluation_batch_items.reviewer_id = four) must be added to
--       web/src/lib/privacy/erasure-map.ts + the fixture and erase_account()
--       re-emitted (same step as 0417 / 0421) — done by the merging session,
--       not by this lane (see the P2-B report).
--   * RLS on the 0392 / 0322 pattern: batch owner + batch members may
--     SELECT; only owner / reviewer seats INSERT overrides (through the
--     service role in practice — the app writes with getSupabaseAdmin()
--     after assertBatchRole()); service-role ALL.
--   * Idempotent. Apply by hand (never on deploy):
--       scripts/db/apply-migration.sh web/supabase/migrations/0423_cohort_overrides_members.sql
--     Readers are 42P01 / 42703-guarded: before this is applied the cohort
--     view renders without overrides / members and the item columns read
--     as their defaults.
--
-- Rollback
--   drop table if exists public.assessment_overrides;
--   drop table if exists public.evaluation_batch_members;
--   alter table public.evaluation_batch_items
--     drop column if exists shortlisted,
--     drop column if exists review_status,
--     drop column if exists reviewer_id;
-- ---------------------------------------------------------------------------

begin;

-- ─── 1. evaluation_batch_items — review columns ─────────────────────────────
alter table public.evaluation_batch_items
  add column if not exists shortlisted   boolean not null default false,
  add column if not exists review_status text    not null default 'unreviewed',
  add column if not exists reviewer_id   uuid references public.app_users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'evaluation_batch_items_review_status_check'
       and conrelid = 'public.evaluation_batch_items'::regclass
  ) then
    alter table public.evaluation_batch_items
      add constraint evaluation_batch_items_review_status_check
      check (review_status in ('unreviewed','in_review','reviewed'));
  end if;
end $$;

comment on column public.evaluation_batch_items.shortlisted is
  'G21 P2-B: reviewer shortlist flag on the cohort view (PATCH /api/evaluations/batch/[id]/items/[itemId]).';
comment on column public.evaluation_batch_items.review_status is
  'G21 P2-B: unreviewed → in_review → reviewed (human workflow state; never derived from the model).';
comment on column public.evaluation_batch_items.reviewer_id is
  'G21 P2-B: the seat assigned to review this item (app_users, SET NULL on erasure).';

create index if not exists evaluation_batch_items_shortlist_idx
  on public.evaluation_batch_items (batch_id, shortlisted)
  where shortlisted;

-- ─── 2. evaluation_batch_members ────────────────────────────────────────────
create table if not exists public.evaluation_batch_members (
  batch_id    uuid not null references public.evaluation_batches(id) on delete cascade,
  user_id     uuid not null references public.app_users(id) on delete cascade,
  role        text not null check (role in ('owner','reviewer','viewer')),
  invited_by  uuid references public.app_users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (batch_id, user_id)
);

comment on table public.evaluation_batch_members is
  'G21 P2-B: reviewer roles on a BlockID Cohort (evaluation_batches). The batch creator (evaluation_batches.user_id) is the owner by construction and has no row here; owner rows are allowed for explicit co-owners. viewer = read-only; reviewer = shortlist / review status / overrides / decisions; owner = + invite / remove members.';

create index if not exists evaluation_batch_members_user_idx
  on public.evaluation_batch_members (user_id, created_at desc);

-- ─── 3. assessment_overrides ────────────────────────────────────────────────
create table if not exists public.assessment_overrides (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid   not null references public.evaluation_batches(id) on delete cascade,
  item_id      bigint not null references public.evaluation_batch_items(id) on delete cascade,
  project_id   uuid   not null references public.projects(id) on delete cascade,
  -- one of the 8 dimension keys or 'total'
  dimension    text   not null check (dimension in ('ftv','mpc','ptd','tre','cgh','iri','lco','svm','total')),
  from_value   numeric check (from_value is null or (from_value >= 0 and from_value <= 100)),
  to_value     numeric not null check (to_value >= 0 and to_value <= 100),
  reason_code  text   not null check (reason_code in (
                 'evidence_not_captured','evidence_contradicted','sector_context',
                 'stage_context','duplicate_signal','data_error','other')),
  note         text check (note is null or char_length(note) <= 2000),
  reviewer_id  uuid references public.app_users(id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.assessment_overrides is
  'G21 P2-B: a reviewer''s human override of one dimension score (or the total) on one cohort item, with a reason code. Append-only: the canonical SVI and dimension scores are never changed — the cohort view shows model and human side by side; the audit ledger carries assessment.override.';
comment on column public.assessment_overrides.from_value is 'The model score on screen when the override was recorded (null when the item was unscored).';
comment on column public.assessment_overrides.reason_code is 'evidence_not_captured · evidence_contradicted · sector_context · stage_context · duplicate_signal · data_error · other';

create index if not exists assessment_overrides_batch_item_idx
  on public.assessment_overrides (batch_id, item_id, created_at desc);

-- ─── 4. RLS ─────────────────────────────────────────────────────────────────
alter table public.evaluation_batch_members enable row level security;
alter table public.assessment_overrides     enable row level security;

-- members: a seat sees its own row; the batch owner sees every row of their batch.
drop policy if exists evaluation_batch_members_self_select on public.evaluation_batch_members;
create policy evaluation_batch_members_self_select on public.evaluation_batch_members
  for select using (user_id = auth.uid());

drop policy if exists evaluation_batch_members_owner_select on public.evaluation_batch_members;
create policy evaluation_batch_members_owner_select on public.evaluation_batch_members
  for select using (
    exists (select 1 from public.evaluation_batches b
             where b.id = evaluation_batch_members.batch_id and b.user_id = auth.uid())
  );

drop policy if exists evaluation_batch_members_owner_write on public.evaluation_batch_members;
create policy evaluation_batch_members_owner_write on public.evaluation_batch_members
  for all using (
    exists (select 1 from public.evaluation_batches b
             where b.id = evaluation_batch_members.batch_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.evaluation_batches b
             where b.id = evaluation_batch_members.batch_id and b.user_id = auth.uid())
  );

drop policy if exists evaluation_batch_members_service_all on public.evaluation_batch_members;
create policy evaluation_batch_members_service_all on public.evaluation_batch_members
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- overrides: owner + any member of the batch may read; owner / reviewer seats may insert.
drop policy if exists assessment_overrides_member_select on public.assessment_overrides;
create policy assessment_overrides_member_select on public.assessment_overrides
  for select using (
    exists (select 1 from public.evaluation_batches b
             where b.id = assessment_overrides.batch_id and b.user_id = auth.uid())
    or exists (select 1 from public.evaluation_batch_members m
                where m.batch_id = assessment_overrides.batch_id and m.user_id = auth.uid())
  );

drop policy if exists assessment_overrides_reviewer_insert on public.assessment_overrides;
create policy assessment_overrides_reviewer_insert on public.assessment_overrides
  for insert with check (
    reviewer_id = auth.uid()
    and (
      exists (select 1 from public.evaluation_batches b
               where b.id = assessment_overrides.batch_id and b.user_id = auth.uid())
      or exists (select 1 from public.evaluation_batch_members m
                  where m.batch_id = assessment_overrides.batch_id
                    and m.user_id = auth.uid()
                    and m.role in ('owner','reviewer'))
    )
  );

drop policy if exists assessment_overrides_service_all on public.assessment_overrides;
create policy assessment_overrides_service_all on public.assessment_overrides
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- batch items / batches: members may SELECT alongside the 0322 owner policies.
drop policy if exists evaluation_batches_member_select on public.evaluation_batches;
create policy evaluation_batches_member_select on public.evaluation_batches
  for select using (
    exists (select 1 from public.evaluation_batch_members m
             where m.batch_id = evaluation_batches.id and m.user_id = auth.uid())
  );

drop policy if exists evaluation_batch_items_member_select on public.evaluation_batch_items;
create policy evaluation_batch_items_member_select on public.evaluation_batch_items
  for select using (
    exists (select 1 from public.evaluation_batch_members m
             where m.batch_id = evaluation_batch_items.batch_id and m.user_id = auth.uid())
  );

commit;

notify pgrst, 'reload schema';
