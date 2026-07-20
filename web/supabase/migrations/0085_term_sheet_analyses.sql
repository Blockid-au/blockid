-- Term Sheet AI v2 — persistence extensions.
--
-- Adds per-user history rows: the original raw_text, the full analysis JSON,
-- a denormalised valuation and detected company_name so /workspace/term-sheet
-- and the SVI deep-link CTA can render fast without re-parsing.
--
-- Idempotent w.r.t. 0055_term_sheet_analyses.sql — only ADDs/ALTERs.

ALTER TABLE term_sheet_analyses
  ADD COLUMN IF NOT EXISTS email          text,
  ADD COLUMN IF NOT EXISTS project_id     uuid,
  ADD COLUMN IF NOT EXISTS raw_text       text,
  ADD COLUMN IF NOT EXISTS analysis_json  jsonb,
  ADD COLUMN IF NOT EXISTS valuation_aud  numeric,
  ADD COLUMN IF NOT EXISTS company_name   text;

-- user_id was NOT NULL in 0055 — relax so anonymous email-only rows can land.
ALTER TABLE term_sheet_analyses
  ALTER COLUMN user_id DROP NOT NULL;

-- term_sheet_text_hash was NOT NULL in 0055 — relax so v2 rows can skip it.
ALTER TABLE term_sheet_analyses
  ALTER COLUMN term_sheet_text_hash DROP NOT NULL;

-- result_json was NOT NULL in 0055 — v2 writes analysis_json instead.
ALTER TABLE term_sheet_analyses
  ALTER COLUMN result_json DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_term_sheet_analyses_user_created
  ON term_sheet_analyses(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_term_sheet_analyses_email_created
  ON term_sheet_analyses(email, created_at DESC);

-- Allow the owner to delete their own rows from /workspace/term-sheet.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'term_sheet_analyses'
      AND policyname = 'term_sheet_analyses_owner_delete'
  ) THEN
    EXECUTE 'CREATE POLICY term_sheet_analyses_owner_delete ON term_sheet_analyses
             FOR DELETE TO authenticated
             USING (user_id = auth.uid())';
  END IF;
END $$;
