-- 0304_founder_core_features.sql
-- Phase 1 core founder features: GTM strategy, competitor review, team
-- structure, pricing tiers, and quarterly roadmap milestones.
--
-- Each feature is a per-project (project_id) row set owned by a user
-- (user_id). RLS is enabled defense-in-depth; all app writes go through the
-- service-role key which BYPASSRLS. If we later expose these via the anon
-- key, add per-table SELECT/INSERT/UPDATE/DELETE policies scoped to
-- (user_id = auth.uid()) AND (project_id in <user's projects>).
--
-- Reserved lane: 03xx per header note in 0270_report_orders.sql.
-- Claims 0304 (previous head is 0303_growth_phase_gates.sql).

BEGIN;

-- ─── GTM Strategy ────────────────────────────────────────────────────────────
-- One row per project. Structured fields cover the standard GTM canvas
-- (ICP, positioning, channels, sales motion, pricing hook, launch plan).
CREATE TABLE IF NOT EXISTS public.gtm_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Core canvas fields (all nullable — founder fills as they go).
  target_segment text,          -- e.g. "AU seed-stage SaaS founders, 1–5 FTE"
  problem_statement text,       -- pain the segment feels today
  value_prop text,              -- one-sentence value proposition
  positioning text,             -- how we differ vs alternatives
  primary_channel text,         -- e.g. "founder-led outbound", "SEO", "PLG"
  secondary_channels text[],    -- array of additional channels
  sales_motion text,            -- "self-serve" | "sales-assisted" | "enterprise"
  price_anchor text,            -- e.g. "A$99/mo per company"
  launch_plan text,             -- markdown-friendly text
  north_star_metric text,       -- e.g. "activated startups / week"
  north_star_target numeric,    -- numeric goal for the metric

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS gtm_strategies_user_idx
  ON public.gtm_strategies (user_id);
CREATE INDEX IF NOT EXISTS gtm_strategies_project_idx
  ON public.gtm_strategies (project_id);

ALTER TABLE public.gtm_strategies ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.gtm_strategies IS
  'One GTM canvas per project. Founder-owned, service-role writes only.';

-- ─── Competitor Review ──────────────────────────────────────────────────────
-- Multiple rows per project. Free-form competitor entries with a small set
-- of structured attributes so the client can render a comparison table.
CREATE TABLE IF NOT EXISTS public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  name text NOT NULL,
  website text,
  category text,                -- "direct" | "indirect" | "substitute"
  positioning text,             -- their one-line pitch
  pricing text,                 -- e.g. "US$29/mo, free tier"
  strengths text,
  weaknesses text,
  our_edge text,                -- how we win vs them
  threat_level text
    CHECK (threat_level IS NULL OR threat_level IN ('low','medium','high')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS competitors_project_idx
  ON public.competitors (project_id);
CREATE INDEX IF NOT EXISTS competitors_user_idx
  ON public.competitors (user_id);

ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.competitors IS
  'Founder competitor register. N rows per project, service-role writes only.';

-- ─── Team Structure ─────────────────────────────────────────────────────────
-- Multiple rows per project — one per role slot (filled or open). Supports
-- the org-chart view (reports_to points at another team_members.id) and the
-- role planner (status tracks whether a role is filled/open/planned).
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  role_title text NOT NULL,             -- "CEO", "CTO", "Head of Growth"
  role_category text,                   -- "founder" | "hire" | "advisor" | "contractor"
  full_name text,                       -- null when role is open/planned
  equity_pct numeric,                   -- 0..100
  salary_aud numeric,                   -- annual, nullable for advisors
  start_date date,                      -- planned or actual
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('filled','open','planned')),
  reports_to uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_members_project_idx
  ON public.team_members (project_id);
CREATE INDEX IF NOT EXISTS team_members_user_idx
  ON public.team_members (user_id);
CREATE INDEX IF NOT EXISTS team_members_reports_to_idx
  ON public.team_members (reports_to);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.team_members IS
  'Founder team roster and org-chart. reports_to → self-FK for hierarchy.';

-- ─── Pricing Tiers ──────────────────────────────────────────────────────────
-- Multiple rows per project — one per tier the founder is planning. Not the
-- BlockID platform pricing; this is the founder's *own* SaaS pricing.
CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  name text NOT NULL,                   -- "Free", "Starter", "Growth", "Enterprise"
  model text NOT NULL DEFAULT 'flat'
    CHECK (model IN ('freemium','flat','per_seat','usage','tiered','enterprise')),
  price_monthly_aud numeric,            -- null for "contact us"
  price_annual_aud numeric,             -- null when only monthly offered
  billing_note text,                    -- "billed annually", "per active user"
  features text[] NOT NULL DEFAULT '{}',
  target_segment text,                  -- "solo founders", "5–20 seat teams"
  cta_label text,                       -- "Start free", "Contact sales"
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_tiers_project_idx
  ON public.pricing_tiers (project_id);
CREATE INDEX IF NOT EXISTS pricing_tiers_user_idx
  ON public.pricing_tiers (user_id);

ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pricing_tiers IS
  'Founder-owned SaaS pricing tiers (not BlockID platform pricing).';

-- ─── Roadmap Milestones ─────────────────────────────────────────────────────
-- Founder-facing quarterly roadmap. Not the growth-phase gate progress
-- (that is startup_phase_progress); this is founder-authored milestones
-- shown on /workspace/roadmap-builder and rolled into the investor pack.
CREATE TABLE IF NOT EXISTS public.roadmap_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  quarter text NOT NULL,                -- "2026-Q4", "2027-Q1"
  title text NOT NULL,
  description text,
  category text,                        -- "product" | "growth" | "fundraise" | "team" | "compliance"
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','in_progress','shipped','cancelled')),
  target_date date,
  owner text,                           -- role name or person
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roadmap_milestones_project_idx
  ON public.roadmap_milestones (project_id);
CREATE INDEX IF NOT EXISTS roadmap_milestones_quarter_idx
  ON public.roadmap_milestones (project_id, quarter);

ALTER TABLE public.roadmap_milestones ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.roadmap_milestones IS
  'Founder-authored quarterly roadmap milestones. N rows per project.';

-- ─── Shared updated_at trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'gtm_strategies','competitors','team_members','pricing_tiers','roadmap_milestones'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I;',
      t, t
    );
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t
    );
  END LOOP;
END;
$$;

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
