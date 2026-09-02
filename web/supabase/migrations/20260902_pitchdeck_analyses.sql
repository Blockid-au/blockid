-- =============================================================================
-- Pitchdeck coverage-gated analyses — Wave 11
--
-- Founder uploads a deck → server extracts text + classifies each of the 8
-- SVI dimensions as `strong`, `partial`, or `missing` based on evidence in
-- the deck. UI shows the coverage heatmap; founder picks which missing
-- dimensions to analyze anyway (charged credits) vs. supplement with extra
-- evidence (free). Selected dims run through the existing streaming SVI
-- pipeline; the final weighted SVI is snapshotted.
--
-- Idempotent: `IF NOT EXISTS` on the table + all indexes so re-runs are safe.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pitchdeck_analyses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id     uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  -- Original filename (display) + storage path/URL from /api/upload.
  filename       text NOT NULL,
  storage_url    text NOT NULL,
  -- Truncated extracted text (40 KiB cap matches runner extractFileText()).
  extracted_text text NOT NULL DEFAULT '',
  text_bytes     integer NOT NULL DEFAULT 0,
  -- Per-dim coverage classification result. Shape:
  --   { ftv: {level: 'strong'|'partial'|'missing', excerpt: '...'}, ... }
  dim_coverage   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Dims the founder asked the analyzer to run (subset of the 8 DIM_KEYS).
  selected_dims  text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Credit charge for the "analyze anyway" speculative dims.
  credits_spent  numeric(10,2) NOT NULL DEFAULT 0,
  -- Final weighted SVI once the streaming analyzer completes (nullable
  -- because the founder can stop between classify and analyze).
  final_svi      integer,
  status         text NOT NULL DEFAULT 'classified'
                 CHECK (status IN ('classified','analyzing','done','error','cancelled')),
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pitchdeck_analyses_user_created
  ON public.pitchdeck_analyses (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pitchdeck_analyses_project
  ON public.pitchdeck_analyses (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

-- Update trigger keeps updated_at fresh for optimistic-concurrency UIs.
CREATE OR REPLACE FUNCTION public.pitchdeck_analyses_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pitchdeck_analyses_touch_updated_at ON public.pitchdeck_analyses;
CREATE TRIGGER pitchdeck_analyses_touch_updated_at
  BEFORE UPDATE ON public.pitchdeck_analyses
  FOR EACH ROW EXECUTE FUNCTION public.pitchdeck_analyses_touch_updated_at();

-- RLS: founders read/write their own rows; service role bypasses.
ALTER TABLE public.pitchdeck_analyses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pitchdeck_analyses'
      AND policyname = 'pitchdeck_analyses_owner_all'
  ) THEN
    CREATE POLICY pitchdeck_analyses_owner_all
      ON public.pitchdeck_analyses
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pitchdeck_analyses'
      AND policyname = 'pitchdeck_analyses_service_all'
  ) THEN
    CREATE POLICY pitchdeck_analyses_service_all
      ON public.pitchdeck_analyses
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
