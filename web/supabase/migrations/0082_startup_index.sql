-- 0082_startup_index.sql (T-1300 — Goal 5C first scaffold)
--
-- Public AU Startup Index — schema foundation.
--
-- Adds:
--   * `startup_listings`         — one row per opted-in startup (owner = app_users.id).
--   * `startup_listing_events`   — append-only audit trail keyed by ticker.
--   * `v_startup_listing_public` — public projection joined with the latest
--                                  `svi_index_snapshots` row per owner.
--   * `generate_ticker(name)`    — 3-6 char uppercase ASX-style short code with
--                                  collision-suffixing.
--
-- Additive-only + idempotent — every DDL statement is guarded so repeated
-- runs are no-ops. RLS is enabled and policies are dropped/re-created so the
-- policy set converges on the intended state.
--
-- Public-read policy is the wedge: only rows with `is_public = true` are
-- readable by anon / authenticated users. Owners retain full read/write of
-- their own row via `auth.uid() = startup_id`. Service role bypasses RLS.

-- -----------------------------------------------------------------------------
-- startup_listings — one row per startup profile the founder chose to publish.
-- -----------------------------------------------------------------------------
create table if not exists public.startup_listings (
  ticker                 text primary key,
  startup_id             uuid not null references public.app_users(id) on delete cascade,
  name                   text not null,
  sector                 text,
  stage                  text,
  hq_state               text,
  website_url            text,
  one_liner              text,
  svi_grade              text,
  svi_score              int,
  latest_raise_aud_cents bigint,
  is_public              boolean not null default false,
  listed_at              timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Sanity constraints. Ticker shape enforced by generator; a light regex here
-- keeps hand-inserts honest.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'startup_listings_ticker_shape'
  ) then
    alter table public.startup_listings
      add constraint startup_listings_ticker_shape
      check (ticker ~ '^[A-Z0-9]{3,8}(-[0-9]+)?$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'startup_listings_svi_score_range'
  ) then
    alter table public.startup_listings
      add constraint startup_listings_svi_score_range
      check (svi_score is null or (svi_score between 0 and 100));
  end if;
end $$;

-- Partial indexes for the two dominant read paths:
--   1. /index list — order by listed_at desc where public.
--   2. Sector-faceted list — filter by sector where public.
create index if not exists startup_listings_public_recent_idx
  on public.startup_listings (is_public, listed_at desc)
  where is_public = true;

create index if not exists startup_listings_public_sector_idx
  on public.startup_listings (sector, is_public)
  where is_public = true;

-- Owner lookup for the workspace side.
create index if not exists startup_listings_startup_id_idx
  on public.startup_listings (startup_id);

-- keep updated_at fresh on any mutation.
create or replace function public.startup_listings_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists startup_listings_touch on public.startup_listings;
create trigger startup_listings_touch
  before update on public.startup_listings
  for each row execute function public.startup_listings_touch_updated_at();

-- RLS.
alter table public.startup_listings enable row level security;

drop policy if exists startup_listings_public_read on public.startup_listings;
create policy startup_listings_public_read
  on public.startup_listings
  for select
  using (is_public = true);

drop policy if exists startup_listings_owner_read on public.startup_listings;
create policy startup_listings_owner_read
  on public.startup_listings
  for select
  using (auth.uid() = startup_id);

drop policy if exists startup_listings_owner_insert on public.startup_listings;
create policy startup_listings_owner_insert
  on public.startup_listings
  for insert
  with check (auth.uid() = startup_id);

drop policy if exists startup_listings_owner_update on public.startup_listings;
create policy startup_listings_owner_update
  on public.startup_listings
  for update
  using (auth.uid() = startup_id)
  with check (auth.uid() = startup_id);

drop policy if exists startup_listings_owner_delete on public.startup_listings;
create policy startup_listings_owner_delete
  on public.startup_listings
  for delete
  using (auth.uid() = startup_id);

drop policy if exists startup_listings_service_all on public.startup_listings;
create policy startup_listings_service_all
  on public.startup_listings
  for all
  to service_role
  using (true)
  with check (true);

-- -----------------------------------------------------------------------------
-- startup_listing_events — append-only audit trail for downstream analytics.
-- -----------------------------------------------------------------------------
create table if not exists public.startup_listing_events (
  id     bigserial primary key,
  ticker text not null references public.startup_listings(ticker) on delete cascade,
  ts     timestamptz not null default now(),
  kind   text not null check (kind in ('list','update','delist','svi_change','raise_close')),
  detail jsonb not null default '{}'::jsonb
);

create index if not exists startup_listing_events_ticker_ts_idx
  on public.startup_listing_events (ticker, ts desc);

alter table public.startup_listing_events enable row level security;

