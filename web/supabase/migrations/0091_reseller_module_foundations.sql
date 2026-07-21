-- Migration 0091 — reseller module foundations (Track A P1.1)
--
-- Delivers: resellers, reseller_admins, reseller_attributions,
--           reseller_promotion_codes.
--
-- Per docs/plans/reseller-module-plan.md § U.15.1 (data-model corrections)
-- and § U.15.9 (renumbered from 0075).
--
-- Applied via: docker exec <supabase-container> psql -U postgres -d postgres
--              -f 0091_reseller_module_foundations.sql
-- Then: NOTIFY pgrst, 'reload schema';
--
-- IMPORTANT: This file has NOT yet been applied to production. Apply is a
-- manual step per project memory reference_db_migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- resellers — one row per reseller organisation (InfoVision is row #1)
-- ---------------------------------------------------------------------------

CREATE TABLE public.resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,                       -- UPPERCASE family slug (e.g. "INFOVISION")
  display_name text NOT NULL,
  logo_url text,
  primary_color text,                              -- hex, optional
  billing_model text NOT NULL DEFAULT 'retail'
    CHECK (billing_model IN ('retail','wholesale')),
  allowed_tiers int[] NOT NULL DEFAULT ARRAY[0,10,20,30,40],
  can_create_startups bool NOT NULL DEFAULT false,
  can_grant_credits bool NOT NULL DEFAULT false,
  monthly_credit_budget int NOT NULL DEFAULT 0,    -- for granting to attributed startups
  monthly_sandbox_credits int NOT NULL DEFAULT 500, -- separate cap for reseller sandbox (U.15.2)
  collateral_approval_required bool NOT NULL DEFAULT true,
  gst_registered bool NOT NULL DEFAULT false,      -- MUST be true for wholesale (U.15.1)
  abn text,                                        -- must match ABN format when gst_registered
  commission_share_pct numeric(5,2) NOT NULL DEFAULT 40.00,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','terminated')),
  contact_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Enforcement: wholesale requires GST registration + ABN (U.15.1, U.15.10)
  CONSTRAINT ck_wholesale_gst_required CHECK (
    billing_model = 'retail'
    OR (billing_model = 'wholesale' AND gst_registered = true AND abn IS NOT NULL)
  ),
  -- ABN format when populated: NN NNN NNN NNN
  CONSTRAINT ck_abn_format CHECK (
    abn IS NULL OR abn ~ '^\d{2} \d{3} \d{3} \d{3}$'
  )
);

CREATE INDEX resellers_status_active_idx ON public.resellers (status)
  WHERE status = 'active';

COMMENT ON TABLE public.resellers IS
  'One row per reseller org. Wholesale = reseller pays Stripe per attributed startup, commission=0. Retail = end-startup pays, reseller earns commission (40% list - discount). See docs/plans/reseller-module-plan.md § U.3, U.15.1.';

-- ---------------------------------------------------------------------------
-- reseller_admins — link many app_users to a reseller org
-- ---------------------------------------------------------------------------

CREATE TABLE public.reseller_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'admin'
    CHECK (role IN ('owner','admin','viewer')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked')),
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (reseller_id, user_id)
);

CREATE INDEX reseller_admins_user_idx ON public.reseller_admins (user_id)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- reseller_promotion_codes — one row per (reseller_id, tier_pct)
-- ---------------------------------------------------------------------------

CREATE TABLE public.reseller_promotion_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT,
  tier_pct int NOT NULL CHECK (tier_pct IN (0,10,20,30,40)),
  code text NOT NULL UNIQUE,                     -- customer-facing (e.g. "INFOVISION20")
  stripe_coupon_id text,                          -- NULL for tier 0 (attribution only)
  stripe_promotion_code_id text,                  -- NULL for tier 0
  active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, tier_pct),
  -- Tier > 0 requires Stripe objects; tier 0 forbids them
  CONSTRAINT ck_stripe_objects_by_tier CHECK (
    (tier_pct = 0 AND stripe_coupon_id IS NULL AND stripe_promotion_code_id IS NULL)
    OR
    (tier_pct > 0 AND stripe_coupon_id IS NOT NULL AND stripe_promotion_code_id IS NOT NULL)
  )
);

CREATE INDEX reseller_promotion_codes_reseller_idx ON public.reseller_promotion_codes (reseller_id);

-- ---------------------------------------------------------------------------
-- reseller_attributions — links reseller to subject (user OR project)
-- Per U.15.1: no user-level partial unique (allows same founder × N ideas).
-- ---------------------------------------------------------------------------

CREATE TABLE public.reseller_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT,
  subject_type text NOT NULL CHECK (subject_type IN ('user','project')),
  subject_user_id uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
  subject_project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked')),
  opted_out bool NOT NULL DEFAULT false,
  opted_out_at timestamptz,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('code','provisioned','admin_manual')),
  promotion_code_id uuid REFERENCES public.reseller_promotion_codes(id),
  metadata jsonb NOT NULL DEFAULT '{}',

  -- Exactly one subject FK populated matching subject_type
  CONSTRAINT ck_subject_fk_matches_type CHECK (
    (subject_type = 'user'    AND subject_user_id    IS NOT NULL AND subject_project_id IS NULL)
    OR
    (subject_type = 'project' AND subject_project_id IS NOT NULL AND subject_user_id    IS NULL)
  )
);

-- Per U.15.1: PROJECT-level partial unique only. User-level partial unique DROPPED
-- so U.6 legal case (same founder × two ideas × two resellers) is supported.
CREATE UNIQUE INDEX reseller_attributions_active_project_uniq
  ON public.reseller_attributions (subject_project_id)
  WHERE subject_type = 'project' AND status = 'active' AND opted_out = false;

CREATE INDEX reseller_attributions_reseller_status_idx
  ON public.reseller_attributions (reseller_id, status, opted_out);

-- ---------------------------------------------------------------------------
-- RLS posture — inherit default-deny + service-role bypass from
-- migration 0050_enable_rls_defense_in_depth.sql.
-- Route handlers scope via resellerSupabase() typed wrapper (U.15.13).
-- ---------------------------------------------------------------------------

ALTER TABLE public.resellers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_admins           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_promotion_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_attributions     ENABLE ROW LEVEL SECURITY;

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
