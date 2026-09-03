-- Wave 25 Phase A: Trusted Business Report persistence + shareable links.
--
-- Adds three columns to svi_snapshots so the full 13-criteria + 8-dim TBR can
-- survive beyond the 30-minute localStorage TTL, and so founders can hand an
-- investor a public read-only URL:
--
--   criterion_results  — CriterionState[] array (13 items) from the
--                        criteria_synthesis SSE event. NULL when the run
--                        pre-dates Wave 24 or the synthesis step failed.
--   dim_results        — Record<DimKey, DimState> serialised from the client
--                        so the report can rehydrate the full markdown /
--                        insights / market benchmark for every dim, not just
--                        scores + priorities like dimension_scores does.
--   report_share_token — Opaque 24-char token that maps a public URL
--                        (/tbr/<token>) to this snapshot. UNIQUE so we can
--                        look up snapshots directly by token. Nullable — most
--                        snapshots will never be shared.

ALTER TABLE public.svi_snapshots
  ADD COLUMN IF NOT EXISTS criterion_results  JSONB,
  ADD COLUMN IF NOT EXISTS dim_results        JSONB,
  ADD COLUMN IF NOT EXISTS report_share_token TEXT;

-- Enforce token uniqueness lazily (allows NULL for un-shared snapshots).
CREATE UNIQUE INDEX IF NOT EXISTS idx_svi_snapshots_share_token
  ON public.svi_snapshots (report_share_token)
  WHERE report_share_token IS NOT NULL;

-- Fast lookup of the most-recent snapshot per project for the TBR API
-- fallback (localStorage → GET /api/svi/report/[projectId]).
CREATE INDEX IF NOT EXISTS idx_svi_snapshots_project_created
  ON public.svi_snapshots (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
