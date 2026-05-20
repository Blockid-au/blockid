-- Admin-configurable AI provider keys (runtime override for env vars)
-- Stored encrypted-at-rest in Supabase. Read by ai-client at runtime.
create table if not exists ai_provider_keys (
  provider     text primary key, -- 'anthropic', 'anthropic_proxy', 'openai', 'gemini'
  api_key      text not null,
  base_url     text,             -- for proxy providers
  is_active    boolean not null default true,
  updated_at   timestamptz not null default now(),
  updated_by   text              -- admin email
);

alter table ai_provider_keys enable row level security;

-- Per-user Google Drive folders for document sharing / source of truth
-- Each user+idea gets a dedicated folder in the shared Drive.
alter table svi_analyses add column if not exists drive_folder_id text;
alter table svi_analyses add column if not exists drive_folder_url text;

-- Track user-level drive folder (one per email)
alter table svi_accounts add column if not exists drive_folder_id text;
alter table svi_accounts add column if not exists drive_folder_url text;
