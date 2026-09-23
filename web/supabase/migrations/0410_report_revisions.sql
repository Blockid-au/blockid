-- 0410_report_revisions.sql — G30 immutable public report reader bridge.
--
-- A revision owns the exact ReportV2 document and share token shown to a
-- reader. Daily svi_snapshots remain a mutable projection for scoring and
-- account dashboards. Writers are intentionally not switched by this
-- migration; the reader bridge is deployed first and falls back to snapshots.

create table if not exists public.report_revisions (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid references public.svi_snapshots(id) on delete set null,
  project_id uuid,
  account_id uuid,
  share_token text not null unique,
  report_json jsonb not null check (jsonb_typeof(report_json) = 'object'),
  report_hash text not null,
  schema_version text not null default '2.0',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists report_revisions_snapshot_idx
  on public.report_revisions (snapshot_id, created_at desc);
create index if not exists report_revisions_project_idx
  on public.report_revisions (project_id, created_at desc);

alter table public.report_revisions enable row level security;
drop policy if exists report_revisions_service_all on public.report_revisions;
create policy report_revisions_service_all on public.report_revisions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

comment on table public.report_revisions is
  'G30 immutable public ReportV2 revisions. Rows are append-only application records; revoked_at hides a token without changing report_json.';
