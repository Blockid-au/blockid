-- Founder profile (T0224, v2.11).
--
-- One row per registered user that captures Antler-style Team-signal evidence:
-- ship history, domain insider connection, ambitions, co-founders, advisors,
-- LinkedIn. Surfaced into SVI analysis input so Team score auto-lifts when
-- the founder fills it in, and on the public /s/[slug] share page so investors
-- see WHO is behind the score, not just the score.

create table if not exists founder_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app_users(id) on delete cascade,
  email text not null,

  full_name text,
  role text,                            -- "CEO & Founder" / "CTO" / etc.
  linkedin_url text,
  bio text,                             -- 1-3 paragraph self-intro

  -- Track record
  prev_employers text[] default '{}',   -- ["Stripe", "Atlassian", "Canva"]
  ship_history text[] default '{}',     -- ["Built X (acquired)", "Shipped Y to 10M users"]
  years_in_domain integer,

  -- Insider connection / ambition narrative
  domain_insight text,                  -- "Spent 8 years on this exact problem at..."
  ambition text,                        -- "Build the category-defining…"

  -- Team
  co_founders jsonb default '[]'::jsonb, -- [{name, role, linkedin, bio}]
  advisors jsonb default '[]'::jsonb,    -- [{name, role, linkedin}]
  notable_hires jsonb default '[]'::jsonb,

  -- Visibility on share page
  public_visible boolean default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint founder_profiles_one_per_user unique (account_id)
);

create index if not exists founder_profiles_email_idx on founder_profiles(email);

-- updated_at auto-touch
create or replace function touch_founder_profiles_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists founder_profiles_touch_updated_at on founder_profiles;
create trigger founder_profiles_touch_updated_at
  before update on founder_profiles
  for each row execute function touch_founder_profiles_updated_at();
