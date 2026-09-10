-- 0322_evaluation_batches.sql
-- ---------------------------------------------------------------------------
-- T0272 (G12 sprint S5) — Program batch scoring.
--
-- Why
--   A Program evaluator (investor_vc_small — an accelerator, VC team or
--   university program) queues N of the startups they evaluate (0314
--   `evaluations` rows) and every one is scored on the same rubric
--   (`enhanced_report_standard` through runTrustReportForProject) off-peak by
--   /api/cron/evaluation-batch-runner, 5 items per tick. The cohort table at
--   /workspace/evaluations/cohort/<batch> and the CSV / sponsor-LP exports
--   read these two tables. docs/plans/evaluator-traction-2026-09-10.md §3c-7.
--
-- evaluation_batches
--   user_id         the evaluator who queued it (app_users) — pays the
--                   reports_per_month quota; POST /api/evaluations/batch
--                   checks the whole batch fits the remaining quota up front
--                   (all-or-nothing) and the runner records one
--                   evaluation_reports(paid_via='quota') row per scored item.
--   name            "Cohort 4 intake", free text.
--   rubric_weights  {ftv,mpc,ptd,tre,cgh,iri,lco,svm} → 0..100 summing to
--                   100. The SVI pipeline has no weight input, so the weights
--                   re-aggregate the 8 dimension scores for the DISPLAYED
--                   cohort score (weightedScore() in lib/evaluations/
--                   batch-shared.ts); the SVI itself is unchanged.
--   status          queued → running → done | failed
--   total / done_count / failed_count — denormalised from the items so the
--                   list page shows progress without a count query.
--
-- evaluation_batch_items
--   one row per (batch, evaluation). status queued|running|done|failed;
--   report_id = assembled_reports.id, snapshot_id / share_token =
--   svi_snapshots row + /tbr/<token> link, svi_total + dimension_scores
--   copied from the snapshot so the cohort table needs no join.
--
-- RLS: owner select on user_id (items via their batch) + service-role ALL
-- (pattern 0317/0321). The app reads through getSupabaseAdmin() and gates in
-- code (lp_export / accelerator.cohort).
--
-- Rollback
--   drop table if exists public.evaluation_batch_items;
--   drop table if exists public.evaluation_batches;
--
-- Apply by hand (self-hosted Supabase; migrations are not run on deploy):
--   docker cp web/supabase/migrations/0322_evaluation_batches.sql supabase-db:/tmp/0322.sql
--   docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/0322.sql
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.evaluation_batches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.app_users(id) on delete cascade,
  name            text not null default 'Batch',
  rubric_weights  jsonb not null default '{}'::jsonb,
  status          text not null default 'queued'
                  check (status in ('queued','running','done','failed')),
  total           integer not null default 0 check (total >= 0),
  done_count      integer not null default 0 check (done_count >= 0),
  failed_count    integer not null default 0 check (failed_count >= 0),
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);

-- Runner: oldest queued|running batch first. List page: per user, newest first.
create index if not exists evaluation_batches_status_created_idx
  on public.evaluation_batches (status, created_at asc);
create index if not exists evaluation_batches_user_created_idx
  on public.evaluation_batches (user_id, created_at desc);

comment on table public.evaluation_batches is
  'Program batch scoring (T0272): N evaluations queued by one evaluator, scored off-peak by /api/cron/evaluation-batch-runner on one rubric. rubric_weights re-aggregate the 8 dimension scores for the displayed cohort score only.';

create table if not exists public.evaluation_batch_items (
  id                bigserial primary key,
  batch_id          uuid not null references public.evaluation_batches(id) on delete cascade,
  evaluation_id     uuid not null references public.evaluations(id) on delete cascade,
  status            text not null default 'queued'
                    check (status in ('queued','running','done','failed')),
  report_id         text,
  snapshot_id       text,
  share_token       text,
  svi_total         integer,
  dimension_scores  jsonb,
  error             text,
  scored_at         timestamptz,
  unique (batch_id, evaluation_id)
);

create index if not exists evaluation_batch_items_batch_status_idx
  on public.evaluation_batch_items (batch_id, status, id);
create index if not exists evaluation_batch_items_evaluation_idx
  on public.evaluation_batch_items (evaluation_id);

comment on table public.evaluation_batch_items is
  'One startup inside an evaluation_batches run (T0272). report_id = assembled_reports.id, snapshot_id/share_token = the svi_snapshots row the /tbr/<token> page renders; svi_total + dimension_scores are copied from that snapshot for the cohort table and CSV.';

alter table public.evaluation_batches enable row level security;
alter table public.evaluation_batch_items enable row level security;

drop policy if exists evaluation_batches_owner_select on public.evaluation_batches;
create policy evaluation_batches_owner_select on public.evaluation_batches
  for select using (user_id = auth.uid());

drop policy if exists evaluation_batches_service_all on public.evaluation_batches;
create policy evaluation_batches_service_all on public.evaluation_batches
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists evaluation_batch_items_owner_select on public.evaluation_batch_items;
create policy evaluation_batch_items_owner_select on public.evaluation_batch_items
  for select using (
    exists (
      select 1 from public.evaluation_batches b
      where b.id = evaluation_batch_items.batch_id and b.user_id = auth.uid()
    )
  );

drop policy if exists evaluation_batch_items_service_all on public.evaluation_batch_items;
create policy evaluation_batch_items_service_all on public.evaluation_batch_items
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

commit;

notify pgrst, 'reload schema';
