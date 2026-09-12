-- 0349_connector_snapshots.sql
-- ---------------------------------------------------------------------------
-- S25-A — weekly connector resync: dated metric snapshots + resync leases.
--
-- Why
--   Roadmap-v2 reconciliation 2026-09-11, "Stripe/Xero/QuickBooks connectors
--   (partial: one-shot pull at callback, no resync)": the OAuth callbacks
--   pull MRR / P&L once and never again, so `svi_signals.mrr_aud` and the
--   `xero_revenue` evidence row go stale silently and the S17-B valuation
--   bridge starts ignoring them after 90 days. The weekly
--   `api/cron/connector-resync` re-pulls with the connector's own token and
--   keeps a dated history here so growth (MRR now vs ~90 d ago) and churn
--   can feed the SVI contribution table (lib/svi/connected-revenue-score.ts)
--   and the P&L page can label every figure with its source and date.
--
-- What
--   `connector_snapshots`
--     id          uuid pk
--     user_id     the project OWNER (the same user_id `svi_signals` is keyed
--                 on) — never the member who linked the account
--     project_id  null for legacy no-project rows
--     provider    'stripe' | 'xero'
--     taken_at    when the pull happened
--     metrics     jsonb — Stripe: { mrrAud, arrAud, activeSubscriptions,
--                 activeCustomers, churnedSubscriptions90d, churnRate90dPct,
--                 currency }; Xero: { totalIncomeAud, totalExpensesAud,
--                 netProfitAud, bankBalanceAud, windowMonths, tenantName }
--     source      'callback' | 'resync' — which writer produced the row
--
--   Resync leases on the two connection tables (the batch-runner pattern,
--   0325): a tick claims a row with `UPDATE … WHERE resync_leased_until IS
--   NULL OR resync_leased_until < now()` so an overlapping tick never pulls
--   the same account twice; `resync_last_at` orders candidates oldest-first.
--
-- RLS
--   Enabled. Owner may SELECT their own rows (auth.uid() = user_id); every
--   write is a service-role route (the cron + the callbacks). No anon access.
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0349_connector_snapshots.sql
--   (runs in one transaction, records the ledger row, NOTIFY pgrst reload).
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.connector_snapshots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id  UUID        REFERENCES public.projects(id) ON DELETE CASCADE,
  provider    TEXT        NOT NULL CHECK (provider IN ('stripe', 'xero')),
  taken_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  source      TEXT        NOT NULL DEFAULT 'resync' CHECK (source IN ('callback', 'resync')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Latest snapshot per (owner, project, provider)" and "the one ~90 d ago".
CREATE INDEX IF NOT EXISTS idx_connector_snapshots_scope_taken
  ON public.connector_snapshots (user_id, project_id, provider, taken_at DESC);

ALTER TABLE public.connector_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'connector_snapshots'
      AND policyname = 'connector_snapshots_owner_select'
  ) THEN
    CREATE POLICY connector_snapshots_owner_select
      ON public.connector_snapshots
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

COMMENT ON TABLE public.connector_snapshots IS
  'S25-A: dated metric snapshots from Stripe Connect / Xero (weekly resync + callback). Owner read via RLS; writes are service-role only.';
COMMENT ON COLUMN public.connector_snapshots.metrics IS
  'Stripe: mrrAud, arrAud, activeSubscriptions, activeCustomers, churnedSubscriptions90d, churnRate90dPct, currency. Xero: totalIncomeAud, totalExpensesAud, netProfitAud, bankBalanceAud, windowMonths, tenantName.';

-- Resync lease columns on both connection vaults (the v2 vault written by
-- lib/oauth-connectors.ts and the legacy account_id-keyed table the
-- /api/oauth/* callbacks still write).
ALTER TABLE public.oauth_connections_v2
  ADD COLUMN IF NOT EXISTS resync_leased_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resync_last_at TIMESTAMPTZ;

ALTER TABLE public.oauth_connections
  ADD COLUMN IF NOT EXISTS resync_leased_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resync_last_at TIMESTAMPTZ;

COMMENT ON COLUMN public.oauth_connections_v2.resync_leased_until IS
  'S25-A: api/cron/connector-resync lease (15 min); a tick claims a row only when this is NULL or in the past.';
COMMENT ON COLUMN public.oauth_connections_v2.resync_last_at IS
  'S25-A: last successful or failed resync attempt; candidates are ordered oldest-first.';

NOTIFY pgrst, 'reload schema';
