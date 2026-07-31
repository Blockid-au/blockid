-- 0291_marketplace_opportunities.sql
-- Phase 5 Batch I sub-task I2 — Marketplace opportunities + applications.
--
-- Master Upgrade Plan §21 (Marketplace surface: investment / accelerator /
-- grant / procurement / partnership / mentoring / advisory / university /
-- export opportunities matched against verified businesses). This migration
-- lays the two tables the marketplace UI reads:
--
--   * marketplace_opportunities — a listing (platform- or partner-authored).
--     `moderation_status` gates public visibility per §21.4 (transparent
--     sponsorship: `sponsored=true` must render a visible SPONSORED chip).
--   * opportunity_applications — a business's application to an opportunity.
--     Bundles an optional share_package_id so the applicant hands over the
--     right consent-scoped payload in one click.
--
-- FK notes:
--   * provider_org_id references public.projects(id) — nullable for
--     platform-authored opportunities. Re-points onto orgs(id) later.
--   * business_id references public.projects(id) — the applying startup.
--   * share_package_id references public.share_packages(id) — application
--     payload the recipient reads via the share-package enforcer.
--
-- Idempotency: every DDL uses IF NOT EXISTS. Single BEGIN/COMMIT.
--
-- RLS: enabled defense-in-depth. Reader policies land alongside the public
-- discovery route in Phase 5 Batch J.
--
-- Reserved lane: 02xx spec lane per Master Upgrade Plan §5.2.

BEGIN;

-- ─── marketplace_opportunities ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketplace_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider org. NULL for platform-authored (curated) listings.
  provider_org_id uuid
    REFERENCES public.projects(id) ON DELETE CASCADE,

  title       text NOT NULL,
  description text NOT NULL,

  -- opportunity_kind drives the matcher's scoring rubric + the badge chip.
  --   investment/accelerator/grant/procurement/partnership/
  --   mentoring/advisory/university/export
  opportunity_kind text NOT NULL
    CHECK (opportunity_kind IN (
      'investment','accelerator','grant','procurement','partnership',
      'mentoring','advisory','university','export'
    )),

  -- Match dimensions. Arrays so the matcher can index on GIN and filter
  -- by any-of semantics. Empty array = "any".
  industries   text[] NOT NULL DEFAULT '{}',
  stages       text[] NOT NULL DEFAULT '{}',
  geographies  text[] NOT NULL DEFAULT '{}',

  -- Evidence the applicant must have surfaced on their profile before the
  -- application can be submitted. e.g. ['abn','directors','financials'].
  required_evidence text[] NOT NULL DEFAULT '{}',

  -- Minimum verification level the provider requires. Defaults to L2
  -- (evidence-checked) — the same floor the public sitemap uses per §11.1.
  min_verification_level smallint NOT NULL DEFAULT 2
    CHECK (min_verification_level BETWEEN 0 AND 5),

  -- Deadline (nullable — rolling opportunities have no close).
  close_at timestamptz,

  -- Optional AUD value bracket. Two nullable ints so the matcher can
  -- filter on ranges without a jsonb parse.
  value_aud_min integer,
  value_aud_max integer,

  -- Off-platform application flow. Provider may host the actual form
  -- externally; contact_email is the fallback route the marketplace UI
  -- surfaces when application_url is NULL.
  application_url text,
  contact_email   text,

  -- moderation_status gates public visibility. Only 'approved' rows are
  -- returned by the public /marketplace reader.
  --   pending    → default on create; awaits platform moderator review
  --   approved   → visible in the public marketplace
  --   rejected   → moderator declined; hidden from readers
  --   suspended  → previously approved, now hidden (policy violation etc.)
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending','approved','rejected','suspended')),

  -- Transparent sponsorship label per §21.4. When true the UI must
  -- render a SPONSORED chip alongside the listing card.
  sponsored boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Composite btree — the public listing reader filters kind + close_at.
CREATE INDEX IF NOT EXISTS marketplace_opportunities_kind_close_idx
  ON public.marketplace_opportunities (opportunity_kind, close_at);

-- Moderator dashboard scans by status.
CREATE INDEX IF NOT EXISTS marketplace_opportunities_moderation_idx
  ON public.marketplace_opportunities (moderation_status);

-- Matcher any-of filters over the two multi-value columns.
CREATE INDEX IF NOT EXISTS marketplace_opportunities_industries_gin
  ON public.marketplace_opportunities USING GIN (industries);

CREATE INDEX IF NOT EXISTS marketplace_opportunities_geographies_gin
  ON public.marketplace_opportunities USING GIN (geographies);

ALTER TABLE public.marketplace_opportunities ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.marketplace_opportunities IS
  'Master Upgrade Plan §21 — a matchable opportunity (investment/accelerator/grant/etc.). moderation_status=approved is the visibility gate; sponsored=true must render a visible SPONSORED chip per §21.4.';

-- ─── opportunity_applications ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunity_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  opportunity_id uuid NOT NULL
    REFERENCES public.marketplace_opportunities(id) ON DELETE CASCADE,

  business_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,

  -- The share package the applicant handed over. NULL until the
  -- applicant bundles one; app enforces "must be set at submit" server-side.
  share_package_id uuid
    REFERENCES public.share_packages(id),

  application_status text NOT NULL DEFAULT 'draft'
    CHECK (application_status IN ('draft','submitted','shortlisted','accepted','declined','withdrawn')),

  submitted_at timestamptz,

  -- Free-form applicant answers to opportunity-specific questions. The
  -- schema is decided per opportunity; JSONB keeps it flexible.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS opportunity_applications_opp_biz_uniq
  ON public.opportunity_applications (opportunity_id, business_id);

CREATE INDEX IF NOT EXISTS opportunity_applications_status_idx
  ON public.opportunity_applications (application_status);

ALTER TABLE public.opportunity_applications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.opportunity_applications IS
  'Master Upgrade Plan §21 — a business applying to a marketplace opportunity. share_package_id bundles the consent-scoped payload the provider reads.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
