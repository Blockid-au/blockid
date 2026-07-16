-- 0073_user_segments_and_jurisdiction.sql
-- Upgrade v2 W1: user segment + jurisdiction + wholesale status
-- ADDITIVE ONLY. No drops, no NOT NULL on existing columns.

-- 1. segment (extends account_type; account_type kept for backwards compat)
alter table app_users
  add column if not exists segment text default 'founder';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_segment_check'
  ) then
    alter table app_users
      add constraint app_users_segment_check
      check (segment in ('founder','investor_angel','investor_vc','advisor','accelerator','lp','admin'));
  end if;
end $$;

-- 2. jurisdiction (ISO 3166-1 alpha-2, default AU)
alter table app_users
  add column if not exists jurisdiction text default 'AU';

alter table app_users
  add column if not exists jurisdiction_source text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_jurisdiction_source_check'
  ) then
    alter table app_users
      add constraint app_users_jurisdiction_source_check
      check (jurisdiction_source is null or jurisdiction_source in ('ip','declared','billing','manual'));
  end if;
end $$;

-- 3. wholesale investor certification status (Corporations Act s708(8)/(11))
alter table app_users
  add column if not exists wholesale_status text default 'unknown';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_wholesale_status_check'
  ) then
    alter table app_users
      add constraint app_users_wholesale_status_check
      check (wholesale_status in ('unknown','retail','wholesale_certified'));
  end if;
end $$;

-- 4. legal_review_passed flag (CLO-gated releases)
alter table app_users
  add column if not exists legal_review_passed boolean default false;

-- 5. Backfill segment from existing account_type
update app_users
   set segment = case
     when account_type = 'founder' then 'founder'
     when account_type = 'investor' then 'investor_angel'
     when account_type = 'journalist' then 'founder'
     else coalesce(segment, 'founder')
   end
 where segment is null or segment = 'founder';

-- 6. Indexes
create index if not exists app_users_segment_idx on app_users(segment);
create index if not exists app_users_jurisdiction_idx on app_users(jurisdiction);
create index if not exists app_users_wholesale_status_idx on app_users(wholesale_status);
