-- 0398 — svi_deck_cache.pipeline_version + tech_audits cache table
--
-- G13-W3-R3 (spec 12-product-ai-tbr-v2.md §C.1 / §C.3 / §C.8): the streaming
-- analysis now runs through the ONE report generator, so the same-deck cache
-- must be keyed by `deck_hash + pipeline_version` — a cached row produced by
-- the previous generator (or an older pipeline version) is never replayed as
-- if it were current. The writer stamps `PIPELINE_VERSION`
-- (src/lib/report-pipeline/orchestrator.ts); the reader treats a NULL or
-- different version as a miss (the row is simply overwritten on the next run).
--
-- `tech_audits` is the 24 h URL-keyed cache for GATHER's deepTechAudit /
-- auditGitHubRepo results (§C.3 "cached result keyed by URL + 24 h"). The
-- spec assumed the table already existed for the dashboard; it did not, so it
-- is created here. GATHER falls back to an in-process memory cache while this
-- migration is pending — nothing breaks without it.
--
-- Idempotent; apply with scripts/db/apply-migration.sh.
BEGIN;

ALTER TABLE public.svi_deck_cache
  ADD COLUMN IF NOT EXISTS pipeline_version text;

CREATE INDEX IF NOT EXISTS idx_svi_deck_cache_hash_version
  ON public.svi_deck_cache (deck_hash, pipeline_version);

CREATE TABLE IF NOT EXISTS public.tech_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  -- "tech" (deepTechAudit on a website) | "repo" (auditGitHubRepo on owner/repo)
  kind text NOT NULL DEFAULT 'tech',
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tech_audits_kind_check CHECK (kind IN ('tech', 'repo'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tech_audits_url_kind
  ON public.tech_audits (url, kind);

CREATE INDEX IF NOT EXISTS idx_tech_audits_created
  ON public.tech_audits (created_at DESC);

ALTER TABLE public.tech_audits ENABLE ROW LEVEL SECURITY;

-- Service-role only (the pipeline runs server-side with the admin client);
-- no anon / authenticated policy on purpose.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tech_audits' AND policyname = 'tech_audits_service_role'
  ) THEN
    CREATE POLICY tech_audits_service_role ON public.tech_audits
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON COLUMN public.svi_deck_cache.pipeline_version IS 'G13-W3-R3: generator version that produced dim_results / criterion_results; cache key = deck_hash + pipeline_version';
COMMENT ON TABLE public.tech_audits IS 'G13-W3-R3: 24 h cache of GATHER tech / repo audits keyed by (url, kind)';

COMMIT;
