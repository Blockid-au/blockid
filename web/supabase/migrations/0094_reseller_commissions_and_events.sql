-- Migration 0094 — reseller commission ledger (append-only) + status view
--
-- Delivers reseller_commissions + reseller_commission_events per
-- docs/plans/reseller-module-plan.md § U.15.1 (D1-CTO-01, D1-CTO-04).
--
-- Design:
--   - reseller_commissions stores immutable per-invoice-line rows with
--     billing_model denormalised from resellers (so the single CHECK is
--     legal — Postgres CHECK can't reference other tables).
--   - reseller_commission_events is append-only. status derives from the
--     event history; there is NO mutable status column.
--   - reseller_commissions_current view exposes the derived status +
--     net_owed_cents for consumers that need it.
--
-- Applied via docker exec psql + NOTIFY pgrst 'reload schema'.
-- Not yet applied to production.

BEGIN;

-- ---------------------------------------------------------------------------
-- reseller_commissions — one row per invoice line at accrual time.
-- Immutable except for cleared_at set by the nightly clearance cron (which
-- is superseded by the append-only event pattern; cleared_at is derived
-- from the 'cleared' event, so we drop it — but keep created_at + pending_until
-- as reporting anchors).
-- ---------------------------------------------------------------------------

CREATE TABLE public.reseller_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT,
  attribution_id uuid NOT NULL REFERENCES public.reseller_attributions(id) ON DELETE RESTRICT,
  billing_model text NOT NULL,                     -- denormalised from resellers at insert
  stripe_event_id text NOT NULL UNIQUE,            -- shares idempotency with revenue_events
  stripe_invoice_id text NOT NULL,
  stripe_subscription_id text NOT NULL,
  stripe_charge_id text,                           -- populated so charge.refunded can join
  list_price_aud_cents int NOT NULL CHECK (list_price_aud_cents > 0),
  discount_pct int NOT NULL CHECK (discount_pct IN (0,10,20,30,40)),
  discount_aud_cents int NOT NULL CHECK (discount_aud_cents >= 0),
  amount_paid_aud_cents int NOT NULL CHECK (amount_paid_aud_cents >= 0),
  commission_aud_cents int NOT NULL CHECK (commission_aud_cents >= 0),
  pending_until timestamptz NOT NULL,              -- invoice.created + 7 days
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Denormalised billing_model must match parent resellers.billing_model at
  -- insert time. Trigger below keeps it in sync on parent changes.
  CONSTRAINT ck_billing_model_enum CHECK (billing_model IN ('retail','wholesale')),

  -- The single load-bearing invariant (D1-CTO-01 + D2-CFO-02): ±1c tolerance
  -- allows for rounding edge SKUs; wholesale ignores 60/40 split entirely.
  CONSTRAINT ck_commission_split CHECK (
    (billing_model = 'retail'
       AND ABS(list_price_aud_cents - discount_aud_cents - commission_aud_cents
               - round(0.60 * list_price_aud_cents)::int) <= 1)
    OR
    (billing_model = 'wholesale'
       AND commission_aud_cents = 0
       AND amount_paid_aud_cents = list_price_aud_cents - discount_aud_cents)
  )
);

CREATE INDEX reseller_commissions_reseller_pending_idx
  ON public.reseller_commissions (reseller_id, pending_until);

