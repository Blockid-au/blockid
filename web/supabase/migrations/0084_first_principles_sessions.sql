-- 0084_first_principles_sessions.sql (T0130 — First-Principles Question Engine)
--
-- Captures each Socratic clarification session so we can post-hoc analyse:
--   * which question categories are answered vs skipped,
--   * which recommended feature actually converts,
--   * where founder ideas cluster (sector detection lives elsewhere).
--
-- All identifier columns are nullable — guest sessions still land here so we
-- keep a full picture of top-of-funnel behaviour. Additive + idempotent.

create table if not exists public.first_principles_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.app_users(id) on delete set null,
  email          text,
  project_id     uuid,
  idea_text      text not null,
  answers        jsonb not null default '{}'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists first_principles_sessions_user_idx
  on public.first_principles_sessions (user_id, created_at desc);

create index if not exists first_principles_sessions_email_idx
  on public.first_principles_sessions (email, created_at desc);

alter table public.first_principles_sessions enable row level security;

drop policy if exists first_principles_sessions_service_all
  on public.first_principles_sessions;
create policy first_principles_sessions_service_all
  on public.first_principles_sessions
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists first_principles_sessions_owner_read
  on public.first_principles_sessions;
create policy first_principles_sessions_owner_read
  on public.first_principles_sessions
  for select
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
