-- 0297_seed_demo_business_profile.sql
-- Stage 4 Batch D · sub-D9 — seed the public demo Business ID profile.
--
-- Problem this fixes
-- ------------------
-- `https://blockid.au/id/blockid-demo` 404'd. The /business-id marketing
-- page (see src/app/(marketing)/business-id/business-id-shared.tsx, badge
-- widget preview) prints `blockid.au/id/blockid-demo` as the canonical
-- sample profile, and Master Upgrade Plan §7.2 block 4 specs the
-- Trust-Score preview against that same URL. Before this migration there
-- was NOT A SINGLE row in public.projects with a non-null `public_slug`,
-- so every public surface (/id/[slug], /vi/id/[slug], /embed/badge,
-- /api/v1/id/[slug], sitemap) had nothing to render.
--
-- This migration is DATA ONLY. No DDL beyond a column comment; the
-- columns themselves land in 0273_public_business_profiles.sql.
--
-- SAMPLE DATA — NOT A REAL BUSINESS
-- ---------------------------------
--   * Legal name is "BlockID Demo Co (Sample Profile)" — it deliberately
--     does not resemble, and must never be changed to resemble, a real
--     trading entity.
--   * NO ABN is recorded. `public.projects` has no `abn` column and none
--     is added here on purpose: Australian ABNs carry a modulus-89
--     checksum and are publicly searchable on ABN Lookup, so publishing a
--     made-up one on a fake business risks colliding with a real entity.
--     If a placeholder ever becomes necessary the only acceptable value
--     is the all-zero non-checksum string `00 000 000 000`. Auschain PTY
--     LTD's real ABN (79 659 615 111) must NEVER be attached to this or
--     any other demo row.
--   * Every attester name is suffixed "(sample)" so a screenshot of the
--     profile cannot be mistaken for a genuine third-party endorsement.
--   * Capability scores and dates are illustrative fixtures.
--
-- Ownership
-- ---------
-- `projects.user_id` is NOT NULL with an FK to `app_users(id)`
-- (ON DELETE CASCADE), so the demo needs a real owner. We attach it to
-- the existing `admin@blockid.au` account rather than minting a synthetic
-- user, because:
--   a) a synthetic app_users row would need an auth identity to be
--      loginable and would otherwise become an orphaned account, and
--   b) the platform operator should be the one who can edit/unpublish the
--      demo from the normal Founder Settings UI.
-- The lookup is by email, not a hard-coded UUID, so the migration is
-- portable across environments. If `admin@blockid.au` is absent the
-- migration RAISEs rather than silently seeding nothing.
--
-- Publication settings
-- --------------------
--   public_slug        = 'blockid-demo'   → the URL the marketing copy prints
--   public_index       = true             → §14bis D3 public-by-default
--   verification_level = 3 ("trust tier") → clears the sitemap's L2+ bar
--                                           (src/app/sitemap.ts) and shows a
--                                           meaningful, non-maximal rung so
--                                           the ladder still reads as a ladder
--   trust score          NOT stored — public-profile.ts derives it as the
--                        mean of capability_scores (here: 77.0)
--
-- Idempotency: ON CONFLICT on the (user_id, slug) unique constraint, so a
-- re-run refreshes the demo in place and never duplicates or collides with
-- the partial unique index on public_slug.
--
-- Applied via:
--   docker cp 0297_seed_demo_business_profile.sql supabase-db:/tmp/x.sql
--   docker exec supabase-db psql -U postgres -d postgres -f /tmp/x.sql
--
-- Reserved lane: 02xx spec lane per Master Upgrade Plan §5.2.

BEGIN;

DO $$
DECLARE
  owner_id uuid;
BEGIN
  SELECT id INTO owner_id
    FROM public.app_users
   WHERE lower(email) = 'admin@blockid.au'
   LIMIT 1;

  IF owner_id IS NULL THEN
    RAISE EXCEPTION
      'app_users row for admin@blockid.au is missing — cannot seed the /id/blockid-demo profile. Create the operator account first, or repoint this migration at another owner.';
  END IF;

  INSERT INTO public.projects (
    user_id,
    name,
    slug,
    description,
    industry,
    stage,
    is_default,
    growth_phase_current,
    growth_completion_pct,
    public_slug,
    verification_level,
    capability_scores,
    last_verified_at,
    next_review_at,
    public_index,
    share_settings,
    attestations
  ) VALUES (
    owner_id,
    'BlockID Demo Co (Sample Profile)',
    'blockid-demo',
    'SAMPLE DATA — not a real business. Fictional company used to demonstrate the public Verified Business Profile at /id/blockid-demo. No ABN, no real financials, no real attesters. Referenced by the /business-id marketing page and the homepage trust-score preview.',
    'Software & SaaS',
    3,
    false,
    'traction',
    62,
    'blockid-demo',
    3,
    -- 12 analysis areas, keyed exactly as the radar in
    -- src/app/id/[slug]/public-profile-shared.tsx expects.
    -- Mean = 77.0 → the derived public trust score.
    jsonb_build_object(
      'leadership',  82,
      'people',      74,
      'culture',     79,
      'strategy',    85,
      'commercial',  71,
      'brand',       68,
      'ops',         77,
      'performance', 73,
      'risk',        81,
      'tech',        88,
      'digital',     76,
      'data',        70
    ),
    timestamptz '2026-07-15 00:00:00+00',
    timestamptz '2026-10-15 00:00:00+00',
    true,
    jsonb_build_object(
      'public_index', true,
      'badge_size', 'md',
      'embed_allowed_domains', jsonb_build_array('*'),
      'is_demo', true
    ),
    -- Public view exposes attester + type + issuedAt only (whitelist in
    -- src/lib/business-id/public-profile.ts). Every attester is flagged
    -- "(sample)" so the demo can never read as a real endorsement.
    jsonb_build_array(
      jsonb_build_object(
        'attester', 'Demo Assurance Partners (sample)',
        'type', 'auditor',
        'issuedAt', '2026-06-02T00:00:00Z'
      ),
      jsonb_build_object(
        'attester', 'Sample Customer Pty Ltd (sample)',
        'type', 'customer',
        'issuedAt', '2026-05-14T00:00:00Z'
      ),
      jsonb_build_object(
        'attester', 'Demo Seed Fund (sample)',
        'type', 'investor',
        'issuedAt', '2026-04-08T00:00:00Z'
      )
    )
  )
  ON CONFLICT ON CONSTRAINT projects_user_id_slug_key DO UPDATE
    SET name                  = EXCLUDED.name,
        description           = EXCLUDED.description,
        industry              = EXCLUDED.industry,
        public_slug           = EXCLUDED.public_slug,
        verification_level    = EXCLUDED.verification_level,
        capability_scores     = EXCLUDED.capability_scores,
        last_verified_at      = EXCLUDED.last_verified_at,
        next_review_at        = EXCLUDED.next_review_at,
        public_index          = EXCLUDED.public_index,
        share_settings        = EXCLUDED.share_settings,
        attestations          = EXCLUDED.attestations,
        updated_at            = now();
END $$;

COMMENT ON COLUMN public.projects.public_slug IS
  'Master Upgrade Plan §11.1 field — globally unique public handle for /id/[slug]. Nullable until the owner publishes. Distinct from projects.slug which stays per-user-scoped for the private founder URL. NOTE: public_slug=''blockid-demo'' is reserved SAMPLE DATA seeded by migration 0297 — a fictional business (no ABN, fictional attesters) that backs the /business-id marketing preview. Do not unpublish it or the marketing pages 404.';

COMMIT;

NOTIFY pgrst, 'reload schema';
