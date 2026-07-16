-- 0075_entitlements_trial_and_webhook_state.sql
-- Upgrade v2 W1: entitlements + trial state + Stripe webhook idempotency + revenue events
-- ADDITIVE ONLY.

-- 1. subscription_trial_state (single row per user - current subscription snapshot)
create table if not exists subscription_trial_state (
  user_id uuid primary key references app_users(id) on delete cascade,
  plan_id text references plans(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_start timestamptz,
  trial_end timestamptz,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  updated_at timestamptz default now()
);

-- Additive columns for the checkout / webhook flow.
alter table subscription_trial_state
  add column if not exists payment_method_saved boolean default false;
alter table subscription_trial_state
  add column if not exists trial_will_end_notified_at timestamptz;
alter table subscription_trial_state
  add column if not exists detail jsonb default '{}'::jsonb;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_trial_state_status_check'
  ) then
    alter table subscription_trial_state
      add constraint subscription_trial_state_status_check
      check (status is null or status in ('trialing','active','past_due','canceled','incomplete','trial_ended_no_payment'));
  end if;
end $$;

create index if not exists subscription_trial_state_status_idx on subscription_trial_state(status);
create index if not exists subscription_trial_state_trial_end_idx on subscription_trial_state(trial_end);
create index if not exists subscription_trial_state_stripe_sub_idx on subscription_trial_state(stripe_subscription_id);

alter table subscription_trial_state enable row level security;

drop policy if exists sts_owner_read on subscription_trial_state;
create policy sts_owner_read on subscription_trial_state
  for select using (auth.uid() = user_id);

drop policy if exists sts_service_all on subscription_trial_state;
create policy sts_service_all on subscription_trial_state
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 2. entitlements (materialised feature grants from plan + overrides)
create table if not exists entitlements (
  user_id uuid references app_users(id) on delete cascade,
  feature text,
  allowed boolean default false,
  source text,
  granted_at timestamptz default now(),
  expires_at timestamptz,
  detail jsonb default '{}'::jsonb,
  primary key (user_id, feature)
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'entitlements_source_check'
  ) then
    alter table entitlements
      add constraint entitlements_source_check
      check (source in ('plan','override','grandfathered'));
  end if;
end $$;

create index if not exists entitlements_feature_idx on entitlements(feature);
create index if not exists entitlements_expires_idx on entitlements(expires_at) where expires_at is not null;

alter table entitlements enable row level security;

drop policy if exists entitlements_owner_read on entitlements;
create policy entitlements_owner_read on entitlements
  for select using (auth.uid() = user_id);

drop policy if exists entitlements_service_all on entitlements;
create policy entitlements_service_all on entitlements
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 3. stripe_webhook_events (idempotency)
create table if not exists stripe_webhook_events (
  id text primary key,
  type text,
  received_at timestamptz default now(),
  processed_at timestamptz,
  payload_hash text,
  idempotency_key text,
  error text
);

create index if not exists stripe_webhook_events_type_idx on stripe_webhook_events(type);
create index if not exists stripe_webhook_events_received_idx on stripe_webhook_events(received_at desc);
create index if not exists stripe_webhook_events_unprocessed_idx on stripe_webhook_events(received_at) where processed_at is null;

alter table stripe_webhook_events enable row level security;

drop policy if exists swe_service_all on stripe_webhook_events;
create policy swe_service_all on stripe_webhook_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 4. revenue_events (financial ledger for CFO reporting; GST-net split)
create table if not exists revenue_events (
  id bigserial primary key,
  ts timestamptz default now(),
  user_id uuid references app_users(id) on delete set null,
  plan_id text references plans(id) on delete set null,
  stripe_event_id text unique,
  gross_aud_cents integer,
  gst_aud_cents integer,
  net_aud_cents integer,
  currency text default 'AUD',
  kind text,
  detail jsonb default '{}'::jsonb
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'revenue_events_kind_check'
  ) then
    alter table revenue_events
      add constraint revenue_events_kind_check
      check (kind in ('trial_start','trial_convert','trial_end_no_payment','subscribe','upgrade','downgrade','renewal','refund','chargeback','credit_pack'));
  end if;
end $$;

create index if not exists revenue_events_user_idx on revenue_events(user_id);
create index if not exists revenue_events_ts_idx on revenue_events(ts desc);
create index if not exists revenue_events_kind_idx on revenue_events(kind);
create index if not exists revenue_events_plan_idx on revenue_events(plan_id);

alter table revenue_events enable row level security;

drop policy if exists rev_owner_read on revenue_events;
create policy rev_owner_read on revenue_events
  for select using (auth.uid() = user_id);

drop policy if exists rev_service_all on revenue_events;
create policy rev_service_all on revenue_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
