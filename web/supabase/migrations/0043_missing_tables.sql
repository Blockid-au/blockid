-- 0043: Create tables referenced in API routes but missing from schema
-- Tables: fundraise_rounds, data_rooms, data_room_views, evidence_items,
--         onchain_documents, transfer_whitelist

begin;

-- ── fundraise_rounds ─────────────────────────────────────────────────
create table if not exists fundraise_rounds (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references svi_accounts(id) on delete cascade,
  round_name text not null,
  target_amount numeric not null,
  pre_money_valuation numeric not null,
  instrument_type text not null default 'priced', -- priced | safe | convertible
  safe_discount numeric,
  safe_cap numeric,
  share_price numeric,
  new_shares numeric,
  dilution_pct numeric,
  dilution_table jsonb default '[]'::jsonb,
  new_cap_table jsonb default '[]'::jsonb,
  status text not null default 'draft', -- draft | active | closed
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_fundraise_rounds_account on fundraise_rounds(account_id);

-- ── data_rooms ───────────────────────────────────────────────────────
create table if not exists data_rooms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  name text not null default 'Investor Data Room',
  description text,
  template text, -- standard | fundraise | due_diligence
  sections jsonb default '[]'::jsonb,
  settings jsonb default '{}'::jsonb,
  is_public boolean default false,
  access_token text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_data_rooms_user on data_rooms(user_id);

-- ── data_room_views ──────────────────────────────────────────────────
create table if not exists data_room_views (
  id uuid primary key default gen_random_uuid(),
  data_room_id uuid references data_rooms(id) on delete cascade,
  viewer_email text,
  viewer_ip_hash text,
  user_agent text,
  viewed_sections jsonb default '[]'::jsonb,
  time_spent_seconds integer default 0,
  created_at timestamptz default now()
);
create index if not exists idx_data_room_views_room on data_room_views(data_room_id);

-- ── evidence_items ───────────────────────────────────────────────────
create table if not exists evidence_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references svi_accounts(id) on delete cascade,
  user_id uuid references app_users(id) on delete set null,
  evidence_type text not null, -- document | url | github | linkedin | stripe | manual
  label text,
  value_or_url text,
  file_name text,
  file_size integer,
  mime_type text,
  dimension text, -- ftv | mpc | ptd | tre | cgh | iri | lco | svm
  svi_impact numeric default 0,
  confidence_level text default 'self_declared',
  metadata jsonb default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_evidence_items_account on evidence_items(account_id);

-- ── onchain_documents ────────────────────────────────────────────────
create table if not exists onchain_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  document_type text not null, -- share_certificate | vesting_agreement | sha
  document_hash text not null, -- SHA-256 hash of document content
  tx_hash text, -- blockchain transaction hash (null if pending)
  chain_id text,
  block_number bigint,
  metadata jsonb default '{}'::jsonb,
  status text default 'pending', -- pending | confirmed | failed
  created_at timestamptz default now()
);
create index if not exists idx_onchain_docs_user on onchain_documents(user_id);

-- ── transfer_whitelist ───────────────────────────────────────────────
create table if not exists transfer_whitelist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  wallet_address text not null,
  label text,
  verified boolean default false,
  verified_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, wallet_address)
);
create index if not exists idx_transfer_whitelist_user on transfer_whitelist(user_id);

commit;
