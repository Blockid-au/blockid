-- Migration 0333 — reseller_customers: per-customer pipeline stage (G2 #7, S19-B)
--
-- Real-world workflow parity audit gap #7
-- (docs/plans/real-world-workflow-parity-audit-2026-07-23.md §6): channel
-- partners track each referred customer through their OWN pipeline
-- (lead → onboarded → scored → data_room → fundraising → invested, churned
-- as the side exit). Until now the reseller console only had the derived
-- VC-journey stage computed from the SVI score at read time; nothing was
-- persisted and nothing captured a partner's manual view.
--
-- There was no `reseller_customers` table before this migration — the
-- reseller ↔ customer relationship lives in `reseller_attributions`
-- (subject_type = 'user' | 'project'). This table is the per-(reseller,
-- customer-user) CRM row that the attribution resolves to; it is seeded
-- lazily by the nightly `reseller-stage-sync` cron and by the manual
-- override route, never by trigger, so an attribution row stays the source
-- of truth for WHO is a customer and this table only says WHERE they are.
--
-- Vocabulary is pinned by web/src/lib/reseller/customer-stage.ts
-- (colocated test parses this file's CHECK constraint).
--
-- Apply (manual, per project memory reference_db_migrations):
--   docker exec -i <supabase-db> psql -U postgres -d postgres \
--     < web/supabase/migrations/0333_reseller_customer_stage.sql
-- Then:
--   NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE TABLE IF NOT EXISTS public.reseller_customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id       uuid NOT NULL
    REFERENCES public.resellers(id) ON DELETE CASCADE,
  customer_user_id  uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE CASCADE,

  -- Channel-partner pipeline. Order matters: the auto-updater only ever
  -- moves DOWN this list (never backwards) and never leaves the two
  -- terminal stages; a person may set any stage in any direction.
  stage             text NOT NULL DEFAULT 'lead'
    CHECK (stage IN ('lead','onboarded','scored','data_room','fundraising','invested','churned')),
  stage_updated_at  timestamptz NOT NULL DEFAULT now(),
  stage_source      text NOT NULL DEFAULT 'auto'
    CHECK (stage_source IN ('auto','manual')),
  -- Who set a manual stage (NULL for auto). Kept for the drawer timeline;
  -- the durable record is the reseller_audit_log row the route writes.
  stage_set_by      uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  stage_note        text
    CHECK (stage_note IS NULL OR char_length(stage_note) <= 500),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (reseller_id, customer_user_id)
);

CREATE INDEX IF NOT EXISTS reseller_customers_reseller_stage_idx
  ON public.reseller_customers (reseller_id, stage);

-- Weekly digest: "n customers moved stage this week" scans this.
CREATE INDEX IF NOT EXISTS reseller_customers_stage_updated_idx
  ON public.reseller_customers (reseller_id, stage_updated_at DESC);

-- Default-deny RLS (0050 posture). Every read/write goes through the
-- service-role typed wrapper web/src/lib/reseller/supabase.ts, which injects
-- the reseller_id filter; there is no anon/authenticated policy on purpose.
ALTER TABLE public.reseller_customers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.reseller_customers IS
  'Per-(reseller, customer) channel-partner pipeline row. stage ladder lead→onboarded→scored→data_room→fundraising→invested (+churned). stage_source=auto rows are advanced nightly by /api/cron/reseller-stage-sync from real product signals (projects, svi_analyses, data_rooms, funding_reports/fundraise_rounds); manual rows come from POST /api/reseller/customers/[id]/stage and are audit-logged. See web/src/lib/reseller/customer-stage.ts.';
COMMENT ON COLUMN public.reseller_customers.stage_source IS
  'auto = set by the nightly sync from product signals; manual = set by a reseller owner/admin (reseller_audit_log action=set_customer_stage).';

COMMIT;

-- After apply, reload PostgREST schema cache:
NOTIFY pgrst, 'reload schema';
