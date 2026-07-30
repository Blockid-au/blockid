-- 0273_public_business_profiles.sql
-- Stage 4 Batch D · sub-D1 — Public Business Profile columns.
--
-- Master Upgrade Plan §11.1 field definitions + §14bis user-locked
-- decision D3 (`/id/[slug]` is public-by-default indexable with owner
-- opt-out via share_settings.public_index=false; here modelled as a
-- top-level `public_index` boolean for a cheap partial index on the
-- sitemap/discovery reader).
--
-- Scaffold-on-projects rationale
-- ------------------------------
-- The v3 first-class `businesses` table lands as migration 0202 in
-- Phase 2. Until then we scaffold public profile fields directly on
-- `public.projects` (mirroring 0270_report_orders.sql which points
-- report_orders.business_id at projects.id today). When 0202 ships a
-- follow-up migration will lift these columns onto businesses(id) and
-- drop them from projects.
--
-- Column-naming note
-- ------------------
-- Migration 0020_multi_project.sql already introduced `projects.slug`
-- as a NOT NULL, per-user-scoped text (`UNIQUE(user_id, slug)`) that
-- powers the founder's private URL. We CANNOT reuse it for the
-- publicly-indexable Business ID URL because:
--   1. Existing slugs are per-user unique, not globally unique.
--   2. `NOT NULL` prevents the "not-yet-published" state.
--   3. Owners must be able to choose a public handle distinct from
--      their internal project slug (naming collisions, rebrands).
-- So this migration adds `public_slug text UNIQUE` (nullable) — filled
-- only when the owner publishes. The Zod helper and `/id/[slug]` route
-- both take a URL param called `slug`; internally they query on
-- `public_slug`.
--
-- Idempotency: every DDL uses IF NOT EXISTS. Single BEGIN/COMMIT.
--
-- Reserved lane: this migration sits in the 02xx spec lane per Master
-- Upgrade Plan §5.2. CEO loop must not author files matching 02xx_*.sql.

BEGIN;

-- ─── Columns ────────────────────────────────────────────────────────

-- Public URL handle. Nullable — a row is "not-yet-published" until an
-- owner claims a public_slug. Globally unique via partial index below.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS public_slug text;

-- Ladder position. 0 = unverified, 1 = self-declared, 2 = evidence-checked,
-- 3 = trust, 4 = trust-with-attestations, 5 = continuous-monitoring.
-- Only L2+ profiles appear in the public sitemap per §11.1.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS verification_level smallint NOT NULL DEFAULT 0
    CHECK (verification_level BETWEEN 0 AND 5);

-- 12-area capability scores (Leadership & People, Strategy & Commercial,
-- Ops & Performance, Tech & Digital — 3 pillars per cluster). Stored as
-- JSONB so a schema bump doesn't require DDL. Public view exposes the
-- 12 numeric scores only — never raw evidence.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS capability_scores jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Recency signals. `last_verified_at` drives the badge freshness chip
-- + sitemap lastModified; `next_review_at` drives cron re-verification
-- reminders (nightly job flips verification_level down if overdue).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS next_review_at timestamptz;

-- §14bis D3 default: public-by-default indexable. Owners opt out by
-- toggling this to false in Founder Settings → Business ID → Public
-- profile, which flips the /id/[slug] page to noindex AND drops the
-- entry from the sitemap.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS public_index boolean NOT NULL DEFAULT true;

-- Share/embed preferences (badge sizing, embed allow-list domains,
-- share-package expiry defaults). Kept as JSONB to avoid future DDL.
-- Also mirrors D3 as `share_settings.public_index` for API consumers
-- who expect the nested shape; the top-level `public_index` column is
-- the source-of-truth the partial index uses.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS share_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Attestations = third-party statements about the business (auditor,
-- customer, investor). Public view exposes a whitelisted summary only:
-- attester display name + statement type + issued_at — never raw docs.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS attestations jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ─── Indexes ────────────────────────────────────────────────────────

-- Global uniqueness on public_slug — partial so nulls (unpublished
-- profiles) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS projects_public_slug_uniq
  ON public.projects (public_slug)
  WHERE public_slug IS NOT NULL;

-- Sitemap/discovery reader hits this. `public_index=true AND
-- verification_level>=2` is the D4 sitemap filter — a composite btree
-- covers both predicates plus the ORDER BY lastModified DESC.
CREATE INDEX IF NOT EXISTS projects_public_discovery_idx
  ON public.projects (public_index, last_verified_at);

-- ─── Column comments (spec cross-reference) ─────────────────────────

COMMENT ON COLUMN public.projects.public_slug IS
  'Master Upgrade Plan §11.1 field — globally unique public handle for /id/[slug]. Nullable until the owner publishes. Distinct from projects.slug which stays per-user-scoped for the private founder URL.';

COMMENT ON COLUMN public.projects.verification_level IS
  'Master Upgrade Plan §11.1 field — verification ladder position (0..5). 0 unverified, 1 self-declared, 2 evidence-checked, 3 trust, 4 trust-with-attestations, 5 continuous-monitoring. Only L2+ appears in the public sitemap.';

COMMENT ON COLUMN public.projects.capability_scores IS
  'Master Upgrade Plan §11.1 field — 12-area analysis scores (Leadership & People, Strategy & Commercial, Ops & Performance, Tech & Digital; 3 pillars per cluster). Public view exposes the 12 numeric scores only; raw evidence never leaks.';

COMMENT ON COLUMN public.projects.last_verified_at IS
  'Master Upgrade Plan §11.1 field — timestamp of the most recent successful verification. Drives badge freshness chip and sitemap lastModified.';

COMMENT ON COLUMN public.projects.next_review_at IS
  'Master Upgrade Plan §11.1 field — when the nightly re-verification job should re-check this business. Overdue profiles are demoted a level.';

COMMENT ON COLUMN public.projects.public_index IS
  'Master Upgrade Plan §14bis D3 — public-by-default indexable. Owner opt-out via Founder Settings → Business ID → Public profile flips this to false, which sets /id/[slug] to noindex AND drops the sitemap entry.';

COMMENT ON COLUMN public.projects.share_settings IS
  'Master Upgrade Plan §11.1 field — share/embed preferences (badge sizing, embed allow-list domains, share-package expiry defaults). Mirrors public_index nested as share_settings.public_index for API consumers; the top-level column is the source of truth.';

COMMENT ON COLUMN public.projects.attestations IS
  'Master Upgrade Plan §11.1 field — third-party statements (auditor, customer, investor). Public view exposes whitelisted summary only: attester display name + statement type + issued_at.';

COMMIT;

-- After apply:
-- NOTIFY pgrst reload
