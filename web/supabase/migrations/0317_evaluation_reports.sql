-- 0317_evaluation_reports.sql
-- ---------------------------------------------------------------------------
-- T0271 (G12 sprint S3) — Trust BizReport inside /workspace/evaluations.
--
-- Why
--   An evaluator (0310 account types) runs the A$3 Trust BizReport on a
--   startup they entered (an `evaluations` row, 0314) without leaving the
--   workspace. docs/plans/evaluator-traction-2026-09-10.md §3b prices it:
--     • full report   — 1 of the plan's `usage_limits.reports_per_month`
--                       (Scout 10 / Firm 30 / Program 100) when any remain,
--                       otherwise 3 credits (`FEATURE_COSTS.trust_report`);
--     • re-score      — 1 credit (`FEATURE_COSTS.trust_report_rescore`),
--                       never the included quota (the quota is "10 reports
--                       = A$30 value" — a A$1 re-score would waste a slot).
--   The monthly quota has no counter of its own: `used` is the number of
--   rows here with paid_via='quota' inside the current calendar month
--   (UTC). Inserting the row IS the decrement, and it happens only after
--   the pipeline succeeded — a failed run leaves no row and spends nothing
--   (transparent-pricing rule: never charge without success).
--
-- Columns
--   evaluation_id  the evaluations row the report was run for (cascade)
--   project_id     the evaluator-owned projects row (denormalised for the
--                  "Last report · SVI n" join and for per-startup counts)
--   user_id        who paid — the evaluator (app_users)
--   kind           'full'   → orchestrateReport (13 criteria, assembled_reports)
--                  'rescore'→ computeSVI over stored input + evidence
--   paid_via       'quota' | 'credits'
--   credits_cost   0 for quota, else FEATURE_COSTS at the time of the run
--   report_ref     assembled_reports.id (full) or svi_snapshots.id (rescore)
--   share_token    svi_snapshots.report_share_token minted for the run —
--                  the /tbr/<token> read-only page + ?pdf=1 export
--   svi_total      the score the run produced (avoids a snapshot join for
--                  the list page)
--
-- RLS: owner select on user_id + service-role ALL (pattern 0311/0314). The
-- app reads through getSupabaseAdmin() and gates in code.
--
-- Rollback
--   drop table if exists public.evaluation_reports;
--
-- Apply by hand (self-hosted Supabase; migrations are not run on deploy):
--   docker cp web/supabase/migrations/0317_evaluation_reports.sql supabase-db:/tmp/0317.sql
--   docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/0317.sql
--   docker exec supabase-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema'"
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.evaluation_reports (
  id             uuid primary key default gen_random_uuid(),
  evaluation_id  uuid not null references public.evaluations(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  user_id        uuid not null references public.app_users(id) on delete cascade,
  kind           text not null check (kind in ('full','rescore')),
  paid_via       text not null check (paid_via in ('quota','credits')),
  credits_cost   numeric not null default 0 check (credits_cost >= 0),
  report_ref     text,
  share_token    text,
  svi_total      integer,
  created_at     timestamptz not null default now()
);

-- Monthly quota count: (user, paid_via, created_at) — see getReportQuota().
create index if not exists evaluation_reports_user_month_idx
  on public.evaluation_reports (user_id, paid_via, created_at desc);
-- "Last report" per evaluation on the list page.
create index if not exists evaluation_reports_evaluation_idx
  on public.evaluation_reports (evaluation_id, created_at desc);
create index if not exists evaluation_reports_project_idx
  on public.evaluation_reports (project_id, created_at desc);

comment on table public.evaluation_reports is
  'One row per Trust BizReport (kind=full) or re-score (kind=rescore) an evaluator ran on a startup they evaluate. paid_via=quota rows in the current UTC calendar month are the plan''s reports_per_month usage; the row is written only after the pipeline succeeded. Added by T0271.';

alter table public.evaluation_reports enable row level security;

drop policy if exists evaluation_reports_owner_select on public.evaluation_reports;
create policy evaluation_reports_owner_select on public.evaluation_reports
  for select using (user_id = auth.uid());

drop policy if exists evaluation_reports_service_all on public.evaluation_reports;
create policy evaluation_reports_service_all on public.evaluation_reports
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

commit;
