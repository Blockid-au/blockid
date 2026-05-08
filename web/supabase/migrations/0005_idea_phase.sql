-- =============================================================================
-- BlockID — Idea-Phase Layer (P0)
--
-- Adds the persistence layer for the individual idea-phase top-of-funnel:
--
--   app_users          — lightweight user accounts (custom magic-link auth, not
--                        Supabase Auth — keeps the server-only RLS-bypass model).
--   magic_links        — single-use email tokens; carry the optional pending
--                        pack payload so a "Save Founder Pack" submit can be
--                        completed atomically when the user clicks the link.
--   sessions           — long-lived HttpOnly cookie sessions, opaque token.
--   idea_evaluations   — output of /tools/idea-valuation (one row per submit).
--   equity_splits      — output of /tools/equity-split.
--   funding_plans      — output of /tools/funding-plan.
--   founder_packs      — bundled artifact (idea + split + plan) with shareable
--                        /s/p/[slug] URL and PDF.
--   founder_pack_views — append-only viewer log (mirrors score_views pattern).
--
-- All tables have RLS enabled with no policies — same model as 0001/0004.
-- The Next.js server uses the service-role key; the browser never connects
-- directly. Authorization happens in the route handlers via the session cookie.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- app_users — one row per email that has authenticated. Email is unique +
-- case-insensitive (we lower() at the application layer too as a defence in
-- depth). last_login_at is bumped on each verify; created_at is the signup.
-- -----------------------------------------------------------------------------
create table if not exists public.app_users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  display_name    text,
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

create index if not exists app_users_email_idx on public.app_users (email);

-- -----------------------------------------------------------------------------
-- magic_links — one row per "send me a magic link" request. The token IS the
-- primary key (24-char nanoid, ~140 bits entropy). expires_at is short (15 min)
-- to limit replay; consumed_at flips on first use and the row is never reused.
--
-- pending_payload carries the in-progress idea-phase state captured from the
-- browser at request time (sessionStorage from idea-valuation / equity-split /
-- funding-plan). On verify, the route handler hydrates this payload into the
-- typed tables under the now-authenticated user_id. Empty {} for plain login.
-- -----------------------------------------------------------------------------
create table if not exists public.magic_links (
  token             text primary key,
  email             text not null,
  intent            text not null default 'save_founder_pack'
                    check (intent in ('save_founder_pack','login')),
  pending_payload   jsonb not null default '{}'::jsonb,
  expires_at        timestamptz not null,
  consumed_at       timestamptz,
  created_at        timestamptz not null default now(),
  ip_hash           text
);

create index if not exists magic_links_email_idx       on public.magic_links (email);
create index if not exists magic_links_expires_at_idx  on public.magic_links (expires_at);

-- -----------------------------------------------------------------------------
-- sessions — opaque cookie tokens. 32-char nanoid (~190 bits). 90-day sliding
-- window: last_used_at gets touched on each authenticated request, expires_at
-- is set at create-time and not extended (require fresh login after 90d).
-- -----------------------------------------------------------------------------
create table if not exists public.sessions (
  token         text primary key,
  user_id       uuid not null references public.app_users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  ip_hash       text,
  user_agent    text
);

create index if not exists sessions_user_id_idx     on public.sessions (user_id);
create index if not exists sessions_expires_at_idx  on public.sessions (expires_at);

