-- 0006_google_auth_coupons.sql
-- Adds: Google OAuth fields on app_users, user roles, coupon system.

-- 1. Extend app_users with Google OAuth + role + subscription fields.
alter table app_users
  add column if not exists google_id       text unique,
  add column if not exists avatar_url      text,
  add column if not exists role            text not null default 'user',
  add column if not exists plan            text not null default 'free',
  add column if not exists coupon_code     text,
  add column if not exists discount_pct    smallint not null default 0,
  add column if not exists plan_started_at timestamptz;

-- role: 'user' | 'admin'
-- plan: 'free' | 'founder' | 'growth' | 'pilot' | 'accelerator'

-- 2. Coupons table.
create table if not exists coupons (
  code          text primary key,
  description   text,
  discount_pct  smallint not null default 0,   -- e.g. 50 = 50%
  max_uses      int,                            -- null = unlimited
  current_uses  int not null default 0,
  valid_from    timestamptz not null default now(),
  valid_until   timestamptz,                    -- null = no expiry
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table coupons enable row level security;

-- 3. Seed the WSTI coupon (50% discount).
insert into coupons (code, description, discount_pct, active)
values ('WSTI', 'WSTI partner discount — 50% off all paid plans', 50, true)
on conflict (code) do nothing;

-- 4. Coupon redemption log.
create table if not exists coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id),
  coupon_code text not null references coupons(code),
  plan        text not null,
  original_price_aud  int not null,
  discounted_price_aud int not null,
  redeemed_at timestamptz not null default now()
);

alter table coupon_redemptions enable row level security;
