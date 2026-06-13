-- =============================================================================
-- BlockID — Per-investor link v2
--
-- Adds:
--   • founder_user_id  — ties link to an app_users row (nullable for legacy rows)
--   • slug             — human-friendly unique slug for /s/<slug> routing
--   • country          — geo column on investor_link_views
--
-- The token-based /s/i/<token> path remains the canonical URL; slug lets
-- founders share a prettier link when they want one.
-- =============================================================================

-- Add founder_user_id column (nullable — legacy rows have no user account)
ALTER TABLE public.investor_links
  ADD COLUMN IF NOT EXISTS founder_user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL;

-- Add slug column for per-link pretty URLs on /s/<slug>
ALTER TABLE public.investor_links
  ADD COLUMN IF NOT EXISTS slug text;

-- slug must be unique when set
CREATE UNIQUE INDEX IF NOT EXISTS investor_links_slug_idx
  ON public.investor_links (slug)
  WHERE slug IS NOT NULL;

-- Fast lookup by founder user id
CREATE INDEX IF NOT EXISTS investor_links_founder_user_id_idx
  ON public.investor_links (founder_user_id, created_at DESC);

-- Add country geo column to investor_link_views
ALTER TABLE public.investor_link_views
  ADD COLUMN IF NOT EXISTS country text;

-- RLS service-role policy (investor_links already has RLS enabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'investor_links'
      AND policyname = 'investor_links_service_all'
  ) THEN
    CREATE POLICY investor_links_service_all ON public.investor_links
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'investor_link_views'
      AND policyname = 'investor_link_views_service_all'
  ) THEN
    CREATE POLICY investor_link_views_service_all ON public.investor_link_views
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
