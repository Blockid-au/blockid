create table if not exists growth_journal (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  email text not null,
  entry_type text not null default 'note', -- note, decision, pivot, milestone, learning, metric
  title text not null,
  content text,
  tags text[] default '{}',
  svi_at_time int, -- SVI score when entry was made
  ai_reflection text, -- AI-generated insight about this entry
  is_public boolean default false, -- visible on public startup profile
  created_at timestamptz not null default now()
);
alter table growth_journal enable row level security;
create index on growth_journal (account_id, created_at desc);
