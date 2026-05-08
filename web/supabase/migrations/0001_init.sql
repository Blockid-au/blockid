-- =============================================================================
-- BlockID — Phase 1.5 schema (leads + scores + view tracking)
--
-- Run this once against your Supabase project. Two convenient options:
--
--   psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
--
-- or paste the contents into Supabase Studio > SQL Editor > New query > Run.
--
-- All tables have RLS enabled but no policies — the Next.js server uses the
-- service-role key (which bypasses RLS) and the browser never talks to
-- Supabase directly. This is intentional and safer than open public policies.
--
-- Naming: pluralised, snake_case. UUIDs for opaque ids, TEXT for the public
-- shareable score slug (the slug IS the URL — there is no separate id).
-- =============================================================================

-- gen_random_uuid() lives in the pgcrypto extension on older Postgres builds;
-- on Supabase 15+ it ships in core, but the IF NOT EXISTS is harmless.
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- leads — every email captured across the marketing site.
-- source: 'landing_cta_strip' | 'score_intake' | 'dilution_calc' | 'view_link_followup'
-- -----------------------------------------------------------------------------
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  source      text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists leads_email_idx       on public.leads (email);
create index if not exists leads_created_at_idx  on public.leads (created_at desc);

-- -----------------------------------------------------------------------------
-- scores — every Investor-Ready Score computation persisted for the share link.
-- id is the 12-char nanoid slug used in /s/[slug] URLs.
-- -----------------------------------------------------------------------------
create table if not exists public.scores (
  id            text primary key,                       -- 12-char nanoid
  email         text not null,
  company_name  text,
  total_score   int  not null check (total_score between 0 and 100),
  sub_scores    jsonb not null,                         -- { financials, capTable, governance, founder, documentation }
  inputs        jsonb not null,                         -- raw ScoreInput
  created_at    timestamptz not null default now()
);

create index if not exists scores_email_idx       on public.scores (email);
create index if not exists scores_created_at_idx  on public.scores (created_at desc);

-- -----------------------------------------------------------------------------
-- score_views — append-only log of who opened a share link.
-- viewer_ip_hash = sha256(ip + daily salt) so we can count uniques per day
-- without ever storing a raw IP.
-- -----------------------------------------------------------------------------
create table if not exists public.score_views (
  id              uuid primary key default gen_random_uuid(),
  score_id        text not null references public.scores(id) on delete cascade,
  viewer_ip_hash  text,
  viewer_ua       text,
  referer         text,
  viewed_at       timestamptz not null default now()
);

create index if not exists score_views_score_id_viewed_at_idx
  on public.score_views (score_id, viewed_at desc);

-- -----------------------------------------------------------------------------
-- RLS — enabled on all tables, no policies. The server uses the service-role
-- key (bypasses RLS); the browser never connects directly. Adding policies
-- later is a deliberate decision (e.g. when we ship customer-facing dashboards).
-- -----------------------------------------------------------------------------
alter table public.leads        enable row level security;
alter table public.scores       enable row level security;
alter table public.score_views  enable row level security;
