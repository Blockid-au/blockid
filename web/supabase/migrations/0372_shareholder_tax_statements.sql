-- 0372_shareholder_tax_statements.sql
-- ---------------------------------------------------------------------------
-- S28-A — shareholder annual (financial-year) tax statements.
--
-- Why
--   Roadmap "Shareholder tax statements": S25-B (0350) issues one
--   distribution statement per dividend, but at tax time a shareholder
--   needs ONE summary for the Australian financial year (1 Jul – 30 Jun):
--   total franked / unfranked dividends, franking credits, TFN amounts
--   withheld, the number of distributions and each payment date — the
--   figures they carry into their return (and the company may report to
--   the ATO).
--
-- What
--   `shareholder_tax_statements` — one CURRENT row per (project, financial
--   year, shareholder), the payload frozen as generated (the PDF renders
--   from THIS, never a recompute), a per-project statement number
--   `TS-<FY>-<n>`, the SHA-256 of the canonical payload, and the S27-A
--   version / superseded pattern of `board_resolutions` (0361): a
--   regenerate supersedes the current row and inserts version n+1 — an
--   annual statement once given to a shareholder is never deleted.
--
--     fy               'YYYY-YY' label of the financial year (2025-26 =
--                      1 Jul 2025 – 30 Jun 2026).
--     shareholder_key  same idempotency key as dividend_statements
--                      (`id:<shareholders.id>` / `name:<lower-cased name>`).
--     totals           the FY totals (jsonb) — indexed copy of
--                      payload.totals for lists without parsing the payload.
--     user_id          the caller who generated — provenance only.
--                      Deliberately NO foreign key to app_users (financial
--                      record kept 7 y; same stance as 0350 / 0360; keeps
--                      the S24-B erasure map untouched).
--
-- RLS
--   Enabled. Owner may SELECT their project's statements (through
--   projects.user_id); every write goes through the service role.
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0372_shareholder_tax_statements.sql
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.shareholder_tax_statements (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID         NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id          UUID         NOT NULL,
  fy               TEXT         NOT NULL CHECK (fy ~ '^[0-9]{4}-[0-9]{2}$'),
  shareholder_id   UUID         REFERENCES public.shareholders(id) ON DELETE SET NULL,
  shareholder_key  TEXT         NOT NULL CHECK (char_length(shareholder_key) BETWEEN 4 AND 240),
  statement_no     TEXT         NOT NULL CHECK (statement_no ~ '^TS-[0-9]{4}-[0-9]{2}-[0-9]{1,6}$'),
  content_hash     TEXT         NOT NULL CHECK (content_hash ~ '^blockid:v1:[0-9a-f]{64}$'),
  totals           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  payload          JSONB        NOT NULL,
  credits_charged  NUMERIC(8,2) NOT NULL DEFAULT 0,
  version          INTEGER      NOT NULL DEFAULT 1 CHECK (version >= 1),
  issued_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  superseded_at    TIMESTAMPTZ,
  superseded_by    UUID         REFERENCES public.shareholder_tax_statements(id) ON DELETE SET NULL
);

-- One CURRENT statement per (project, FY, shareholder); superseded rows stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shareholder_tax_statements_current
  ON public.shareholder_tax_statements (project_id, fy, shareholder_key)
  WHERE superseded_at IS NULL;

-- Statement numbers are per project (TS-2025-26-1 exists in every company).
CREATE UNIQUE INDEX IF NOT EXISTS uq_shareholder_tax_statements_no
  ON public.shareholder_tax_statements (project_id, statement_no);

CREATE INDEX IF NOT EXISTS idx_shareholder_tax_statements_project_fy
  ON public.shareholder_tax_statements (project_id, fy, issued_at DESC);

ALTER TABLE public.shareholder_tax_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shareholder_tax_statements_owner_select ON public.shareholder_tax_statements;
CREATE POLICY shareholder_tax_statements_owner_select ON public.shareholder_tax_statements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = shareholder_tax_statements.project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS shareholder_tax_statements_service_all ON public.shareholder_tax_statements;
CREATE POLICY shareholder_tax_statements_service_all ON public.shareholder_tax_statements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.shareholder_tax_statements IS
  'S28-A: shareholder annual (financial-year) tax statements — frozen payload + SHA-256, versioned (regenerate supersedes). One current row per (project, fy, shareholder); written only by service-role routes.';
COMMENT ON COLUMN public.shareholder_tax_statements.fy IS
  'Australian financial year label YYYY-YY (2025-26 = 1 Jul 2025 – 30 Jun 2026).';
COMMENT ON COLUMN public.shareholder_tax_statements.statement_no IS
  'Per-project statement number TS-<FY>-<n> printed on the PDF.';
COMMENT ON COLUMN public.shareholder_tax_statements.payload IS
  'ShareholderTaxStatementPayload as generated (lib/dividends/fy-summary.ts); the PDF renders from this, never from a recompute.';
COMMENT ON COLUMN public.shareholder_tax_statements.user_id IS
  'Generator (owner or accepted editor/admin member). No FK on purpose — financial record kept 7 y; see header.';

NOTIFY pgrst, 'reload schema';
