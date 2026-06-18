-- Account types (T_SVI_EXC_0003, v2.18) — distinguish founders / investors / journalists.
-- Investors that admin has verified can unlock founder contact requests.

alter table app_users
  add column if not exists account_type text not null default 'founder',
  add column if not exists investor_firm text,
  add column if not exists investor_url text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references app_users(id);

create index if not exists app_users_account_type_idx on app_users(account_type);
create index if not exists app_users_verified_idx on app_users(account_type, verified_at);

-- account_type must be one of: founder | investor | journalist
alter table app_users
  drop constraint if exists app_users_account_type_check;
alter table app_users
  add constraint app_users_account_type_check check (account_type in ('founder', 'investor', 'journalist'));