CREATE INDEX reseller_commissions_charge_idx
  ON public.reseller_commissions (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

CREATE INDEX reseller_commissions_invoice_idx
  ON public.reseller_commissions (stripe_invoice_id);

COMMENT ON TABLE public.reseller_commissions IS
  'Immutable commission ledger rows. Status derived from reseller_commission_events. See docs/plans/reseller-module-plan.md § U.15.1.';

-- ---------------------------------------------------------------------------
-- Trigger: keep billing_model synchronised on update of resellers.billing_model
-- (rare — usually admin-only). We do NOT recompute historical commission rows;
-- the trigger only enforces new inserts pick up the current parent value.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reseller_commissions_stamp_billing_model()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.billing_model IS NULL OR NEW.billing_model = '' THEN
    SELECT billing_model INTO NEW.billing_model FROM public.resellers WHERE id = NEW.reseller_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stamp_billing_model
  BEFORE INSERT ON public.reseller_commissions
  FOR EACH ROW EXECUTE FUNCTION public.reseller_commissions_stamp_billing_model();

-- ---------------------------------------------------------------------------
-- reseller_commission_events — append-only status log.
-- Every state transition is a NEW ROW, never a mutation of reseller_commissions.
-- ---------------------------------------------------------------------------

CREATE TABLE public.reseller_commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.reseller_commissions(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'accrued',           -- initial row created (delta = +commission_aud_cents)
    'cleared',           -- cleared past pending_until (delta = 0, informational)
    'refund_full',       -- delta = -commission_aud_cents
    'refund_partial',    -- delta = pro-rated negative
    'dispute_opened',    -- delta = 0, informational; freezes clearance
    'dispute_lost',      -- delta = -remaining owed
    'dispute_won',       -- delta = 0, informational; resumes clearance
    'void'               -- delta = -remaining owed (rare)
  )),
  delta_aud_cents int NOT NULL,
  stripe_event_id text UNIQUE,                     -- for idempotency; null for internal events
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reseller_commission_events_commission_idx
  ON public.reseller_commission_events (commission_id, created_at);

CREATE INDEX reseller_commission_events_type_idx
  ON public.reseller_commission_events (event_type, created_at);

COMMENT ON TABLE public.reseller_commission_events IS
  'Append-only event log. Every commission status change is a new row here; reseller_commissions is never mutated. See docs/plans/reseller-module-plan.md § U.15.1 (D1-CTO-04).';

-- ---------------------------------------------------------------------------
-- reseller_commissions_current — derived status + net owed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.reseller_commissions_current AS
SELECT
  rc.id AS commission_id,
  rc.reseller_id,
  rc.attribution_id,
  rc.stripe_event_id,
  rc.stripe_invoice_id,
  rc.stripe_subscription_id,
  rc.stripe_charge_id,
  rc.billing_model,
  rc.list_price_aud_cents,
  rc.discount_pct,
  rc.discount_aud_cents,
  rc.amount_paid_aud_cents,
  rc.commission_aud_cents,
  rc.pending_until,
  rc.created_at,
  (CASE
     WHEN EXISTS (
       SELECT 1 FROM public.reseller_commission_events e
       WHERE e.commission_id = rc.id
         AND e.event_type IN ('refund_full','dispute_lost','void')
     ) THEN 'clawed_back'
     WHEN EXISTS (
       SELECT 1 FROM public.reseller_commission_events e
       WHERE e.commission_id = rc.id AND e.event_type = 'dispute_opened'
     ) AND NOT EXISTS (
       SELECT 1 FROM public.reseller_commission_events e
       WHERE e.commission_id = rc.id AND e.event_type IN ('dispute_won','dispute_lost')
     ) THEN 'dispute_open'
     WHEN EXISTS (
       SELECT 1 FROM public.reseller_commission_events e
       WHERE e.commission_id = rc.id AND e.event_type = 'refund_partial'
     ) THEN 'partially_refunded'
     WHEN EXISTS (
       SELECT 1 FROM public.reseller_commission_events e
       WHERE e.commission_id = rc.id AND e.event_type = 'cleared'
     ) THEN 'cleared'
     ELSE 'pending_clearance'
   END) AS status,
  rc.commission_aud_cents + COALESCE(
    (SELECT SUM(delta_aud_cents) FROM public.reseller_commission_events e
     WHERE e.commission_id = rc.id AND e.event_type NOT IN ('accrued','cleared','dispute_opened','dispute_won')),
    0
  ) AS net_owed_cents
FROM public.reseller_commissions rc;

COMMENT ON VIEW public.reseller_commissions_current IS
  'Derived status + net owed per commission row from the append-only event log. Consumers should read this view, never join reseller_commissions to reseller_commission_events directly.';

-- ---------------------------------------------------------------------------
-- RLS — inherit default-deny + service-role bypass posture.
-- ---------------------------------------------------------------------------

ALTER TABLE public.reseller_commissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_commission_events  ENABLE ROW LEVEL SECURITY;

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
