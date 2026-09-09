-- 0129_published_analyses.sql
-- ---------------------------------------------------------------------------
-- Turn a completed /analyze run into a public, indexable company profile —
-- but only when the founder deliberately asks for it.
--
-- Why a side table rather than more columns on `analyses`
--   `analyses` is the private record of a run. Everything on it is derived
--   from whatever the founder pasted, uploaded or linked, so no column on it
--   is safe to render publicly by default: `input_text` is the raw pitch
--   deck, `input_filename` is their file, `intake` carries per-slide splits.
--   Publishing therefore needs a SECOND, separate set of fields that the
--   founder typed *for publication* — company name, one-liner, sector,
--   website. Those live here. The public page renders these plus the derived
--   score/valuation summary in `analyses.svi`, and nothing else.
--
-- Consent model — the 0122 precedent, unchanged
--   `analyses.public_visible` (0124, `not null default false`) stays the
--   single authoritative switch. Publishing sets it true; unpublishing sets
--   it false and stamps `unpublished_at`. The row here is KEPT on unpublish
--   so a founder who republishes gets the same URL back instead of silently
--   minting a second one, but `v_published_analysis` requires BOTH
--   `public_visible = true` AND `unpublished_at is null`, so an unpublished
--   profile is invisible the instant the flag flips.
--
-- Defence in depth
--   `v_published_analysis` is the only relation the public page reads. It
--   physically cannot emit `anon_key`, `input_text`, `input_url`,
--   `input_filename`, `intake` or `user_id`, so a future `select *` slip on
--   the read path cannot leak a founder's raw input or identity.
--
-- Also retires the three seeded "(sample)" listings — see the block at the
-- bottom for the reasoning.
--
-- Apply:
--   docker exec -i supabase-db psql -U postgres -d postgres < 0129_published_analyses.sql
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.published_analyses (
  analysis_id        uuid primary key
                       references public.analyses (id) on delete cascade,
  user_id            uuid not null
                       references public.app_users (id) on delete cascade,
  slug               text not null unique,
  company_name       text not null,
  one_liner          text not null,
  sector             text not null,
  website_url        text,
  first_published_at timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unpublished_at     timestamptz,

  -- Lowercase kebab only. Keeps the slug namespace disjoint from the legacy
  -- uppercase ticker namespace that /listings used to serve, and keeps the
  -- URL stable under case-normalising proxies.
  constraint published_analyses_slug_shape
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 64),
  constraint published_analyses_name_len
    check (char_length(company_name) between 2 and 80),
  -- A 60-character floor on founder-written prose is the cheapest available
  -- guard against near-duplicate doorway pages: every published URL carries
  -- at least one paragraph nobody else wrote.
  constraint published_analyses_one_liner_len
    check (char_length(one_liner) between 60 and 240),
  constraint published_analyses_sector_len
    check (char_length(sector) between 2 and 40)
);

create index if not exists published_analyses_user_idx
  on public.published_analyses (user_id);
create index if not exists published_analyses_sector_idx
  on public.published_analyses (sector);
create index if not exists published_analyses_live_idx
  on public.published_analyses (updated_at desc)
  where unpublished_at is null;

-- Service-role only. The app reaches this table exclusively through
-- getSupabaseAdmin(); no anon or authenticated client has any business
-- writing a public listing directly.
alter table public.published_analyses enable row level security;
revoke all on public.published_analyses from anon, authenticated;

comment on table public.published_analyses is
  'Founder-authored public fields for an opted-in /analyze run. analyses.public_visible remains the authoritative on/off switch.';

-- ---------------------------------------------------------------------------
-- The public read surface. Whitelist only.
-- ---------------------------------------------------------------------------

create or replace view public.v_published_analysis as
select
  p.slug,
  p.company_name,
  p.one_liner,
  p.sector,
  p.website_url,
  p.first_published_at,
  p.updated_at,
  a.id                as analysis_id,
  a.stage,
  a.stage_label,
  a.svi_total,
  a.valuation_mid_aud,
  a.svi,
  a.created_at        as analysed_at
from public.published_analyses p
join public.analyses a on a.id = p.analysis_id
where a.public_visible = true
  and p.unpublished_at is null;

comment on view public.v_published_analysis is
  'Public company profiles. Emits founder-authored fields plus the derived score summary only — never anon_key, user_id, input_text, input_url, input_filename or intake.';

-- ---------------------------------------------------------------------------
-- Retire the seeded sample listings.
--
-- 20260907_sample_listings_seed.sql put three invented companies into
-- startup_listings so /listings had something to render. They are the only
-- rows the table has ever held: `public_index_submissions` has 0 rows, so no
-- real founder has ever listed. Every one of them points its website_url back
-- at blockid.au.
--
-- A directory of three fake companies is worse than an honest empty state:
-- it is the exact fabricated-entity pattern search engines penalise, it
-- misrepresents traction to anyone who lands on it, and it would sit in the
-- sitemap alongside the real profiles this migration enables. Deleted.
-- startup_listing_events cascades (0 rows).
-- ---------------------------------------------------------------------------

delete from public.startup_listings
 where ticker in ('SAMPLE-01', 'SAMPLE-02', 'SAMPLE-03');

delete from public.app_users
 where id = '00000000-0000-0000-0000-0000000005a1'::uuid
   and email = 'samples@blockid.au';

commit;

notify pgrst, 'reload schema';
