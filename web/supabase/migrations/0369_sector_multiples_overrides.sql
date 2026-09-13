-- 0369_sector_multiples_overrides.sql
-- ---------------------------------------------------------------------------
-- S27-C — sector revenue-multiple overrides ("Sector-specific multiples
-- auto-updated quarterly", roadmap-v2).
--
-- Why
--   `SECTOR_MULTIPLES` (web/src/lib/valuation/sector-multiples-static.ts,
--   re-exported from lib/agents/cfo-valuation.ts) is a hand-maintained table
--   dated 2026-06. Every valuation surface (VC report, MRR bridge, share
--   price, certificate) multiplies ARR by it. Nothing refreshed it.
--
-- What
--   `sector_multiples_overrides` — one row per proposed change to a sector's
--   {low, mid, high} ARR multiple, carrying the citation it came from:
--
--     sector               key from the static table (CHECK list below mirrors
--                          SECTOR_KEYS; extend both together)
--     arr_low/mid/high     the band (0 < low <= mid <= high <= 200)
--     effective_from       the date the override starts applying (resolver:
--                          latest approved row with effective_from <= today)
--     source_url/title     the public page the numbers were read from
--     source_published_at  date the page states, when it states one
--     source_excerpt       <= 500 chars, verbatim from the fetched page text —
--                          the cron only proposes a row when the excerpt is a
--                          substring of what it actually fetched, and the admin
--                          form requires one too
--     status               proposed | approved | rejected — ONLY approved rows
--                          are ever read by lib/valuation/sector-multiples.ts;
--                          the cron inserts `proposed` and nothing approves
--                          automatically
--     proposed_by          'cron' (quarterly sector-multiples-refresh) or
--                          'admin' (manual "Propose override" form)
--     proposed_by_user_id  the admin who typed a manual proposal — provenance
--                          only, NO FK (mirrors 0360 board_resolutions.user_id;
--                          the audit_events row is the record of who)
--     approved_by          FK → app_users(id) ON DELETE SET NULL. The approver
--                          is an actor on a platform-wide row, so S24-B's
--                          erasure map classifies it `detach` (order 15) —
--                          0370 re-creates erase_account() with the 127-entry
--                          map. Same-admin approval of an admin proposal is
--                          allowed but the audit note flags it.
--     approved_at / rejected_at / review_note
--
--   Rolling back = reject the row (status → rejected; the resolver falls back
--   to the previous approved row or the static table) or approve a newer row
--   with a later effective_from (supersede). Never DELETE — the row is the
--   citation trail behind every valuation that used it.
--
-- RLS
--   Enabled. Service role only: every read of approved rows happens in the
--   server resolver, every write in /api/admin/sector-multiples/** and the
--   cron. No authenticated / anon policy on purpose — the review queue is an
--   admin surface.
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0369_sector_multiples_overrides.sql
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.sector_multiples_overrides (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sector               TEXT          NOT NULL,
  arr_low              NUMERIC(7,2)  NOT NULL,
  arr_mid              NUMERIC(7,2)  NOT NULL,
  arr_high             NUMERIC(7,2)  NOT NULL,
  effective_from       DATE          NOT NULL DEFAULT CURRENT_DATE,
  source_url           TEXT          NOT NULL,
  source_title         TEXT          NOT NULL,
  source_published_at  DATE,
  source_excerpt       TEXT          NOT NULL,
  status               TEXT          NOT NULL DEFAULT 'proposed',
  proposed_by          TEXT          NOT NULL,
  proposed_by_user_id  UUID,
  approved_by          UUID          REFERENCES public.app_users(id) ON DELETE SET NULL,
  approved_at          TIMESTAMPTZ,
  rejected_at          TIMESTAMPTZ,
  review_note          TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT sector_multiples_overrides_sector_check CHECK (sector IN (
    'saas','fintech','marketplace','healthtech','ai','deeptech','ecommerce','cybertech',
    'wealthtech','biotech','cleantech','edtech','proptech','agtech','insurtech','legaltech',
    'gaming','hrtech','mediatech','sportstech','traveltech','logisticstech','retailtech',
    'govtech','constructiontech','spacetech','default'
  )),
  CONSTRAINT sector_multiples_overrides_band_check CHECK (
    arr_low > 0 AND arr_low <= arr_mid AND arr_mid <= arr_high AND arr_high <= 200
  ),
  CONSTRAINT sector_multiples_overrides_status_check CHECK (status IN ('proposed','approved','rejected')),
  CONSTRAINT sector_multiples_overrides_proposed_by_check CHECK (proposed_by IN ('cron','admin')),
  CONSTRAINT sector_multiples_overrides_url_check CHECK (source_url ~* '^https?://'),
  CONSTRAINT sector_multiples_overrides_title_check CHECK (char_length(source_title) BETWEEN 1 AND 200),
  CONSTRAINT sector_multiples_overrides_excerpt_check CHECK (char_length(source_excerpt) BETWEEN 1 AND 500),
  CONSTRAINT sector_multiples_overrides_note_check CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  -- An approved row always says who and when; a rejected row says when.
  CONSTRAINT sector_multiples_overrides_approved_check CHECK (status <> 'approved' OR approved_at IS NOT NULL),
  CONSTRAINT sector_multiples_overrides_rejected_check CHECK (status <> 'rejected' OR rejected_at IS NOT NULL)
);

-- Resolver lookup: approved rows per sector, newest effective date first.
CREATE INDEX IF NOT EXISTS idx_sector_multiples_overrides_resolve
  ON public.sector_multiples_overrides (sector, effective_from DESC, approved_at DESC)
  WHERE status = 'approved';

-- Admin review queue: proposed rows, oldest first.
CREATE INDEX IF NOT EXISTS idx_sector_multiples_overrides_queue
  ON public.sector_multiples_overrides (status, created_at);

-- The cron's dedupe: one open proposal per (sector, source page, band).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sector_multiples_overrides_open_proposal
  ON public.sector_multiples_overrides (sector, source_url, arr_low, arr_mid, arr_high)
  WHERE status = 'proposed';

CREATE OR REPLACE FUNCTION public.sector_multiples_overrides_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sector_multiples_overrides_touch ON public.sector_multiples_overrides;
CREATE TRIGGER trg_sector_multiples_overrides_touch
  BEFORE UPDATE ON public.sector_multiples_overrides
  FOR EACH ROW EXECUTE FUNCTION public.sector_multiples_overrides_touch();

ALTER TABLE public.sector_multiples_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sector_multiples_overrides'
      AND policyname = 'sector_multiples_overrides_service_all'
  ) THEN
    CREATE POLICY sector_multiples_overrides_service_all
      ON public.sector_multiples_overrides
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.sector_multiples_overrides IS
  'S27-C: cited proposals to change a sector ARR-multiple band. Only status=approved rows are read (lib/valuation/sector-multiples.ts); the quarterly cron inserts proposed rows, admins approve/reject at /dashboard/admin/sector-multiples.';
COMMENT ON COLUMN public.sector_multiples_overrides.source_excerpt IS
  'Verbatim substring (<= 500 chars) of the fetched page text the numbers were read from — the cron rejects a proposal whose excerpt is not in the text.';
COMMENT ON COLUMN public.sector_multiples_overrides.approved_by IS
  'Approving admin (FK app_users, SET NULL; erasure map: detach). Same-admin approval of an admin proposal is allowed and flagged in audit_events.';
COMMENT ON COLUMN public.sector_multiples_overrides.proposed_by_user_id IS
  'Admin who typed a manual proposal — provenance only, no FK (the audit_events row is the record).';

NOTIFY pgrst, 'reload schema';
