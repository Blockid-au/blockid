-- 0212_evidence_extractions.sql
-- v3 Master Upgrade Plan Phase 3 §12.4 / §5.2 lane 0210-0212 / §5.3
-- structured extraction output pinned to a specific evidence version.
--
-- Purpose: OCR / LLM / manual-reviewer output for one specific
-- (evidence_id, evidence_version_id) tuple. Pinning to a version is
-- critical — if the founder re-uploads a corrected PDF, the old
-- extraction row is retained but no longer represents "current
-- truth"; the new upload creates a new evidence_versions row and a
-- fresh extraction row references it. Reports cite via
-- (extraction_id, raw_snippet) so citations remain reproducible.
--
-- extractor: text tag identifying the pipeline. Canonical values in
-- this phase:
--   tesseract-ocr       — OCR pass on scanned PDFs / images
--   AIR-002-evidence-v1 — LLM evidence-classifier (§6 dimensions)
--   manual              — human reviewer entered structured data
--
-- dimension: which of the 12 analysis areas this extraction feeds
-- (see §6 of the Master Plan). Nullable because pure OCR text has no
-- single dimension yet — it becomes dimensioned when a classifier
-- runs downstream.
--
-- Idempotency: DDL uses IF NOT EXISTS. RLS enabled defense-in-depth.

BEGIN;

CREATE TABLE IF NOT EXISTS public.evidence_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  evidence_id uuid NOT NULL
    REFERENCES public.evidence(id) ON DELETE CASCADE,
  evidence_version_id uuid NOT NULL
    REFERENCES public.evidence_versions(id) ON DELETE CASCADE,

  -- Pipeline identity. Both required so a re-run with a new prompt
  -- version can coexist with the historical row (audit trail).
  extractor text NOT NULL,
  extractor_version text NOT NULL,

  -- Structured output — schema is intentionally free-form. Each
  -- extractor documents its own shape; downstream consumers Zod-parse
  -- what they need.
  structured jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Model self-reported confidence in [0, 1]. Drives the
  -- classified → validation_required split in the state machine
  -- (see web/src/lib/evidence/state-machine.ts).
  confidence numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1),

  -- Which of the 12 §6 analysis dimensions this row feeds
  -- (identity, governance, financials, product, traction, market,
  -- team, tech, risk, ip, compliance, esg). Nullable for raw-OCR
  -- rows that have not been classified yet.
  dimension text,

  -- Verbatim excerpt used when a report cites this extraction. Kept
  -- as text so downstream renderers can quote it directly without
  -- re-reading the source binary.
  raw_snippet text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_extractions_evidence_extractor_idx
  ON public.evidence_extractions (evidence_id, extractor);

CREATE INDEX IF NOT EXISTS evidence_extractions_version_idx
  ON public.evidence_extractions (evidence_version_id);

ALTER TABLE public.evidence_extractions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.evidence_extractions IS
  'OCR/LLM/manual structured output pinned to (evidence_id, evidence_version_id). Reports cite via (id, raw_snippet) for reproducibility. Master Upgrade Plan Phase 3 §12.4 / §5.3 / §6.';

COMMENT ON COLUMN public.evidence_extractions.evidence_version_id IS
  'The specific evidence_versions row this extraction was computed against. Re-uploading the source doc creates a new evidence_versions row and requires a fresh extraction — old rows are retained for audit.';

COMMENT ON COLUMN public.evidence_extractions.confidence IS
  'Extractor self-reported confidence in [0, 1]. Drives the classified → validation_required split in web/src/lib/evidence/state-machine.ts.';

COMMENT ON COLUMN public.evidence_extractions.dimension IS
  'Which of the 12 §6 analysis dimensions this row feeds. Nullable for raw-OCR rows awaiting downstream classification.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
