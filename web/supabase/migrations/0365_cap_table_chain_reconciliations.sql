-- 0365_cap_table_chain_reconciliations.sql
-- ---------------------------------------------------------------------------
-- S27-B — chain → cap-table read-back + reconciliation.
--
-- Why
--   Blockchain sync has been one-way since 0034: the register pushes
--   mint / transfer / vest events onto `blockchain_sync_queue` and nothing
--   ever reads the deployed share-token contract back to check the two
--   still agree. A failed or skipped queue event, a MetaMask transfer made
--   outside the dashboard, or a manual mint by the founder wallet drifts
--   silently. This table keeps one row per reconciliation run so the
--   cap-table page can show "On-chain vs register" and the weekly
--   `chain-reconcile` cron can notify the founder on drift.
--
-- What
--   `cap_table_chain_reconciliations` — one row per run (route POST or the
--   Sunday cron), keyed on the project. `summary` is the pure
--   `reconcileCapTable()` output (lib/onchain/read-back.ts): matched rows,
--   drift rows, holders unknown to the register, register holders missing
--   on chain, and the totals. `status`:
--
--     in_sync      every wallet-backed register row equals its balance
--     drift        at least one delta / unknown / missing row
--     unreachable  the RPC host could not be read — summary carries the
--                  error text only; no drift notification is sent
--
--   No `app_users` FK on purpose (the run is a project-level fact; the
--   project CASCADE governs its life) — the S24-B erasure map is untouched.
--
-- RLS
--   Enabled. Owner may SELECT their project's runs (projects.user_id);
--   writes go through the service role from the route / cron only.
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0365_cap_table_chain_reconciliations.sql
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.cap_table_chain_reconciliations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  taken_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  token_address  TEXT,
  status         TEXT        NOT NULL CHECK (status IN ('in_sync', 'drift', 'unreachable')),
  drift_count    INTEGER     NOT NULL DEFAULT 0 CHECK (drift_count >= 0),
  summary        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  source         TEXT        NOT NULL DEFAULT 'route' CHECK (source IN ('route', 'cron'))
);

CREATE INDEX IF NOT EXISTS idx_ct_chain_recon_project_taken
  ON public.cap_table_chain_reconciliations (project_id, taken_at DESC);

ALTER TABLE public.cap_table_chain_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ct_chain_recon_owner_select ON public.cap_table_chain_reconciliations;
CREATE POLICY ct_chain_recon_owner_select ON public.cap_table_chain_reconciliations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = cap_table_chain_reconciliations.project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ct_chain_recon_service_all ON public.cap_table_chain_reconciliations;
CREATE POLICY ct_chain_recon_service_all ON public.cap_table_chain_reconciliations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.cap_table_chain_reconciliations IS
  'S27-B: one row per chain → register reconciliation run (route POST or weekly chain-reconcile cron); summary = reconcileCapTable() output; status in_sync | drift | unreachable.';
COMMENT ON COLUMN public.cap_table_chain_reconciliations.summary IS
  'ReconcileResult from lib/onchain/read-back.ts: { matched, driftRows, unknownOnChain, missingOnChain, totals } — or { error } when unreachable.';

NOTIFY pgrst, 'reload schema';
