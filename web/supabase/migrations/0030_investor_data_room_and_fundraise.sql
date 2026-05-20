-- Investor data rooms: shareable one-click data room for investors
create table if not exists data_rooms (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  email text not null,
  token text unique not null,
  title text default 'BlockID Data Room',
  sections jsonb not null default '{}',
  is_active boolean default true,
  view_count int default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table data_rooms enable row level security;

create table if not exists data_room_views (
  id uuid primary key default gen_random_uuid(),
  data_room_id uuid references data_rooms(id),
  viewer_ip_hash text,
  viewer_email text,
  duration_ms int,
  sections_viewed jsonb,
  viewed_at timestamptz not null default now()
);
alter table data_room_views enable row level security;

create index if not exists idx_data_rooms_token on data_rooms (token);
create index if not exists idx_data_rooms_account on data_rooms (account_id);
create index if not exists idx_data_room_views_room on data_room_views (data_room_id);

-- Fundraise rounds
create table if not exists fundraise_rounds (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  round_name text not null,
  target_amount numeric(14,2) not null,
  pre_money_valuation numeric(14,2) not null,
  instrument_type text not null default 'priced', -- priced, safe, convertible_note
  safe_discount numeric(5,2),
  safe_cap numeric(14,2),
  share_price numeric(10,4),
  new_shares bigint,
  dilution_pct numeric(5,2),
  dilution_table jsonb,
  new_cap_table jsonb,
  status text not null default 'draft', -- draft, active, closed
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
alter table fundraise_rounds enable row level security;

create index if not exists idx_fundraise_rounds_account on fundraise_rounds (account_id);
