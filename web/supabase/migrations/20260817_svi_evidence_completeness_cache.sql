-- SVI Evidence Completeness Cache Table
-- Purpose: Cached per-project completeness percentages for fast dashboard reads
-- Upserted by computeEvidenceCompleteness.ts after each evidence upload/delete

CREATE TABLE IF NOT EXISTS public.svi_evidence_completeness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  overall_pct integer NOT NULL DEFAULT 0 CHECK (overall_pct BETWEEN 0 AND 100),
  fin_pct integer NOT NULL DEFAULT 0 CHECK (fin_pct BETWEEN 0 AND 100),
  tre_pct integer NOT NULL DEFAULT 0 CHECK (tre_pct BETWEEN 0 AND 100),
  ptd_pct integer NOT NULL DEFAULT 0 CHECK (ptd_pct BETWEEN 0 AND 100),
  cgh_pct integer NOT NULL DEFAULT 0 CHECK (cgh_pct BETWEEN 0 AND 100),
  lco_pct integer NOT NULL DEFAULT 0 CHECK (lco_pct BETWEEN 0 AND 100),
  missing_evidence text[] NOT NULL DEFAULT '{}',
  priority_dimension text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_svi_evidence_completeness_project
  ON public.svi_evidence_completeness (project_id);

-- RLS
ALTER TABLE public.svi_evidence_completeness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "founder_read_own_completeness"
  ON public.svi_evidence_completeness FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "founder_upsert_own_completeness"
  ON public.svi_evidence_completeness FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "founder_update_own_completeness"
  ON public.svi_evidence_completeness FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_completeness"
  ON public.svi_evidence_completeness
  USING (true)
  WITH CHECK (true);
