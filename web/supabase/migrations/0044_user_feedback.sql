begin;

create table if not exists user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  email text,
  feedback text not null,
  category text default 'general', -- general | bug | feature | ux | pricing | content
  page text, -- which page the feedback was given from
  ai_score integer default 0, -- 0-30 (sum of 3 criteria x 10)
  ai_summary text, -- R&D agent's 1-line summary
  credits_awarded numeric default 0,
  status text default 'received', -- received | rewarded | implemented | dismissed
  admin_notes text,
  created_at timestamptz default now()
);

create index if not exists idx_user_feedback_user on user_feedback(user_id);
create index if not exists idx_user_feedback_status on user_feedback(status);

commit;
