-- Growth Intelligence: stores daily computed funnel metrics + AI recommendations.
-- Populated by /api/cron/growth-insights (daily cron).

create table if not exists growth_insights (
  id           uuid primary key default gen_random_uuid(),
  insight_date date not null unique,

  -- Funnel metrics (counts)
  visitors_total     int not null default 0,
  svi_started        int not null default 0,
  svi_completed      int not null default 0,
  signups            int not null default 0,
  leads_captured     int not null default 0,
  checkouts_started  int not null default 0,
  checkouts_completed int not null default 0,
  evidence_uploaded  int not null default 0,
  scores_shared      int not null default 0,

  -- Revenue
  revenue_aud        numeric(10,2) not null default 0,
  paying_users       int not null default 0,

  -- Conversion rates (pre-computed %)
  svi_start_rate     numeric(5,2) default 0,
  svi_complete_rate  numeric(5,2) default 0,
  signup_rate        numeric(5,2) default 0,
  checkout_rate      numeric(5,2) default 0,
  payment_rate       numeric(5,2) default 0,

  -- AI recommendations (JSON array of { priority, title, detail, impact, action_type })
  recommendations    jsonb not null default '[]'::jsonb,

  -- Segment breakdown (JSON: { free, founding50, founder, growth, pilot, accelerator })
  plan_distribution  jsonb not null default '{}'::jsonb,

  -- Top drop-off point
  biggest_drop_off   text,
  drop_off_rate      numeric(5,2) default 0,

  created_at         timestamptz not null default now()
);

alter table growth_insights enable row level security;

-- Index for quick range queries
create index if not exists idx_growth_insights_date on growth_insights (insight_date desc);
