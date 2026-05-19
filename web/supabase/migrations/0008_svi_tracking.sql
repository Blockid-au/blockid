-- SVI accounts (one per founder email)
create table if not exists public.svi_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  startup_name text,
  current_stage integer not null default 0,
  current_svi integer not null default 100,
  plan text not null default 'free', -- 'free' | 'founding50' | 'pro'
  enrolled_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Weekly SVI snapshots (for delta calculation)
create table if not exists public.svi_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.svi_accounts(id) on delete cascade,
  svi_total integer not null,
  stage integer not null,
  analysis_json jsonb,
  snapshot_date date not null default current_date,
  delta integer, -- difference from prior snapshot (null for first)
  created_at timestamptz not null default now(),
  unique(account_id, snapshot_date)
);

-- Evidence items (each piece of evidence uploaded/connected)
create table if not exists public.svi_evidence (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.svi_accounts(id) on delete cascade,
  evidence_type text not null, -- 'document_uploaded' | 'public_url' | 'connected_source' | etc.
  label text not null,
  value_or_url text,
  confidence_level text not null default 'self_declared',
  dimension text, -- 'ftv' | 'mpc' | 'ptd' | 'tre' | 'cgh' | 'iri' | 'lco' | 'svm'
  svi_impact integer, -- estimated SVI points from this evidence
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- Notifications log
create table if not exists public.svi_notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.svi_accounts(id) on delete cascade,
  notification_type text not null, -- 'welcome' | 'weekly_report' | 'milestone' | 'score_dropped' | 'inactive'
  subject text,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  payload jsonb
);

-- Milestone badges
create table if not exists public.svi_milestones (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.svi_accounts(id) on delete cascade,
  badge_code text not null, -- e.g. 'first_revenue', 'cap_table_clean', 'investor_ready'
  badge_label text not null,
  achieved_at timestamptz not null default now(),
  unique(account_id, badge_code)
);

-- Indexes for performance
create index if not exists idx_svi_snapshots_account_date on public.svi_snapshots(account_id, snapshot_date desc);
create index if not exists idx_svi_evidence_account on public.svi_evidence(account_id);
create index if not exists idx_svi_notifications_account on public.svi_notifications(account_id, sent_at desc);
create index if not exists idx_svi_milestones_account on public.svi_milestones(account_id);

-- Row-level security (disabled for service role usage)
alter table public.svi_accounts enable row level security;
alter table public.svi_snapshots enable row level security;
alter table public.svi_evidence enable row level security;
alter table public.svi_notifications enable row level security;
alter table public.svi_milestones enable row level security;
