-- Migration 0092 — reseller column extensions on existing tables (Track A P1.1)
--
-- Delivers extensions to app_users, projects, plans, revenue_events,
-- credit_transactions per docs/plans/reseller-module-plan.md § U.15.1, D.2.
--
-- Applied via: docker exec + NOTIFY pgrst 'reload schema'.
-- Not yet applied to production.

BEGIN;

-- ---------------------------------------------------------------------------
-- app_users — cache column for the user's primary reseller attribution.
-- Canonical attribution lives on projects.attribution_reseller_id (per U.6).
-- ---------------------------------------------------------------------------

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS attribution_reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grandfathered_share_management bool NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grandfathered_at timestamptz;

CREATE INDEX IF NOT EXISTS app_users_attribution_reseller_idx
  ON public.app_users (attribution_reseller_id)
  WHERE attribution_reseller_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- projects — per-workspace attribution (canonical; wins over user-level cache).
-- Per U.6: one projects row = one startup = one idea. Multiple ideas per
-- founder can attribute to different resellers.
-- ---------------------------------------------------------------------------

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS attribution_reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_showcase bool NOT NULL DEFAULT false,           -- Track B B1
  ADD COLUMN IF NOT EXISTS reseller_sandbox_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL, -- U.4 sandbox
  ADD COLUMN IF NOT EXISTS repo_url text;                                     -- U.9 Phase 4 GitHub linkage

CREATE INDEX IF NOT EXISTS projects_attribution_reseller_active_idx
  ON public.projects (attribution_reseller_id)
  WHERE attribution_reseller_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS projects_showcase_idx
  ON public.projects (is_showcase)
  WHERE is_showcase = true;

CREATE INDEX IF NOT EXISTS projects_sandbox_idx
  ON public.projects (reseller_sandbox_id)
  WHERE reseller_sandbox_id IS NOT NULL;

-- Sandbox projects belong to a reseller org, not to a customer subscription tier.
-- They don't count against PLAN_PROJECT_LIMITS in web/src/lib/projects.ts.
-- Enforcement: createProject() bypasses the limit check when reseller_sandbox_id IS NOT NULL.

-- ---------------------------------------------------------------------------
-- plans — reseller economics + add-on flag
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS reseller_share_pct numeric(5,2) NOT NULL DEFAULT 40.00,
  ADD COLUMN IF NOT EXISTS reseller_eligible bool NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_addon bool NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- revenue_events — attribution + commission surface (single SoT for BlockID net)
-- ---------------------------------------------------------------------------

ALTER TABLE public.revenue_events
  ADD COLUMN IF NOT EXISTS reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reseller_commission_aud_cents int;

CREATE INDEX IF NOT EXISTS revenue_events_reseller_month_idx
  ON public.revenue_events (reseller_id, occurred_at DESC)
  WHERE reseller_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- credit_transactions — reseller-initiated grant audit
-- ---------------------------------------------------------------------------

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS granted_by_reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS credit_transactions_reseller_grant_idx
  ON public.credit_transactions (granted_by_reseller_id, created_at DESC)
  WHERE granted_by_reseller_id IS NOT NULL;

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
