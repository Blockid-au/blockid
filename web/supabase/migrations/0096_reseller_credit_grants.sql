-- Migration 0096 — reseller_credit_grants (Track A P6.1)
--
-- Delivers the reseller_credit_grants table per
-- docs/plans/reseller-module-plan.md § D.3 (data model) + § U.15.2
-- (sandbox controls).
--
-- Design:
--   - One row per reseller-initiated ledger event: either a grant to an
--     attributed customer (kind='grant', amount > 0) or a sandbox debit
--     against monthly_sandbox_credits (kind='sandbox_spend', amount < 0).
--   - month_key stores 'YYYY-MM' in UTC — matches currentMonthKey() used by
--     the credit-reset cron so budget rollups are stable across timezone
--     shifts.
--   - over_budget flag records that admin approved a grant that broke
--     resellers.monthly_credit_budget for the calendar month. Enforced at
--     write time; used by /reseller/settings + monthly reports.
--   - credit_transaction_id links a grant row back to the customer-facing
--     credit_transactions row so the mirror is auditable. NULL for
--     sandbox_spend rows (sandbox spend does not touch credit_balances).
--
-- Applied via docker exec psql + NOTIFY pgrst 'reload schema'.
-- Not yet applied to production.

BEGIN;

CREATE TABLE public.reseller_credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('grant','sandbox_spend')),
  amount int NOT NULL,
  credit_transaction_id uuid REFERENCES public.credit_transactions(id) ON DELETE SET NULL,
  month_key text NOT NULL,
  over_budget bool NOT NULL DEFAULT false,
  granted_by_user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  sandbox_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Sign invariant per kind (matches lib/reseller/credit-grants.ts).
  CONSTRAINT ck_amount_sign CHECK (
    (kind = 'grant' AND amount > 0)
    OR (kind = 'sandbox_spend' AND amount < 0)
  ),
  -- month_key must be 'YYYY-MM'.
  CONSTRAINT ck_month_key_format CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- Grants target a customer; sandbox_spend targets a sandbox project.
  CONSTRAINT ck_target_shape CHECK (
    (kind = 'grant' AND target_user_id IS NOT NULL AND sandbox_project_id IS NULL)
    OR (kind = 'sandbox_spend' AND sandbox_project_id IS NOT NULL)
  ),
  -- Grants must link a credit_transactions row; sandbox_spend must not.
  CONSTRAINT ck_ct_link CHECK (
    (kind = 'grant' AND credit_transaction_id IS NOT NULL)
    OR (kind = 'sandbox_spend' AND credit_transaction_id IS NULL)
  )
);

-- Idempotency for grants: never mirror the same customer credit_transaction
-- twice. sandbox_spend has null credit_transaction_id and is deduped by the
-- caller's own metadata.
CREATE UNIQUE INDEX reseller_credit_grants_grant_dedup_idx
  ON public.reseller_credit_grants (reseller_id, target_user_id, credit_transaction_id)
  WHERE kind = 'grant';

-- Monthly budget rollup — the hot query.
CREATE INDEX reseller_credit_grants_reseller_month_idx
  ON public.reseller_credit_grants (reseller_id, month_key);

-- Sandbox hourly rate-limit query needs a per-project time index.
CREATE INDEX reseller_credit_grants_sandbox_recent_idx
  ON public.reseller_credit_grants (sandbox_project_id, created_at DESC)
  WHERE kind = 'sandbox_spend';

COMMENT ON TABLE public.reseller_credit_grants IS
  'Mirror of credit_transactions for reseller-initiated grants + append log '
  'for reseller sandbox debits. See docs/plans/reseller-module-plan.md § D.3 + § U.15.2.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
