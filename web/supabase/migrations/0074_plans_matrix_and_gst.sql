-- 0074_plans_matrix_and_gst.sql
-- Upgrade v2 W1: DB-driven plans matrix + GST config
-- ADDITIVE ONLY.

-- 1. plans table
create table if not exists plans (
  id text primary key,
  segment text not null,
  name text,
  description text,
  price_aud_cents integer,
  annual_price_aud_cents integer,
  interval text check (interval in ('once','monthly','yearly','custom')),
  trial_days integer default 0,
  stripe_price_id text,
  stripe_price_id_annual text,
  feature_flags jsonb default '[]'::jsonb,
  usage_limits jsonb default '{}'::jsonb,
  active boolean default true,
  sort_order integer default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists plans_segment_idx on plans(segment);
create index if not exists plans_active_idx on plans(active);

alter table plans enable row level security;

drop policy if exists plans_public_read on plans;
create policy plans_public_read on plans
  for select using (active = true);

drop policy if exists plans_service_write on plans;
create policy plans_service_write on plans
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 2. Seed 12 SKUs per cfo-spec pricing matrix
insert into plans (id, segment, name, price_aud_cents, annual_price_aud_cents, interval, trial_days, feature_flags, usage_limits, sort_order)
values
  -- Founder tier
  ('founder_free',       'founder', 'Founder Free',       0,      null,   'monthly', 0,
   '["profile.basic","svi.basic"]'::jsonb,
   '{"profiles":1,"svi_per_month":3,"monthly_credits":25,"report_pages":10}'::jsonb, 10),
  ('founder_starter',    'founder', 'Founder Starter',    2900,   29000,  'monthly', 14,
   '["profile.basic","svi.full","data_room.basic"]'::jsonb,
   '{"profiles":1,"svi_per_month":10,"monthly_credits":75,"report_pages":30}'::jsonb, 20),
  ('founder_growth',     'founder', 'Founder Growth',     9900,   99000,  'monthly', 14,
   '["profile.multi","cap_table.write","data_room.access","investor_links.premium","term_sheet_ai"]'::jsonb,
   '{"profiles":3,"svi_per_month":50,"monthly_credits":200,"report_pages":100}'::jsonb, 30),
  ('founder_scale',      'founder', 'Founder Scale',      29900,  299000, 'monthly', 14,
   '["profile.multi","cap_table.write","data_room.pro","investor_links.premium","term_sheet_ai","esop.on_chain","brand.whitelabel"]'::jsonb,
   '{"profiles":10,"svi_per_month":200,"monthly_credits":800,"report_pages":250}'::jsonb, 40),
  ('founder_enterprise', 'founder', 'Founder Enterprise', null,   null,   'custom',  0,
   '["profile.unlimited","cap_table.write","data_room.pro","investor_links.premium","term_sheet_ai","esop.on_chain","brand.whitelabel","sso","dedicated_support"]'::jsonb,
   '{"profiles":-1,"svi_per_month":-1,"monthly_credits":-1,"report_pages":-1}'::jsonb, 50),

  -- Investor tier
  ('investor_angel',     'investor_angel', 'Investor Angel',    7900,   79000,  'monthly', 14,
   '["watchlist.premium","contact_unlock","secondary_market.view"]'::jsonb,
   '{"watchlist_size":50,"contact_unlocks_month":10,"monthly_credits":150}'::jsonb, 110),
  ('investor_advisor',   'advisor',        'Advisor',           14900,  149000, 'monthly', 14,
   '["advisor_portal","watchlist.premium","contact_unlock","cap_table.read"]'::jsonb,
   '{"portfolio_companies":25,"contact_unlocks_month":25,"monthly_credits":300}'::jsonb, 120),
  ('investor_vc_small',  'investor_vc',    'VC Small Fund',     34900,  349000, 'monthly', 14,
   '["watchlist.premium","contact_unlock","secondary_market.trade","deal_flow.export","team_seats:5"]'::jsonb,
   '{"team_seats":5,"contact_unlocks_month":100,"monthly_credits":1000}'::jsonb, 130),
  ('investor_vc_ent',    'investor_vc',    'VC Enterprise',     null,   null,   'custom',  0,
   '["watchlist.unlimited","contact_unlock","secondary_market.trade","deal_flow.export","team_seats:unlimited","sso","api.full"]'::jsonb,
   '{"team_seats":-1,"contact_unlocks_month":-1,"monthly_credits":-1}'::jsonb, 140),

  -- Accelerator tier
  ('accelerator_starter',    'accelerator', 'Accelerator Starter',    50000,   500000,  'monthly', 30,
   '["cohort.manage","brand.whitelabel","reports.batch"]'::jsonb,
   '{"cohort_size":20,"monthly_credits":2000}'::jsonb, 210),
  ('accelerator_growth',     'accelerator', 'Accelerator Growth',     150000,  1500000, 'monthly', 30,
   '["cohort.manage","brand.whitelabel","reports.batch","mentor_portal","lp_reporting"]'::jsonb,
   '{"cohort_size":100,"monthly_credits":8000}'::jsonb, 220),
  ('accelerator_enterprise', 'accelerator', 'Accelerator Enterprise', 350000,  3500000, 'monthly', 30,
   '["cohort.unlimited","brand.whitelabel","reports.batch","mentor_portal","lp_reporting","sso","api.full","dedicated_support"]'::jsonb,
   '{"cohort_size":-1,"monthly_credits":-1}'::jsonb, 230)
on conflict (id) do nothing;

-- 3. GST config (ATO threshold A$75,000 = 7,500,000 cents; 10% rate)
create table if not exists gst_config (
  id integer primary key default 1,
  threshold_aud_cents integer default 7500000,
  rate numeric(5,4) default 0.10,
  registered boolean default false,
  abn text,
  effective_from timestamptz,
  updated_at timestamptz default now(),
  constraint gst_config_singleton check (id = 1)
);

insert into gst_config (id, threshold_aud_cents, rate, registered, abn)
values (1, 7500000, 0.10, false, '79659615111')
on conflict (id) do nothing;

alter table gst_config enable row level security;

drop policy if exists gst_config_service_all on gst_config;
create policy gst_config_service_all on gst_config
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 4. Active plans view
create or replace view v_plans_active as
  select * from plans where active = true order by sort_order, id;
