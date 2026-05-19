create table if not exists public.svi_analyses (
  id            text primary key,
  email         text not null,
  raw_input     text not null,
  file_name     text,
  total_svi     integer not null,
  net_adjustment integer not null default 0,
  confidence_multiplier numeric(4,2) not null default 0.20,
  analysis_json jsonb not null,
  svi_version   text not null default '1.0.0',
  viewed_at     timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.svi_analyses enable row level security;
create policy "service role full access" on public.svi_analyses for all using (true);
