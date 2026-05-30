begin;

create table if not exists agent_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  agent_role text not null,
  topic text not null,
  content text not null,
  source text,
  confidence numeric default 0.5,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_agent_kb_role on agent_knowledge_base(agent_role);

create table if not exists agent_report_tasks (
  id uuid primary key default gen_random_uuid(),
  report_id uuid,
  agent_role text not null,
  criterion text,
  status text default 'pending',
  input_context jsonb default '{}'::jsonb,
  output_content text,
  score numeric,
  duration_ms integer,
  created_at timestamptz default now(),
  completed_at timestamptz
);
create index if not exists idx_agent_tasks_report on agent_report_tasks(report_id);

create table if not exists assembled_reports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references svi_accounts(id) on delete cascade,
  user_id uuid references app_users(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  tier text default 'standard',
  title text,
  executive_summary text,
  markdown text,
  quality_score numeric,
  total_words integer,
  agent_contributions jsonb default '{}'::jsonb,
  consistency_issues jsonb default '[]'::jsonb,
  charts jsonb default '[]'::jsonb,
  status text default 'draft',
  created_at timestamptz default now()
);
create index if not exists idx_assembled_reports_account on assembled_reports(account_id);

commit;