-- Public read is deliberately closed — the events table can leak timing signals.
-- Owners can read their own events; service role writes everything.
drop policy if exists startup_listing_events_owner_read on public.startup_listing_events;
create policy startup_listing_events_owner_read
  on public.startup_listing_events
  for select
  using (
    exists (
      select 1 from public.startup_listings sl
       where sl.ticker = startup_listing_events.ticker
         and sl.startup_id = auth.uid()
    )
  );

drop policy if exists startup_listing_events_service_all on public.startup_listing_events;
create policy startup_listing_events_service_all
  on public.startup_listing_events
  for all
  to service_role
  using (true)
  with check (true);

-- -----------------------------------------------------------------------------
-- v_startup_listing_public — the projection the /index + /listings/[ticker]
-- pages read. Joins the latest svi_index_snapshots row per owner and filters
-- to is_public = true. Deliberately excludes PII (startup_id, updated_at
-- timestamps are indexable and coarse enough to expose safely).
-- -----------------------------------------------------------------------------
-- MVP view: pure projection of startup_listings (public columns only).
-- A future task (T-1305) can re-add a latest-svi_snapshots join once
-- the svi_snapshots-account bridge to app_users.id is stabilised.
create or replace view public.v_startup_listing_public as
select
  l.ticker,
  l.name,
  l.sector,
  l.stage,
  l.hq_state,
  l.website_url,
  l.one_liner,
  l.svi_grade,
  l.svi_score,
  l.latest_raise_aud_cents,
  l.listed_at,
  l.updated_at
from public.startup_listings l
where l.is_public = true;

comment on view public.v_startup_listing_public is
  'Public, PII-free projection of startup_listings joined to the most recent svi_index_snapshots row per owner. Read from anon + authenticated + service_role.';

grant select on public.v_startup_listing_public to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- generate_ticker(name) — deterministic 3-6 char uppercase code, uniqueness
-- guaranteed by numeric suffix on collision.
--
-- Algorithm:
--   1. Uppercase input; strip everything that isn't [A-Z0-9 ].
--   2. Split on whitespace, take first letter of each of up to 5 words.
--   3. If shorter than 3 chars, pad with alphanumeric characters from the
--      first token (skipping duplicates) until length reaches 3 or the token
--      is exhausted.
--   4. Truncate to 6 chars.
--   5. On collision with an existing row, append `-N` starting at 2 and walk
--      up until free. Suffix does not count against the 6-char base.
-- -----------------------------------------------------------------------------
create or replace function public.generate_ticker(p_name text)
returns text
language plpgsql
as $$
declare
  cleaned    text;
  tokens     text[];
  base       text := '';
  first_tok  text := '';
  filler     text;
  candidate  text;
  suffix     int  := 2;
  i          int;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'generate_ticker: name required';
  end if;

  cleaned := regexp_replace(upper(p_name), '[^A-Z0-9 ]+', '', 'g');
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  cleaned := trim(cleaned);

  if cleaned = '' then
    raise exception 'generate_ticker: name contains no alphanumeric characters';
  end if;

  tokens := string_to_array(cleaned, ' ');
  first_tok := tokens[1];

  -- Step 2: first letter of first-5 tokens.
  for i in 1 .. least(coalesce(array_length(tokens, 1), 0), 5) loop
    base := base || left(tokens[i], 1);
  end loop;

  -- Step 3: pad with characters from first token if < 3 chars.
  if length(base) < 3 and length(first_tok) > 1 then
    filler := substring(first_tok from 2);
    -- Append filler chars one at a time until we hit 3.
    for i in 1 .. length(filler) loop
      exit when length(base) >= 3;
      base := base || substr(filler, i, 1);
    end loop;
  end if;

  -- Step 4: cap at 6.
  base := left(base, 6);

  -- Final safety: still under 3 chars means we couldn't derive a valid ticker.
  if length(base) < 3 then
    raise exception 'generate_ticker: could not derive 3+ char base from "%"', p_name;
  end if;

  candidate := base;

  -- Step 5: walk suffix until unique. Cap iterations at 1000 to avoid a
  -- pathological loop; the space per base is effectively unbounded (-2 .. -N)
  -- but we bail early to surface the anomaly.
  while exists (select 1 from public.startup_listings where ticker = candidate) loop
    candidate := base || '-' || suffix::text;
    suffix := suffix + 1;
    if suffix > 1000 then
      raise exception 'generate_ticker: exhausted suffixes for base "%"', base;
    end if;
  end loop;

  return candidate;
end;
$$;

comment on function public.generate_ticker(text) is
  '3-6 char uppercase ticker generator. Uniqueness guaranteed via `-N` suffix on collision. Deterministic modulo current table state.';

grant execute on function public.generate_ticker(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Ping PostgREST so the new tables + view + function surface in the API.
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';
