-- SVI API subscription keys (T_SVI_EXC_0014, v2.19)
-- Institutional/data API tier separate from the BlockID founder API.
-- Tiers: free (10/day), team (1k/day, A$199/mo), institutional (unlimited, A$2k/mo)

create table if not exists svi_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  key_hash text not null unique,           -- SHA-256 of raw key
  key_prefix text not null,                -- first 16 chars + "..." for display
  name text not null default 'Default',
  tier text not null default 'free',       -- free | team | institutional
  -- Stripe subscription
  stripe_subscription_id text,
  stripe_customer_id text,
  -- daily rate tracking
  calls_today int not null default 0,
  calls_today_date date not null default current_date,
  -- lifecycle
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists svi_api_keys_user_idx on svi_api_keys(user_id);
create index if not exists svi_api_keys_hash_idx on svi_api_keys(key_hash);

-- daily limit by tier
-- free: 10, team: 1000, institutional: unlimited (9999999)
create or replace function svi_api_daily_limit(tier text) returns int language sql immutable as $$
  select case tier
    when 'team' then 1000
    when 'institutional' then 9999999
    else 10
  end
$$;
