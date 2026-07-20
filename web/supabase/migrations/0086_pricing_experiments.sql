-- 0086_pricing_experiments.sql (T0206 — Pricing & segment A/B test infrastructure)
--
-- Purpose: give the CSO/CRO a lightweight A/B harness for pricing, segment
-- copy, and label changes without wiring in a full experimentation vendor.
-- Two tables: one for the experiment definition, one for the raw event log.
-- Aggregation is done at read time in `pricing-experiments.ts` — we do NOT
-- pre-aggregate here so we can add slices later without a backfill.
--
-- Additive + idempotent. Author only; not auto-applied on deploy (see memory).

create table if not exists public.pricing_experiments (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  hypothesis     text not null default '',
  status         text not null default 'draft'
                  check (status in ('draft','running','paused','concluded')),
  variants       jsonb not null,
  traffic_split  jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  concluded_at   timestamptz
);

create index if not exists pricing_experiments_status_idx
  on public.pricing_experiments (status, updated_at desc);

create table if not exists public.pricing_experiment_events (
  id             bigserial primary key,
  experiment_id  uuid not null references public.pricing_experiments(id) on delete cascade,
  variant_key    text not null,
  -- impression = page saw the variant. conversion = user took the target
  -- action (checkout click / plan pick / whatever the caller decides).
  event_type     text not null check (event_type in ('impression','conversion')),
  session_id     text not null,
  user_id        uuid references public.app_users(id) on delete set null,
  value_aud      numeric,
  created_at     timestamptz not null default now()
);

create index if not exists pricing_experiment_events_lookup_idx
  on public.pricing_experiment_events (experiment_id, event_type, created_at desc);

alter table public.pricing_experiments enable row level security;
alter table public.pricing_experiment_events enable row level security;

drop policy if exists pricing_experiments_service_all
  on public.pricing_experiments;
create policy pricing_experiments_service_all
  on public.pricing_experiments
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists pricing_experiment_events_service_all
  on public.pricing_experiment_events;
create policy pricing_experiment_events_service_all
  on public.pricing_experiment_events
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
