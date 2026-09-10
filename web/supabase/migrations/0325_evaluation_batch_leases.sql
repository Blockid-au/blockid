-- 0325_evaluation_batch_leases.sql
-- ---------------------------------------------------------------------------
-- Money-path review 2026-09-10, findings #6 / #7 / #9 (evaluations).
--
-- #6 / #7  evaluation_batch_items gets a lease: `started_at` is stamped by
--          the conditional claim (`update … set status='running',
--          started_at=now() where id=? and status='queued'`) so two
--          overlapping runner ticks can never score the same item twice,
--          and `attempts` counts how often an item was (re)claimed. The
--          runner requeues items still `running` after 15 min with
--          attempts < 2 and fails the rest with error='lease_expired', so a
--          deploy / restart mid-item no longer wedges the platform-wide
--          batch queue (finaliseBatch treated `running` as pending forever).
--
-- #9       evaluation_reports.idempotency_key — the report dialog mints one
--          uuid per open and sends it with the confirmed POST. When the
--          client's fetch times out (Cloudflare's 100 s origin cap is below
--          a 1–3 min run) it polls for the row instead of re-POSTing; a
--          retried POST with the same key returns the existing row
--          (`reused:true`) instead of running — and charging — again. The
--          partial unique index makes a double insert impossible even under
--          a race.
--
-- Rollback
--   drop index if exists public.evaluation_reports_idempotency_key_idx;
--   alter table public.evaluation_reports drop column if exists idempotency_key;
--   alter table public.evaluation_batch_items drop column if exists attempts;
--   alter table public.evaluation_batch_items drop column if exists started_at;
--
-- Apply by hand (self-hosted Supabase; migrations are not run on deploy):
--   docker cp web/supabase/migrations/0325_evaluation_batch_leases.sql supabase-db:/tmp/0325.sql
--   docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/0325.sql
--   docker exec supabase-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema'"
-- ---------------------------------------------------------------------------

begin;

alter table public.evaluation_batch_items
  add column if not exists started_at timestamptz,
  add column if not exists attempts integer not null default 0 check (attempts >= 0);

comment on column public.evaluation_batch_items.started_at is
  'Lease start: stamped by the conditional queued→running claim in lib/evaluations/batch.ts (review #6). Items running > 15 min are requeued (attempts < 2) or failed with error=lease_expired by the runner (review #7).';
comment on column public.evaluation_batch_items.attempts is
  'How many times the runner claimed this item; the lease sweep gives up after 2.';

-- Lease sweep: running items ordered by lease start.
create index if not exists evaluation_batch_items_running_lease_idx
  on public.evaluation_batch_items (started_at)
  where status = 'running';

alter table public.evaluation_reports
  add column if not exists idempotency_key uuid;

comment on column public.evaluation_reports.idempotency_key is
  'Client-minted key from the report dialog (review #9): a retried POST /api/evaluations/[id]/report with the same key returns this row instead of running and charging again.';

create unique index if not exists evaluation_reports_idempotency_key_idx
  on public.evaluation_reports (idempotency_key)
  where idempotency_key is not null;

-- Timed reuse lookup: (evaluation, kind, created_at desc).
create index if not exists evaluation_reports_evaluation_kind_idx
  on public.evaluation_reports (evaluation_id, kind, created_at desc);

commit;

notify pgrst, 'reload schema';
