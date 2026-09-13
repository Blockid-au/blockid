-- 0374_drip_allocations.sql
-- ---------------------------------------------------------------------------
-- S28-A — dividend reinvestment plan (DRIP) allocations.
--
-- Why
--   When distribution statements are issued for a dividend record and a
--   shareholder holds an active DRIP election (0373), the issue flow
--   (lib/dividends/server.ts) computes
--
--     reinvested = net cash × participation %      (cents)
--     price      = share price mid (S26-B) or the manual plan price
--     shares     = floor(reinvested ÷ price)
--     residual   = reinvested − shares × price      (paid in cash)
--
--   and records the result here, alongside the share-issue transaction it
--   writes to the cap table (`share_transactions`, transaction_type
--   'issue', round_name 'DRIP <period>') — the same row the S26-B
--   share-issue board resolution is generated from.
--
-- What
--   `drip_allocations` — one row per (dividend record, shareholder). Keyed
--   on the RECORD (not only the statement) so a statement that is voided
--   and re-issued reuses the allocation — the shares were already issued
--   once and must never be allotted twice.
--
--     status   'recorded' — shares written to the cap table;
--              'skipped'  — no usable price (zero / missing), the whole
--                           dividend was paid in cash; kept for the audit
--                           trail with `skip_reason`.
--
-- RLS
--   Enabled. Owner may SELECT their project's allocations; every write goes
--   through the service role.
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0374_drip_allocations.sql
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.drip_allocations (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             UUID          NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  dividend_record_id     UUID          NOT NULL REFERENCES public.dividend_records(id) ON DELETE CASCADE,
  dividend_statement_id  UUID          REFERENCES public.dividend_statements(id) ON DELETE SET NULL,
  election_id            UUID          REFERENCES public.drip_elections(id) ON DELETE SET NULL,
  shareholder_id         UUID          REFERENCES public.shareholders(id) ON DELETE SET NULL,
  shareholder_key        TEXT          NOT NULL CHECK (char_length(shareholder_key) BETWEEN 4 AND 240),
  share_transaction_id   UUID          REFERENCES public.share_transactions(id) ON DELETE SET NULL,
  status                 TEXT          NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'skipped')),
  skip_reason            TEXT          CHECK (skip_reason IS NULL OR char_length(skip_reason) <= 200),
  participation_pct      NUMERIC(5,2)  NOT NULL CHECK (participation_pct >= 0 AND participation_pct <= 100),
  price_basis            TEXT          NOT NULL CHECK (price_basis IN ('share_price_mid', 'manual')),
  net_cash_aud           NUMERIC(14,2) NOT NULL DEFAULT 0,
  price_aud              NUMERIC(14,6) NOT NULL DEFAULT 0 CHECK (price_aud >= 0),
  shares                 BIGINT        NOT NULL DEFAULT 0 CHECK (shares >= 0),
  reinvested_aud         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reinvested_aud >= 0),
  residual_aud           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (residual_aud >= 0),
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- One allocation per (record, shareholder) — a re-issued statement reuses it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_drip_allocations_record_shareholder
  ON public.drip_allocations (dividend_record_id, shareholder_key);

CREATE INDEX IF NOT EXISTS idx_drip_allocations_project
  ON public.drip_allocations (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drip_allocations_statement
  ON public.drip_allocations (dividend_statement_id);

ALTER TABLE public.drip_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drip_allocations_owner_select ON public.drip_allocations;
CREATE POLICY drip_allocations_owner_select ON public.drip_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = drip_allocations.project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS drip_allocations_service_all ON public.drip_allocations;
CREATE POLICY drip_allocations_service_all ON public.drip_allocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.drip_allocations IS
  'S28-A: DRIP allocations made when distribution statements are issued — shares, price, amount reinvested, residual cash, and the share_transactions row written to the cap table. One per (dividend record, shareholder).';
COMMENT ON COLUMN public.drip_allocations.share_transaction_id IS
  'The share_transactions issue row (round_name DRIP <period>) — the record_id the S26-B share-issue board resolution is generated from.';
COMMENT ON COLUMN public.drip_allocations.status IS
  'recorded = shares written to the cap table; skipped = no usable price, paid in cash (skip_reason).';

NOTIFY pgrst, 'reload schema';
