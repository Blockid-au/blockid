-- Term Sheet AI v2 — persistent analysis store
-- Saves every authenticated analysis so founders can re-open their redline
-- and so BlockID can surface "Investor-Ready Score" context.

CREATE TABLE IF NOT EXISTS term_sheet_analyses (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- SHA-256 hex of the raw term sheet text — lets us detect duplicate submissions
  -- without storing the PII-laden text itself.
  term_sheet_text_hash text       NOT NULL,

  -- Full v2 TermSheetAnalysis JSON as returned by Claude / demo fallback.
  result_json         jsonb       NOT NULL,

  -- Top-level summary fields denormalised for fast dashboard queries.
  risk_level_summary  text        CHECK (risk_level_summary IN ('low', 'medium', 'high', 'critical')),
  valuation_cap       numeric,    -- AUD, nullable
  discount_rate       numeric,    -- percentage, nullable
  pro_rata            boolean     -- nullable
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_term_sheet_analyses_user
  ON term_sheet_analyses(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_term_sheet_analyses_hash
  ON term_sheet_analyses(term_sheet_text_hash);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE term_sheet_analyses ENABLE ROW LEVEL SECURITY;

-- Service role (server-side API routes) has full access.
CREATE POLICY term_sheet_analyses_service_all ON term_sheet_analyses
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can read their own rows only.
CREATE POLICY term_sheet_analyses_owner_select ON term_sheet_analyses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
