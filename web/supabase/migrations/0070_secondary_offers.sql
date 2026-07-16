-- Secondary offer intake (T_SVI_EXC_0012, v2.18) — founder declares an intent
-- to sell a secondary parcel to verified sophisticated investors.

create table if not exists secondary_offers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app_users(id) on delete cascade,
  ticker text not null,
  slug text,
  -- offer terms
  shares_for_sale bigint,                  -- number of shares
  price_band_low_aud numeric,              -- indicative low
  price_band_high_aud numeric,             -- indicative high
  total_raise_aud numeric,                 -- max raise = shares × high
  lock_up_months int default 12,
  buyer_profile text,                      -- description of ideal buyer
  eligible_investor_type text not null default 'sophisticated',
  -- status
  status text not null default 'draft',    -- draft | live | closed | withdrawn
  -- metadata
  notes text,
  admin_notes text,
  reviewed_by uuid references app_users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, ticker, status)
);

create index if not exists secondary_offers_ticker_idx on secondary_offers(ticker);
create index if not exists secondary_offers_status_idx on secondary_offers(status);
create index if not exists secondary_offers_account_idx on secondary_offers(account_id);
