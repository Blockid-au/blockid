-- 0076_compliance_and_equity.sql
-- Upgrade v2 W1: compliance (consent, audit hash-chain, disclaimers) + equity requests
-- ADDITIVE ONLY. Hash-chained audit trail per CISO spec.

-- 1. consent_events (Privacy Act + general advice warning + wholesale certification log)
create table if not exists consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  ts timestamptz default now(),
  consent_kind text,
  disclaimer_version text,
  disclaimer_hash text,
  ip_address inet,
  user_agent text,
  jurisdiction text,
  granted boolean,
  detail jsonb default '{}'::jsonb
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'consent_events_kind_check'
  ) then
    alter table consent_events
      add constraint consent_events_kind_check
      check (consent_kind in (
        'tos','privacy','marketing',
        'general_advice_warning','wholesale_certification',
        'equity_offer_disclaimer','not_financial_advice'
      ));
  end if;
end $$;

create index if not exists consent_events_user_idx on consent_events(user_id);
create index if not exists consent_events_ts_idx on consent_events(ts desc);
create index if not exists consent_events_kind_idx on consent_events(consent_kind);

alter table consent_events enable row level security;

drop policy if exists consent_events_owner_read on consent_events;
create policy consent_events_owner_read on consent_events
  for select using (auth.uid() = user_id);

drop policy if exists consent_events_service_all on consent_events;
create policy consent_events_service_all on consent_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 2. disclaimer_registry (versioned legal text w/ hash for consent chain integrity)
create table if not exists disclaimer_registry (
  id text primary key,
  version text,
  jurisdiction text,
  kind text,
  effective_from timestamptz default now(),
  effective_to timestamptz,
  body_md text,
  hash text not null,
  created_at timestamptz default now()
);

create index if not exists disclaimer_registry_kind_idx on disclaimer_registry(kind, jurisdiction);
create index if not exists disclaimer_registry_effective_idx on disclaimer_registry(effective_from desc);

alter table disclaimer_registry enable row level security;

drop policy if exists disclaimer_registry_public_read on disclaimer_registry;
create policy disclaimer_registry_public_read on disclaimer_registry
  for select using (true);

drop policy if exists disclaimer_registry_service_write on disclaimer_registry;
create policy disclaimer_registry_service_write on disclaimer_registry
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 3. audit_events (append-only, hash-chained)
create table if not exists audit_events (
  id bigserial primary key,
  ts timestamptz default now(),
  user_id uuid references app_users(id) on delete set null,
  actor text,
  action text,
  resource_type text,
  resource_id text,
  prev_hash text,
  curr_hash text not null,
  hmac_signature text,
  detail jsonb default '{}'::jsonb
);

create index if not exists audit_events_user_idx on audit_events(user_id);
create index if not exists audit_events_ts_idx on audit_events(ts desc);
create index if not exists audit_events_resource_idx on audit_events(resource_type, resource_id);
create index if not exists audit_events_action_idx on audit_events(action);

-- Hash-chain trigger: curr_hash = sha256(prev_hash || row_json)
create or replace function audit_events_hash_chain() returns trigger
language plpgsql as $$
declare
  v_prev text;
  v_payload text;
begin
  -- Fetch previous hash (last committed row)
  select curr_hash into v_prev
    from audit_events
    order by id desc
    limit 1;

  new.prev_hash := coalesce(v_prev, '');

  v_payload := coalesce(new.prev_hash,'') ||
               '|' || coalesce(extract(epoch from new.ts)::text,'') ||
               '|' || coalesce(new.user_id::text,'') ||
               '|' || coalesce(new.actor,'') ||
               '|' || coalesce(new.action,'') ||
               '|' || coalesce(new.resource_type,'') ||
               '|' || coalesce(new.resource_id,'') ||
               '|' || coalesce(new.detail::text,'{}');

  new.curr_hash := encode(digest(v_payload, 'sha256'), 'hex');
  return new;
end $$;

-- Ensure pgcrypto for digest()
create extension if not exists pgcrypto;

drop trigger if exists audit_events_hash_chain_trg on audit_events;
create trigger audit_events_hash_chain_trg
  before insert on audit_events
  for each row execute function audit_events_hash_chain();

-- Prevent UPDATE/DELETE on audit_events (append-only)
create or replace function audit_events_no_mutate() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end $$;

drop trigger if exists audit_events_no_update_trg on audit_events;
create trigger audit_events_no_update_trg
  before update on audit_events
  for each row execute function audit_events_no_mutate();

drop trigger if exists audit_events_no_delete_trg on audit_events;
create trigger audit_events_no_delete_trg
  before delete on audit_events
  for each row execute function audit_events_no_mutate();

alter table audit_events enable row level security;

drop policy if exists audit_events_owner_read on audit_events;
create policy audit_events_owner_read on audit_events
  for select using (auth.uid() = user_id);

drop policy if exists audit_events_service_write on audit_events;
create policy audit_events_service_write on audit_events
  for insert with check (auth.role() = 'service_role');

drop policy if exists audit_events_service_read on audit_events;
create policy audit_events_service_read on audit_events
  for select using (auth.role() = 'service_role');

-- 4. equity_requests (CLO-gated: founder-offered equity intake)
create table if not exists equity_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  submitted_at timestamptz default now(),
  stage text,
  equity_pct_requested numeric(5,2),
  scope text,
  jurisdiction text,
  consent_event_id uuid references consent_events(id),
  status text default 'pending_review',
  reviewer_id uuid references app_users(id) on delete set null,
  reviewed_at timestamptz,
  detail jsonb default '{}'::jsonb
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'equity_requests_status_check'
  ) then
    alter table equity_requests
      add constraint equity_requests_status_check
      check (status in ('pending_review','contacted','declined','converted','withdrawn'));
  end if;
end $$;

create index if not exists equity_requests_user_idx on equity_requests(user_id);
create index if not exists equity_requests_status_idx on equity_requests(status);
create index if not exists equity_requests_submitted_idx on equity_requests(submitted_at desc);

alter table equity_requests enable row level security;

drop policy if exists equity_requests_owner_read on equity_requests;
create policy equity_requests_owner_read on equity_requests
  for select using (auth.uid() = user_id);

drop policy if exists equity_requests_service_all on equity_requests;
create policy equity_requests_service_all on equity_requests
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
