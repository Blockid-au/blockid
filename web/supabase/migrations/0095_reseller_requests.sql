-- Migration 0095 — reseller_requests (Track A P9.3)
--
-- Delivers a single workflow table backing three admin-approval flows:
--   1. code_request         — reseller asks BlockID admin to mint a new
--                             (tier, code) pair. Approving the request
--                             creates Stripe coupon+promotion_code (tier>0)
--                             and inserts a row into reseller_promotion_codes.
--   2. over_budget_approval — reseller wants to grant credits that would
--                             break resellers.monthly_credit_budget.
--                             Approving the request triggers the same
--                             credit_balances + credit_transactions +
--                             reseller_credit_grants(kind=grant, over_budget=true)
--                             chain as /api/reseller/credits/grant.
--   3. collateral_approval  — reseller submits marketing collateral (URL +
--                             purpose) for co-branded material. Approving
--                             the request just marks it approved; the URL
--                             lives in payload.collateral_url.
--
-- Per docs/plans/reseller-module-plan.md § C.5, § D.4, and D4-CLO-08.
--
-- Applied via docker exec psql; not yet applied to production.

BEGIN;

CREATE TABLE public.reseller_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  request_type text NOT NULL
    CHECK (request_type IN ('code_request','over_budget_approval','collateral_approval')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied','cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  decision_at timestamptz,
  decision_reason text,
  linked_credit_transaction_id uuid REFERENCES public.credit_transactions(id) ON DELETE SET NULL,
  linked_promotion_code_id uuid REFERENCES public.reseller_promotion_codes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Decision fields must move together.
  CONSTRAINT ck_decision_shape CHECK (
    (status = 'pending' AND decision_by IS NULL AND decision_at IS NULL)
    OR
    (status IN ('approved','denied','cancelled') AND decision_at IS NOT NULL)
  ),
  -- Approved credit / code requests may link to the artifact they created.
  CONSTRAINT ck_credit_link CHECK (
    linked_credit_transaction_id IS NULL
    OR (request_type = 'over_budget_approval' AND status = 'approved')
  ),
  CONSTRAINT ck_promo_link CHECK (
    linked_promotion_code_id IS NULL
    OR (request_type = 'code_request' AND status = 'approved')
  )
);

-- Hot query: admin inbox scans WHERE status='pending' ORDER BY created_at.
CREATE INDEX reseller_requests_pending_idx
  ON public.reseller_requests (created_at DESC)
  WHERE status = 'pending';

-- Per-reseller listing (reseller-side "my requests" view).
CREATE INDEX reseller_requests_reseller_idx
  ON public.reseller_requests (reseller_id, created_at DESC);

-- One pending code_request per (reseller_id, tier_pct) so a reseller can't
-- flood the queue with the same ask. Nulls in payload->>'tier_pct' are
-- treated as distinct by the partial index, so non-code requests are
-- unaffected.
CREATE UNIQUE INDEX reseller_requests_pending_code_uniq
  ON public.reseller_requests (reseller_id, ((payload->>'tier_pct')::int))
  WHERE request_type = 'code_request' AND status = 'pending';

ALTER TABLE public.reseller_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.reseller_requests IS
  'Admin approval workflow queue: code minting, over-budget credit grants, '
  'marketing collateral. See docs/plans/reseller-module-plan.md § C.5 + P9.3.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
