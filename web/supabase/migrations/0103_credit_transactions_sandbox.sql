-- Migration 0103 — add public.credit_transactions.sandbox boolean.
--
-- Unlocks the D3-CISO-05 sandbox-scope filter chip on /admin/credits
-- (iteration-9 admin isSandbox fanout follow-up). The chip is shipped as
-- "display-only" today because the underlying tables lack a per-row
-- sandbox flag; adding the column here lets applySandboxScopeToQuery()
-- from web/src/lib/admin/sandbox-scope.ts filter credit_transactions
-- with its default column = "sandbox" (no code change needed).
--
-- Apply convention (per repo memory: no auto-apply on deploy):
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     < web/supabase/migrations/0103_credit_transactions_sandbox.sql
--
-- All statements guard with IF NOT EXISTS so the file is safe to re-run.
--
-- Note on write-path population
-- -----------------------------
-- Today, reseller-sandbox spend routes through
-- reseller_credit_grants(kind='sandbox_spend') and never inserts into
-- credit_transactions (see trySpendSandboxCredits in web/src/lib/credits.ts).
-- The DEFAULT false on this column is therefore the correct steady-state
-- value for the current spend paths. The backfill UPDATE below is a
-- defensive one-shot in case any historical rows carry a metadata->>
-- 'project_id' that maps to a reseller sandbox project — in practice we
-- expect it to match zero rows.

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS sandbox boolean NOT NULL DEFAULT false;

-- Partial index — the sandbox=true subset is expected to stay small
-- because sandbox_spend currently bypasses credit_transactions entirely.
-- WHERE-clause keeps the index footprint tight while making the
-- /admin/credits filter chip cheap when it flips to sandbox.
CREATE INDEX IF NOT EXISTS credit_transactions_sandbox_idx
  ON public.credit_transactions (sandbox)
  WHERE sandbox = true;

COMMENT ON COLUMN public.credit_transactions.sandbox IS
  'True when this transaction was recorded against a reseller sandbox project (D3-CISO-05 / D2-CFO-08). Filtered via /admin/credits scope chip. Note: current sandbox_spend path writes reseller_credit_grants instead of credit_transactions, so this column typically stays false — see web/src/lib/credits.ts:trySpendSandboxCredits.';

-- Defensive backfill: any historical credit_transactions row whose
-- metadata carries a project_id that maps to a reseller sandbox project
-- gets flagged. Safe to re-run: idempotent WHERE guards + sets sandbox=true
-- (matches DEFAULT for the untouched rows).
UPDATE public.credit_transactions ct
   SET sandbox = true
  FROM public.projects p
 WHERE ct.metadata ->> 'project_id' = p.id::text
   AND p.reseller_sandbox_id IS NOT NULL
   AND ct.sandbox IS DISTINCT FROM true;

-- Nudge PostgREST to pick up the new column so the admin scope filter
-- can start using it without a service restart.
NOTIFY pgrst, 'reload schema';
