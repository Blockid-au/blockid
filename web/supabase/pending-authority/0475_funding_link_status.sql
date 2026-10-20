-- 0475 — au_grants / au_programs official_url link status (20/10/2026, W1 links,
-- docs/pricing-v5-plan.md § 5). PROPOSED — NOT APPLIED. Renumber if 0474/0475
-- are taken by the time it is admitted (0474 is reserved for pricing v5).
--
-- Why: the weekly job scripts/funding-link-health.mjs finds programmes whose
-- official_url is dead (e.g. capitalangels.com.au 503 for days, two
-- enterprize.space 404s). The only lever today is status_confidence='low'
-- (needs review). The directories cannot hide a dead programme without a
-- column that says so — `status` is the programme's own state
-- (open/closed/paused/upcoming) and must not be overloaded with link health.
--
-- Additive only:
--   link_status       text  'ok' | 'broken' | 'unverifiable' (NULL = never checked)
--   link_checked_at   timestamptz
--   link_broken_since timestamptz — first failed weekly check of the current URL
--
-- Once applied, `node scripts/funding-link-health.mjs --apply` detects the
-- column and writes all three for every checked row (it already writes
-- status_confidence='low' for rows broken ≥ 7 days). Hiding is a follow-up
-- app change: the public directory loaders (src/lib/funding/data.ts) filter
-- `link_status = 'broken' and link_broken_since < now() - interval '7 days'`.
-- Retained releases never select these columns and are unaffected. No
-- personal data, no FKs, no RLS change (public read policy already covers
-- the rows; writes stay service-role only).
BEGIN;

ALTER TABLE public.au_grants
  ADD COLUMN IF NOT EXISTS link_status text,
  ADD COLUMN IF NOT EXISTS link_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS link_broken_since timestamptz;

ALTER TABLE public.au_programs
  ADD COLUMN IF NOT EXISTS link_status text,
  ADD COLUMN IF NOT EXISTS link_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS link_broken_since timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'au_grants_link_status_check') THEN
    ALTER TABLE public.au_grants
      ADD CONSTRAINT au_grants_link_status_check CHECK (link_status IS NULL OR link_status IN ('ok', 'broken', 'unverifiable'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'au_programs_link_status_check') THEN
    ALTER TABLE public.au_programs
      ADD CONSTRAINT au_programs_link_status_check CHECK (link_status IS NULL OR link_status IN ('ok', 'broken', 'unverifiable'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS au_programs_link_broken_idx
  ON public.au_programs (link_broken_since)
  WHERE link_status = 'broken';

COMMENT ON COLUMN public.au_programs.link_status IS
  'W1: weekly official_url health (scripts/funding-link-health.mjs): ok | broken | unverifiable (403/429 bot wall); NULL = never checked.';
COMMENT ON COLUMN public.au_grants.link_status IS
  'W1: weekly official_url health (scripts/funding-link-health.mjs): ok | broken | unverifiable (403/429 bot wall); NULL = never checked.';

COMMIT;

NOTIFY pgrst, 'reload schema';
