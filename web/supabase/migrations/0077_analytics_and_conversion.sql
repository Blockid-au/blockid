-- 0077_analytics_and_conversion.sql
-- Upgrade v2 W1: analytics events + conversion + A/B + churn + lifecycle
-- ADDITIVE ONLY.

-- 1. analytics_events (server-side event log, GA4/BQ-shape; consent-aware)
create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz default now(),
  event_id uuid not null,
  event_name text not null,
  user_id uuid references app_users(id) on delete set null,
  session_id text,
  params jsonb not null default '{}'::jsonb,
  consent_granted boolean default false,
  source text default 'server'
);

-- BQ idempotency: never double-count the same event_id
create unique index if not exists analytics_events_event_id_uq on analytics_events(event_id);
create index if not exists analytics_events_user_idx on analytics_events(user_id);
create index if not exists analytics_events_ts_idx on analytics_events(ts desc);
create index if not exists analytics_events_name_idx on analytics_events(event_name);
create index if not exists analytics_events_session_idx on analytics_events(session_id);

alter table analytics_events enable row level security;

drop policy if exists analytics_events_owner_read on analytics_events;
create policy analytics_events_owner_read on analytics_events
  for select using (auth.uid() = user_id);

drop policy if exists analytics_events_service_all on analytics_events;
create policy analytics_events_service_all on analytics_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 2. conversion_events (plan upgrades / feature-gate conversions)
create table if not exists conversion_events (
  id bigserial primary key,
  ts timestamptz default now(),
  user_id uuid references app_users(id) on delete set null,
  trigger text,
  action text,
  plan_from text,
  plan_to text,
  detail jsonb default '{}'::jsonb
);

create index if not exists conversion_events_user_idx on conversion_events(user_id);
create index if not exists conversion_events_ts_idx on conversion_events(ts desc);
create index if not exists conversion_events_trigger_idx on conversion_events(trigger);

alter table conversion_events enable row level security;

drop policy if exists conversion_events_owner_read on conversion_events;
create policy conversion_events_owner_read on conversion_events
  for select using (auth.uid() = user_id);

drop policy if exists conversion_events_service_all on conversion_events;
create policy conversion_events_service_all on conversion_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 3. ab_experiments (registry)
create table if not exists ab_experiments (
  id text primary key,
  name text,
  description text,
  variants text[] not null,
  default_variant text,
  active boolean default true,
  started_at timestamptz default now(),
  stopped_at timestamptz,
  detail jsonb default '{}'::jsonb
);

create index if not exists ab_experiments_active_idx on ab_experiments(active);

alter table ab_experiments enable row level security;

drop policy if exists ab_experiments_public_read on ab_experiments;
create policy ab_experiments_public_read on ab_experiments
  for select using (active = true);

drop policy if exists ab_experiments_service_all on ab_experiments;
create policy ab_experiments_service_all on ab_experiments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 4. ab_assignments (per-user variant lock; deterministic)
create table if not exists ab_assignments (
  user_id uuid references app_users(id) on delete cascade,
  experiment_id text references ab_experiments(id) on delete cascade,
  variant text not null,
  assigned_at timestamptz default now(),
  primary key (user_id, experiment_id)
);

create index if not exists ab_assignments_experiment_idx on ab_assignments(experiment_id);
create index if not exists ab_assignments_variant_idx on ab_assignments(experiment_id, variant);

alter table ab_assignments enable row level security;

drop policy if exists ab_assignments_owner_read on ab_assignments;
create policy ab_assignments_owner_read on ab_assignments
  for select using (auth.uid() = user_id);

drop policy if exists ab_assignments_service_all on ab_assignments;
create policy ab_assignments_service_all on ab_assignments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 5. churn_events (cancellation + exit-survey + save-offer accept/decline)
create table if not exists churn_events (
  id bigserial primary key,
  ts timestamptz default now(),
  user_id uuid references app_users(id) on delete set null,
  from_plan text,
  reason text,
  exit_survey jsonb default '{}'::jsonb,
  offered_coupon text,
  accepted_coupon boolean,
  detail jsonb default '{}'::jsonb
);

create index if not exists churn_events_user_idx on churn_events(user_id);
create index if not exists churn_events_ts_idx on churn_events(ts desc);
create index if not exists churn_events_reason_idx on churn_events(reason);

alter table churn_events enable row level security;

drop policy if exists churn_events_owner_read on churn_events;
create policy churn_events_owner_read on churn_events
  for select using (auth.uid() = user_id);

drop policy if exists churn_events_service_all on churn_events;
create policy churn_events_service_all on churn_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 6. lifecycle_state (drip campaign / activation-journey pointer per user)
create table if not exists lifecycle_state (
  user_id uuid primary key references app_users(id) on delete cascade,
  current_step text,
  next_send_at timestamptz,
  updated_at timestamptz default now(),
  history jsonb default '[]'::jsonb
);

create index if not exists lifecycle_state_next_send_idx on lifecycle_state(next_send_at) where next_send_at is not null;
create index if not exists lifecycle_state_step_idx on lifecycle_state(current_step);

alter table lifecycle_state enable row level security;

drop policy if exists lifecycle_state_owner_read on lifecycle_state;
create policy lifecycle_state_owner_read on lifecycle_state
  for select using (auth.uid() = user_id);

drop policy if exists lifecycle_state_service_all on lifecycle_state;
create policy lifecycle_state_service_all on lifecycle_state
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 7. v_trial_conversion (weekly cohort conversion view)
create or replace view v_trial_conversion as
  select
    date_trunc('week', trial_start) as week,
    count(*) filter (where status = 'trialing') as started,
    count(*) filter (where status = 'active')   as converted,
    count(*) filter (where status = 'trial_ended_no_payment') as expired_no_pay,
    count(*) filter (where status = 'canceled') as canceled
  from subscription_trial_state
  where trial_start is not null
  group by 1
  order by 1 desc;
