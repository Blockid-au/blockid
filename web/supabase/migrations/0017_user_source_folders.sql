-- User source folders: external Drive/document references for SVI analysis context.
-- Each user can link multiple folders as "source of truth" for their analyses.

create table if not exists user_source_folders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_users(id) on delete cascade,
  email         text not null,
  folder_type   text not null default 'drive',  -- 'drive', 'blockid', 'dataroom'
  folder_id     text not null,                   -- Google Drive folder ID
  folder_url    text,                            -- Google Drive folder URL
  label         text not null,                   -- user-friendly name
  is_active     boolean not null default true,   -- included in analysis context
  svi_dimension text,                            -- optional: map to specific SVI dimension
  created_at    timestamptz not null default now()
);

alter table user_source_folders enable row level security;
create index if not exists idx_user_source_folders_user on user_source_folders (user_id, is_active);
create index if not exists idx_user_source_folders_email on user_source_folders (email);

-- Data room files: structured copy of user documents organized by SVI dimension
create table if not exists dataroom_files (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references app_users(id) on delete cascade,
  email           text not null,
  svi_dimension   text not null,  -- ftv, mpc, ptd, tre, cgh, iri, lco, svm
  file_name       text not null,
  drive_file_id   text,           -- Google Drive file ID
  drive_file_url  text,
  source_folder_id uuid references user_source_folders(id) on delete set null,
  file_size_bytes bigint,
  mime_type       text,
  status          text not null default 'pending', -- pending, indexed, analyzed
  created_at      timestamptz not null default now()
);

alter table dataroom_files enable row level security;
create index if not exists idx_dataroom_files_user on dataroom_files (user_id, svi_dimension);

-- Add source_folders_enabled flag to svi_accounts
alter table svi_accounts add column if not exists source_folders_enabled boolean not null default false;
