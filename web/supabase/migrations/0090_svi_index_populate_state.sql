-- 0090_svi_index_populate_state.sql (CDO — svi_index_snapshots populator state)
--
-- Verification report bc83e2b found `svi_index_snapshots` was empty and
-- `/api/index/svi` + `/dataset` were returning zeros everywhere. The fix has
-- two arms:
--
--   1. `web/scripts/backfill-svi-index-snapshots.mjs` — one-shot pass over
--      every existing svi_analyses row.
--   2. `/api/cron/svi-index-populate` — incremental cron that lands new
--      snapshots for anything created since the last successful run.
--
-- Both arms share one tiny state table (this file). Single-row (id = 1)
-- because there is only ever one populator; the check constraint stops
-- an accidental multi-row future. RLS is closed to anon/authenticated so
-- only the service role — which is what the cron endpoint uses — can read
-- or write the checkpoint.
--
-- Additive + idempotent — safe to re-run.

create table if not exists public.svi_index_populate_state (
  id                            int primary key default 1,
  last_populated_analysis_id    text,
  last_populated_at             timestamptz,
  updated_at                    timestamptz not null default now(),
  constraint svi_index_populate_state_singleton check (id = 1)
);

alter table public.svi_index_populate_state enable row level security;

-- Anon/authenticated: no access at all.
drop policy if exists svi_index_populate_state_no_anon
  on public.svi_index_populate_state;
create policy svi_index_populate_state_no_anon
  on public.svi_index_populate_state
  for all
  using (false)
  with check (false);

-- Service role: full access (cron endpoint + backfill script).
drop policy if exists svi_index_populate_state_service_all
  on public.svi_index_populate_state;
create policy svi_index_populate_state_service_all
  on public.svi_index_populate_state
  for all
  to service_role
  using (true)
  with check (true);

-- Seed the singleton row.
insert into public.svi_index_populate_state (id) values (1)
  on conflict do nothing;

-- Refresh PostgREST so the new table + policies surface immediately.
notify pgrst, 'reload schema';
