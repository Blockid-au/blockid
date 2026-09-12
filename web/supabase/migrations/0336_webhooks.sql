-- Migration 0336 — outbound webhooks (S20-B, 2026-09-12)
--
-- Signed outbound webhooks for Growth / Package founders and every evaluator
-- plan: `svi.rescored`, `evidence.uploaded`, `funding.report_ready`,
-- `evaluation.report_ready` (+ `ping` from the test button). The writers
-- (api/svi/rescore, cron/svi-snapshot, api/evidence/upload, the funding
-- report generator, api/evaluations/[id]/report + the batch runner) only
-- ENQUEUE a `webhook_deliveries` row; /api/cron/webhook-dispatch (every
-- 5 min) delivers ≤ 50 per tick with a lease + retry ladder
-- (1 m / 10 m / 1 h / 6 h, then `dead`) and auto-disables an endpoint after
-- 20 consecutive failures.
--
--   webhook_endpoints   one row per subscriber URL. `secret_hash` is the
--                       sha256 of the signing secret (shown to the user
--                       ONCE at creation); `secret_enc` is the same secret
--                       sealed with AES-256-GCM (WEBHOOK_SECRET_KEY, falling
--                       back to OAUTH_TOKEN_ENCRYPTION_KEY) so the
--                       dispatcher can sign. `project_id` NULL = a
--                       user-level endpoint (owner-only); set = a
--                       project-level endpoint any project admin manages.
--   webhook_deliveries  one row per (endpoint, event occurrence). `payload`
--                       is the full envelope { id, event, created_at,
--                       api_version, data }. `locked_until` is the
--                       dispatcher lease.
--
-- RLS: owner can SELECT their own rows (through the endpoint for
-- deliveries); everything else is the service role — the app writes through
-- the admin client.
--
-- Applied via: docker exec -i supabase-db psql -U postgres -d postgres
--              < web/supabase/migrations/0336_webhooks.sql
-- Then:        docker exec supabase-db psql -U postgres -d postgres
--              -c "NOTIFY pgrst, 'reload schema';"

begin;

create extension if not exists pgcrypto;

-- ── webhook_endpoints ──────────────────────────────────────────────────────

create table if not exists public.webhook_endpoints (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.app_users(id) on delete cascade,
  project_id       uuid references public.projects(id) on delete cascade,
  url              text not null check (url ~ '^https://' and length(url) <= 2048),
  description      text check (length(description) <= 200),
  secret_hash      text not null,
  secret_enc       text not null,
  events           text[] not null default '{}'::text[],
  active           boolean not null default true,
  failure_count    integer not null default 0 check (failure_count >= 0),
  disabled_reason  text,
  last_success_at  timestamptz,
  last_failure_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.webhook_endpoints is
  'S20-B outbound webhook subscriptions. secret_hash = sha256(secret); secret_enc = AES-GCM sealed secret used to sign deliveries. project_id NULL = user-level endpoint.';

create index if not exists webhook_endpoints_user_idx
  on public.webhook_endpoints (user_id, created_at desc);

create index if not exists webhook_endpoints_project_idx
  on public.webhook_endpoints (project_id)
  where project_id is not null;

-- enqueue: active endpoints subscribed to an event (events @> '{svi.rescored}')
create index if not exists webhook_endpoints_events_gin
  on public.webhook_endpoints using gin (events)
  where active;

-- ── webhook_deliveries ─────────────────────────────────────────────────────

create table if not exists public.webhook_deliveries (
  id               uuid primary key default gen_random_uuid(),
  endpoint_id      uuid not null references public.webhook_endpoints(id) on delete cascade,
  event            text not null,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'queued'
                   check (status in ('queued', 'delivered', 'failed', 'dead')),
  attempts         integer not null default 0 check (attempts >= 0),
  next_attempt_at  timestamptz not null default now(),
  locked_until     timestamptz,
  response_status  integer,
  last_error       text,
  created_at       timestamptz not null default now(),
  delivered_at     timestamptz
);

comment on table public.webhook_deliveries is
  'S20-B one row per (endpoint, event). queued = awaiting first attempt; failed = attempt failed, retry at next_attempt_at; delivered; dead = ladder exhausted / endpoint disabled. locked_until = dispatcher lease.';

-- dispatcher: due work, oldest first
create index if not exists webhook_deliveries_due_idx
  on public.webhook_deliveries (next_attempt_at)
  where status in ('queued', 'failed');

-- UI: last 50 deliveries per endpoint
create index if not exists webhook_deliveries_endpoint_created_idx
  on public.webhook_deliveries (endpoint_id, created_at desc);

-- ── updated_at ─────────────────────────────────────────────────────────────

create or replace function public.webhook_endpoints_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists webhook_endpoints_touch_trg on public.webhook_endpoints;
create trigger webhook_endpoints_touch_trg
  before update on public.webhook_endpoints
  for each row execute function public.webhook_endpoints_touch();

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;

drop policy if exists webhook_endpoints_owner_select on public.webhook_endpoints;
create policy webhook_endpoints_owner_select on public.webhook_endpoints
  for select using (user_id = auth.uid());

drop policy if exists webhook_endpoints_service_all on public.webhook_endpoints;
create policy webhook_endpoints_service_all on public.webhook_endpoints
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists webhook_deliveries_owner_select on public.webhook_deliveries;
create policy webhook_deliveries_owner_select on public.webhook_deliveries
  for select using (
    exists (
      select 1 from public.webhook_endpoints e
      where e.id = webhook_deliveries.endpoint_id and e.user_id = auth.uid()
    )
  );

drop policy if exists webhook_deliveries_service_all on public.webhook_deliveries;
create policy webhook_deliveries_service_all on public.webhook_deliveries
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

commit;

notify pgrst, 'reload schema';