-- -----------------------------------------------------------------------------
-- idea_evaluations — one row per /tools/idea-valuation submit, scoped to a
-- user. inputs is the typed IdeaValuationInput (see web/src/lib/idea-valuation.ts).
-- valuation_low/mid/high are denormalised for quick listing on the dashboard
-- without re-running computeValuation.
--
-- ai_* columns are populated by the Claude narrative job (P1). They stay null
-- in P0 — added now so the table doesn't need a follow-up migration when P1
-- ships and the AI layer turns on.
-- -----------------------------------------------------------------------------
create table if not exists public.idea_evaluations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.app_users(id) on delete cascade,
  idea_name           text,
  inputs              jsonb not null,
  valuation_low_aud   bigint not null,
  valuation_mid_aud   bigint not null,
  valuation_high_aud  bigint not null,
  factors             jsonb not null default '[]'::jsonb,
  suggestions         jsonb not null default '[]'::jsonb,
  confidence_text     text,
  -- P1 (AI narrative) — null until that ships:
  ai_narrative        text,
  ai_strengths        jsonb,
  ai_risks            jsonb,
  ai_follow_ups       jsonb,
  ai_confidence       text check (ai_confidence in ('low','medium','high')),
  ai_next_action      text,
  ai_model            text,
  ai_generated_at     timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idea_evaluations_user_id_created_at_idx
  on public.idea_evaluations (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- equity_splits — one row per /tools/equity-split submit. founders is the
-- typed FounderInput[] including the new responsibilities/commitments/
-- contribution narrative fields (P1; nullable in P0).
-- allocations + reserves + flags + vesting mirror EquitySplitResult so the
-- dashboard / Founder Pack PDF can render without recomputing.
-- -----------------------------------------------------------------------------
create table if not exists public.equity_splits (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.app_users(id) on delete cascade,
  founders              jsonb not null,
  settings              jsonb not null,
  allocations           jsonb not null,
  reserves              jsonb not null,
  flags                 jsonb not null default '[]'::jsonb,
  vesting               jsonb not null,
  total_points          numeric,
  fairness_narrative    text,    -- P1
  fairness_flags        jsonb,   -- P1
  ai_generated_at       timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists equity_splits_user_id_created_at_idx
  on public.equity_splits (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- funding_plans — one row per /tools/funding-plan submit.
-- -----------------------------------------------------------------------------
create table if not exists public.funding_plans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.app_users(id) on delete cascade,
  inputs              jsonb not null,
  result              jsonb not null,
  total_need_aud      bigint,
  monthly_burn_aud    bigint,
  recommended_raise   bigint,
  created_at          timestamptz not null default now()
);

create index if not exists funding_plans_user_id_created_at_idx
  on public.funding_plans (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- founder_packs — the bundled artifact. slug is the public 12-char nanoid for
-- /s/p/[slug]; same generator (newSlug) as scores. evaluation/split/plan are
-- nullable so a partial pack still saves (e.g. user only completed
-- idea-valuation + equity-split).
--
-- pdf_storage_path is reserved for when we wire Supabase Storage. In P0 the
-- /s/p/[slug]/pdf route renders on demand from the linked rows.
-- -----------------------------------------------------------------------------
create table if not exists public.founder_packs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.app_users(id) on delete cascade,
  slug              text not null unique,
  idea_name         text,
  evaluation_id     uuid references public.idea_evaluations(id) on delete set null,
  split_id          uuid references public.equity_splits(id)    on delete set null,
  funding_id        uuid references public.funding_plans(id)    on delete set null,
  pdf_storage_path  text,
  view_count        int not null default 0,
  last_viewed_at    timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists founder_packs_user_id_created_at_idx
  on public.founder_packs (user_id, created_at desc);
create index if not exists founder_packs_slug_idx
  on public.founder_packs (slug);

-- -----------------------------------------------------------------------------
-- founder_pack_views — append-only viewer log. Mirrors score_views; we hash
-- the IP with the daily-rotating salt from src/lib/iphash.ts.
-- -----------------------------------------------------------------------------
create table if not exists public.founder_pack_views (
  id              uuid primary key default gen_random_uuid(),
  pack_id         uuid not null references public.founder_packs(id) on delete cascade,
  viewer_ip_hash  text,
  viewer_ua       text,
  referer         text,
  viewed_at       timestamptz not null default now()
);

create index if not exists founder_pack_views_pack_id_viewed_at_idx
  on public.founder_pack_views (pack_id, viewed_at desc);

-- -----------------------------------------------------------------------------
-- RLS — enabled, no policies. Same pattern as the rest of the schema.
-- -----------------------------------------------------------------------------
alter table public.app_users          enable row level security;
alter table public.magic_links        enable row level security;
alter table public.sessions           enable row level security;
alter table public.idea_evaluations   enable row level security;
alter table public.equity_splits      enable row level security;
alter table public.funding_plans      enable row level security;
alter table public.founder_packs      enable row level security;
alter table public.founder_pack_views enable row level security;
