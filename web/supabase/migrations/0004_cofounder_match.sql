-- =============================================================================
-- BlockID — Cofounder Match (v1: directory + waitlist)
--
-- Idea-stage AU founders submit a profile (skills, looking-for, idea pitch,
-- location). v1 has no real matching algorithm — we run it as a public
-- directory + private waitlist. Submissions trigger a notification email to
-- the founder + a placeholder admin address.
--
-- Privacy: PII (email, full name, LinkedIn, full pitch) is never rendered on
-- the public directory. Server components anonymize to first name + initial,
-- city, role tags. The full row is only readable via service-role.
--
-- The `flagged_at` and `matched_at` columns are pre-wired for moderation and
-- the eventual matching pipeline so we don't need a follow-up migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- cofounder_profiles — one row per founder profile submission.
-- visibility: 'directory' shows on the anonymized public list,
-- 'private' keeps it server-side only (waitlist match pool).
-- looking_for / i_am are tag arrays (technical / commercial / designer / domain).
-- ip_hash is the daily-rotating sha256 hash from src/lib/iphash.ts; we never
-- store the raw IP.
-- -----------------------------------------------------------------------------
create table if not exists public.cofounder_profiles (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  email           text not null,
  location        text not null,
  looking_for     text[] not null default '{}',
  i_am            text[] not null default '{}',
  skills          text,
  idea_pitch      text,
  time_commitment text not null,
  stage           text not null,
  linkedin_url    text,
  visibility      text not null default 'directory'
                  check (visibility in ('directory','private')),
  ip_hash         text,
  created_at      timestamptz not null default now(),
  flagged_at      timestamptz,
  matched_at      timestamptz
);

create index if not exists cofounder_profiles_created_at_idx
  on public.cofounder_profiles (created_at desc);

create index if not exists cofounder_profiles_visibility_idx
  on public.cofounder_profiles (visibility, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS — enabled with no policies, same pattern as 0001_init.sql / 0003.
-- The Next.js server uses the service-role key (bypasses RLS); the browser
-- never connects directly. Add policies later when customer-facing auth ships.
-- -----------------------------------------------------------------------------
alter table public.cofounder_profiles enable row level security;
