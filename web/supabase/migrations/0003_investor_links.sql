-- =============================================================================
-- BlockID — Per-investor View Links (Flow 2)
--
-- Replaces the "anonymous /s/[slug]" pattern for shared, attributed reads with
-- a per-investor token. The founder generates one token per investor, sends
-- the unique URL, and gets attributed analytics + a notification when that
-- specific investor opens it.
--
-- The original /s/[slug] anonymous link continues to work for the founder's
-- own preview / PDF download — investor_links is purely additive.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- investor_links — one row per investor a founder shares a score with.
-- token is the 16-char nanoid that becomes part of the URL: /s/i/<token>.
-- We keep founder identity via the email captured during score creation
-- (created_by_email) until proper accounts ship.
-- -----------------------------------------------------------------------------
create table if not exists public.investor_links (
  token             text primary key,                    -- 16-char nanoid
  score_id          text not null references public.scores(id) on delete cascade,
  investor_email    text,
  investor_name     text,
  fund_name         text,
  note              text,
  created_by_email  text not null,                       -- founder email from scores row
  created_at        timestamptz not null default now(),
  expires_at        timestamptz,
  revoked_at        timestamptz
);

create index if not exists investor_links_score_id_idx
  on public.investor_links (score_id, created_at desc);

create index if not exists investor_links_created_by_email_idx
  on public.investor_links (created_by_email);

-- -----------------------------------------------------------------------------
-- investor_link_views — append-only opens of a per-investor link.
-- Mirrors score_views shape but keyed on the token so we can attribute opens
-- to a specific investor record. score_id is denormalised for fast joins.
-- -----------------------------------------------------------------------------
create table if not exists public.investor_link_views (
  id              uuid primary key default gen_random_uuid(),
  link_token      text not null references public.investor_links(token) on delete cascade,
  score_id        text not null references public.scores(id) on delete cascade,
  viewer_ip_hash  text,
  viewer_ua       text,
  referer         text,
  duration_ms     int,
  viewed_at       timestamptz not null default now()
);

create index if not exists investor_link_views_token_viewed_at_idx
  on public.investor_link_views (link_token, viewed_at desc);

create index if not exists investor_link_views_score_viewed_at_idx
  on public.investor_link_views (score_id, viewed_at desc);

-- -----------------------------------------------------------------------------
-- RLS — enabled with no policies, same pattern as 0001_init.sql.
-- The Next.js server uses the service-role key (bypasses RLS); the browser
-- never connects directly. Add policies later when customer-facing auth ships.
-- -----------------------------------------------------------------------------
alter table public.investor_links       enable row level security;
alter table public.investor_link_views  enable row level security;
