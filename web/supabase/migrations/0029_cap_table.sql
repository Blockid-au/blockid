-- Cap table: share classes
create table if not exists share_classes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  name text not null, -- 'Ordinary', 'Preference Series A', etc.
  class_type text not null default 'ordinary', -- ordinary, preference, convertible
  total_authorized bigint not null default 10000000, -- 10M shares default
  price_per_share numeric(10,4) default 0.001,
  voting_rights boolean default true,
  dividend_preference numeric(5,2), -- preference %, null for ordinary
  liquidation_preference numeric(5,2), -- multiple, null for ordinary
  created_at timestamptz not null default now()
);
alter table share_classes enable row level security;

-- Cap table: shareholders
create table if not exists shareholders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  name text not null,
  email text,
  role text default 'founder', -- founder, co-founder, investor, advisor, esop
  share_class_id uuid references share_classes(id),
  shares_held bigint not null default 0,
  ownership_pct numeric(5,2),
  vesting_start date,
  vesting_months int default 48,
  cliff_months int default 12,
  vested_pct numeric(5,2) default 0,
  notes text,
  created_at timestamptz not null default now()
);
alter table shareholders enable row level security;
create index if not exists idx_shareholders_account on shareholders (account_id);

-- Cap table: transactions (share movements)
create table if not exists share_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  transaction_type text not null, -- issue, transfer, vest, exercise, convert
  from_shareholder_id uuid references shareholders(id),
  to_shareholder_id uuid references shareholders(id),
  share_class_id uuid references share_classes(id),
  shares bigint not null,
  price_per_share numeric(10,4),
  total_value numeric(12,2),
  round_name text, -- 'Founding', 'Pre-Seed', 'Seed', etc.
  notes text,
  effective_date date not null default current_date,
  created_at timestamptz not null default now()
);
alter table share_transactions enable row level security;

-- ESOP pool
create table if not exists esop_pool (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique,
  total_pool_shares bigint not null default 0,
  allocated_shares bigint not null default 0,
  pool_pct numeric(5,2) not null default 10.00,
  created_at timestamptz not null default now()
);
alter table esop_pool enable row level security;
