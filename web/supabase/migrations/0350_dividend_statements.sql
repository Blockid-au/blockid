-- 0350_dividend_statements.sql
-- ---------------------------------------------------------------------------
-- S25-B — shareholder dividend (distribution) statements, AU franking.
--
-- Why
--   Roadmap-v2 reconciliation, "Shareholder tax statements (open)": the
--   dividend engine (`lib/dividends.ts`, `dividend_records` 0033) computes
--   per-shareholder payouts with franking credits but nothing produces the
--   distribution statement a company must give each shareholder
--   (ITAA 1997 Subdiv 202-E, s 202-80: entity name + ABN, date paid, amount,
--   franked / unfranked amounts, franking credit, franking percentage,
--   corporate tax rate for imputation, TFN amount withheld, statement date)
--   nor a register of what was issued.
--
-- What
--   `dividend_statements` — one row per (dividend record, shareholder), the
--   payload frozen as issued (the PDF renders from THIS, never a recompute),
--   a public statement number, the SHA-256 of the canonical payload, and a
--   void marker (a voided row is never deleted — a statement once given to a
--   shareholder is a record; re-issuing after a void creates a new row).
--
--     shareholder_key   idempotency key: `id:<shareholders.id>` when the
--                       payout matched a cap-table row, else
--                       `name:<lower-cased payout name>` (payouts on
--                       `dividend_records.payouts` are keyed by name only).
--                       Unique per record among NON-voided rows so "Issue
--                       statements" is safe to press twice.
--     user_id           the caller who issued (owner OR an accepted
--                       editor/admin member) — provenance only. Deliberately
--                       NO foreign key to app_users: a distribution statement
--                       is a financial record the privacy policy keeps for
--                       7 years, and S24-B's erasure map / `erase_account`
--                       RPC (0348) are pinned to the live FK inventory; the
--                       project FK (CASCADE) governs the row's life instead.
--                       (Same stance as 0347 `audit_events`.)
--
--   `dividend_records` gains
--     tfn_withholding_rate  the rate applied to the UNFRANKED part of a
--                           payout to a shareholder with no TFN quoted;
--                           0 = "use the statutory rate at issue" (47 % =
--                           top marginal 45 % + 2 % Medicare levy,
--                           `lib/dividends/statement.ts`).
--     franking_pct          franking percentage of the dividend (100 =
--                           fully franked — every record before 0350 was
--                           computed fully franked by `calculateDividends`).
--     paid_at               date the dividend was / is to be paid (statement
--                           "date of payment"); null → the period's month end.
--
--   `shareholders` gains
--     tfn_on_file           whether the shareholder has quoted a TFN / ABN
--                           to the company. A flag ONLY — BlockID never
--                           stores the TFN itself (Privacy Act 1988, TFN Rule
--                           2015: collect the minimum necessary).
--
-- RLS
--   Enabled. Owner may SELECT their project's statements (through
--   projects.user_id); every write goes through the service role from the
--   statement routes, which resolve member roles via project_members.
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0350_dividend_statements.sql
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. dividend_records: statement inputs ────────────────────────────────────
ALTER TABLE public.dividend_records
  ADD COLUMN IF NOT EXISTS tfn_withholding_rate NUMERIC(5,4) NOT NULL DEFAULT 0
    CHECK (tfn_withholding_rate >= 0 AND tfn_withholding_rate <= 1);
ALTER TABLE public.dividend_records
  ADD COLUMN IF NOT EXISTS franking_pct NUMERIC(5,2) NOT NULL DEFAULT 100
    CHECK (franking_pct >= 0 AND franking_pct <= 100);
ALTER TABLE public.dividend_records
  ADD COLUMN IF NOT EXISTS paid_at DATE;

COMMENT ON COLUMN public.dividend_records.tfn_withholding_rate IS
  'S25-B: rate withheld from the unfranked part paid to a shareholder with no TFN quoted; 0 = statutory rate at issue (47%).';
COMMENT ON COLUMN public.dividend_records.franking_pct IS
  'S25-B: franking percentage (100 = fully franked). Records before 0350 were computed fully franked.';
COMMENT ON COLUMN public.dividend_records.paid_at IS
  'S25-B: date of payment printed on the distribution statement; null → last day of `period`.';

-- ── 2. shareholders: TFN quoted flag (never the number) ─────────────────────
ALTER TABLE public.shareholders
  ADD COLUMN IF NOT EXISTS tfn_on_file BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.shareholders.tfn_on_file IS
  'S25-B: shareholder has quoted a TFN/ABN to the company (flag only — the TFN itself is never stored). false → TFN withholding on the unfranked part.';

-- ── 3. dividend_statements register ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dividend_statements (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL,
  dividend_record_id  UUID        NOT NULL REFERENCES public.dividend_records(id) ON DELETE CASCADE,
  shareholder_id      UUID        REFERENCES public.shareholders(id) ON DELETE SET NULL,
  shareholder_key     TEXT        NOT NULL CHECK (char_length(shareholder_key) BETWEEN 4 AND 240),
  statement_no        TEXT        NOT NULL UNIQUE
                                  CHECK (statement_no ~ '^DS-[0-9A-HJ-NP-Z]{5}-[0-9A-HJ-NP-Z]{5}$'),
  content_hash        TEXT        NOT NULL CHECK (content_hash ~ '^blockid:v1:[0-9a-f]{64}$'),
  payload             JSONB       NOT NULL,
  credits_charged     NUMERIC(8,2) NOT NULL DEFAULT 0,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at           TIMESTAMPTZ,
  void_reason         TEXT        CHECK (void_reason IS NULL OR char_length(void_reason) <= 500),
  CONSTRAINT dividend_statements_void_pair
    CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

-- Idempotency: one LIVE statement per (record, shareholder). A voided row
-- frees the slot so the statement can be re-issued with a new number.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dividend_statements_live
  ON public.dividend_statements (dividend_record_id, shareholder_key)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dividend_statements_project
  ON public.dividend_statements (project_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_dividend_statements_record
  ON public.dividend_statements (dividend_record_id, issued_at DESC);

ALTER TABLE public.dividend_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dividend_statements_owner_select ON public.dividend_statements;
CREATE POLICY dividend_statements_owner_select ON public.dividend_statements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = dividend_statements.project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS dividend_statements_service_all ON public.dividend_statements;
CREATE POLICY dividend_statements_service_all ON public.dividend_statements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.dividend_statements IS
  'S25-B: register of issued shareholder distribution statements (frozen payload + SHA-256 + void marker). One live row per (dividend record, shareholder); written only by service-role routes.';
COMMENT ON COLUMN public.dividend_statements.statement_no IS
  'Public statement number DS-XXXXX-XXXXX printed on the PDF.';
COMMENT ON COLUMN public.dividend_statements.content_hash IS
  'blockid:v1:<sha256 hex> of the canonical (sorted-key) JSON of `payload` — lib/dividends/server.ts.';
COMMENT ON COLUMN public.dividend_statements.payload IS
  'DividendStatementPayload as issued (lib/dividends/statement.ts); the PDF renders from this, never from a recompute.';
COMMENT ON COLUMN public.dividend_statements.shareholder_key IS
  'Idempotency key: id:<shareholders.id> or name:<lower-cased payout name>.';
COMMENT ON COLUMN public.dividend_statements.user_id IS
  'Issuer (owner or accepted editor/admin member). No FK on purpose — financial record kept 7 y; see header.';

NOTIFY pgrst, 'reload schema';
