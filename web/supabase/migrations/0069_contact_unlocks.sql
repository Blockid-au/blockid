-- Contact unlocks (T_SVI_EXC_0005, v2.18) — founder opt-in to receive
-- intro requests from verified investors, plus an audit log of who reached out.

alter table founder_profiles
  add column if not exists contactable_by_investors boolean not null default false;

create table if not exists contact_unlock_requests (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references app_users(id) on delete cascade,
  founder_email text not null,
  ticker text,
  slug text,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists contact_unlock_investor_idx on contact_unlock_requests(investor_id);
create index if not exists contact_unlock_founder_idx on contact_unlock_requests(founder_email);
