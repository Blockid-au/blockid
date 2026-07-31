-- 0299_seed_sprocketbay_demo_profile.sql
-- Seeds the BlockID process demo: a demo-only account plus a fictional
-- Australian B2B SaaS company that carries the FULL public Business ID
-- (ladder + 12 capability scores + attestations) at
-- https://blockid.au/id/sprocketbay-demo
--
-- WHY A FICTIONAL COMPANY
-- -----------------------
-- The demo needs to show the whole BlockID process end to end, which
-- means showing a populated verification level, a full capability radar
-- and third-party attestations. Doing that against a REAL company would
-- be an impersonation: the page would read as though that company were a
-- BlockID customer whose evidence BlockID had verified and whose
-- attesters had signed off. Real, publicly-listed companies are used on
-- this platform only as market-reference / benchmark data inside the
-- /showcase/* surfaces, never as an /id/[slug] identity profile.
--
-- A company that exists only in this migration impersonates nobody, so it
-- can legitimately carry the full ladder.
--
-- SAMPLE DATA — NOT A REAL BUSINESS
-- ---------------------------------
--   * Legal name is "Sprocketbay Demo Co (Sample Profile)", following the
--     naming convention 0297 established for "BlockID Demo Co (Sample
--     Profile)". "Sprocketbay" is a coined compound chosen because a
--     search turned up no company trading under it; the "(Sample
--     Profile)" suffix is what actually does the work, and it is present
--     in the H1, the <title>, the JSON-LD and the embed badge.
--   * NO ABN is recorded, and no `abn` column is added — 0297 declined to
--     add one for a reason that still holds: Australian ABNs carry a
--     modulus-89 checksum and are publicly searchable on ABN Lookup, so
--     publishing a plausible-looking one against a fictional business
--     risks colliding with a real entity. If a placeholder ever becomes
--     unavoidable the only acceptable value is the all-zero non-checksum
--     string `00 000 000 000`. Auschain PTY LTD's real ABN
--     (79 659 615 111) must NEVER be attached to a demo row.
--   * Every attester name is suffixed "(sample)" so a screenshot cannot
--     be mistaken for a genuine third-party endorsement. None of them is
--     a real firm.
--   * No real company's name, product names, or trade dress is reused.
--   * Capability scores, dates and the verification level are
--     illustrative fixtures. `profile_kind = 'demo'` (migration 0298)
--     makes every public surface say so.
--
-- THE FICTIONAL ARC (structure only — invented, not modelled on any
-- specific company's private facts)
-- ------------------------------------------------------------------
-- Sydney-founded developer-collaboration tooling, bootstrapped on a
-- low-touch self-serve motion, no outbound sales team, later a secondary
-- round that gave early staff liquidity rather than funding operations,
-- now preparing for listing-grade reporting. That shape is the generic
-- bootstrapped-to-scale pattern the platform's guidance is built around;
-- it is a template, not a biography.
--
-- OWNERSHIP
-- ---------
-- `projects.user_id` is NOT NULL with an FK to `app_users(id)`, so the
-- demo needs a real owner. Unlike 0297 (which hung its row off the live
-- operator account) this migration mints a dedicated `demo@blockid.au`
-- account, because:
--   a) the demo now owns a full published identity and should not share
--      a blast radius with the operator's own account, and
--   b) `blockid.au` is BlockID's own domain, so the account is
--      unambiguously BlockID-operated — it cannot read as a third party.
-- The account is password-less and has no auth identity; it exists to
-- own the row, not to be logged into.
--
-- Every FK is resolved by lookup — no hard-coded UUIDs — so the migration
-- is portable across environments.
--
-- PUBLICATION SETTINGS
-- --------------------
--   public_slug        = 'sprocketbay-demo'
--   public_index       = true    → §14bis D3 public-by-default
--   profile_kind       = 'demo'  → forces the "Sample data" disclosure
--   verification_level = 4 ("attested") → high enough to exercise the
--                        whole badge ladder (identity-verified →
--                        evidence-checked → trust-tier → attested) and to
--                        clear the sitemap's L2+ bar, while leaving L5
--                        ("continuously monitored") above it so the
--                        ladder still visibly reads as a ladder.
--   trust score          NOT stored — public-profile.ts derives it as the
--                        mean of capability_scores (here: 81.3, which
--                        also earns the "high-performer" badge at ≥80).
--
-- Idempotency: the account insert is guarded by an email lookup, and the
-- project insert uses ON CONFLICT on the (user_id, slug) unique
-- constraint, so a re-run refreshes in place and never duplicates or
-- collides with the partial unique index on public_slug.
--
-- Applied via:
--   docker cp 0299_seed_sprocketbay_demo_profile.sql supabase-db:/tmp/x.sql
--   docker exec supabase-db psql -U postgres -d postgres -f /tmp/x.sql
--
-- Depends on: 0273 (public profile columns), 0298 (profile_kind).
-- Reserved lane: 02xx spec lane per Master Upgrade Plan §5.2.

BEGIN;

DO $$
DECLARE
  owner_id uuid;
BEGIN
  -- ── 1. Demo-only owner account ───────────────────────────────────
  SELECT id INTO owner_id
    FROM public.app_users
   WHERE lower(email) = 'demo@blockid.au'
   LIMIT 1;

  IF owner_id IS NULL THEN
    INSERT INTO public.app_users (
      email,
      display_name,
      role,
      plan,
      account_type,
      segment,
      jurisdiction,
      onboarding_completed,
      startup_name,
      industry
    ) VALUES (
      'demo@blockid.au',
      'BlockID Demo (Sample Account)',
      'user',
      'free',
      'founder',
      'founder',
      'AU',
      true,
      'Sprocketbay Demo Co (Sample Profile)',
      'Software & SaaS'
    )
    RETURNING id INTO owner_id;
  ELSE
    UPDATE public.app_users
       SET display_name = 'BlockID Demo (Sample Account)',
           account_type = 'founder',
           segment      = 'founder',
           jurisdiction = 'AU',
           startup_name = 'Sprocketbay Demo Co (Sample Profile)',
           industry     = 'Software & SaaS'
     WHERE id = owner_id;
  END IF;

  IF owner_id IS NULL THEN
    RAISE EXCEPTION
      'Failed to resolve or create app_users row for demo@blockid.au — cannot seed /id/sprocketbay-demo.';
  END IF;

  -- ── 2. The public demo profile ───────────────────────────────────
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
    profile_kind,
    verification_level,
    capability_scores,
    last_verified_at,
    next_review_at,
    public_index,
    share_settings,
    attestations
  ) VALUES (
    owner_id,
    'Sprocketbay Demo Co (Sample Profile)',
    'sprocketbay-demo',
    'SAMPLE DATA — not a real business. A fictional Sydney-founded B2B SaaS company (developer collaboration tooling, low-touch self-serve motion, bootstrapped to a later-stage employee-liquidity secondary, now working towards listing-grade reporting) used to demonstrate the full BlockID process on a public Verified Business Profile. No ABN, no real financials, no real attesters, no relationship to any real company. profile_kind=''demo'' forces the "Sample data" disclosure on every public surface.',
    'Software & SaaS',
    6,
    false,
    'scale',
    78,
    'sprocketbay-demo',
    'demo',
    4,
    -- The 12 analysis areas from Master Upgrade Plan §6, keyed exactly as
    -- the radar in src/app/id/[slug]/public-profile-shared.tsx expects.
    -- Mean = 81.3 → the derived public score (and ≥80, so the
    -- "high-performer" badge renders too).
    jsonb_build_object(
      'leadership',  84,
      'people',      79,
      'culture',     86,
      'strategy',    88,
      'commercial',  76,
      'brand',       72,
      'ops',         83,
      'performance', 80,
      'risk',        78,
      'tech',        91,
      'digital',     85,
      'data',        74
    ),
    timestamptz '2026-07-20 00:00:00+00',
    timestamptz '2026-10-20 00:00:00+00',
    true,
    jsonb_build_object(
      'public_index', true,
      'badge_size', 'md',
      'embed_allowed_domains', jsonb_build_array('*'),
      'is_demo', true
    ),
    -- The public view exposes attester + type + issuedAt only (whitelist
    -- in src/lib/business-id/public-profile.ts). Every attester below is
    -- INVENTED and flagged "(sample)"; none is a real firm, and none of
    -- them has attested to anything.
    jsonb_build_array(
      jsonb_build_object(
        'attester', 'Harbourfield Assurance (sample)',
        'type', 'auditor',
        'issuedAt', '2026-06-18T00:00:00Z'
      ),
      jsonb_build_object(
        'attester', 'Meridian Freight Group (sample)',
        'type', 'customer',
        'issuedAt', '2026-05-27T00:00:00Z'
      ),
      jsonb_build_object(
        'attester', 'Tallowbox Ventures (sample)',
        'type', 'investor',
        'issuedAt', '2026-04-30T00:00:00Z'
      ),
      jsonb_build_object(
        'attester', 'Redgum Cloud Partners (sample)',
        'type', 'partner',
        'issuedAt', '2026-03-11T00:00:00Z'
      )
    )
  )
  ON CONFLICT ON CONSTRAINT projects_user_id_slug_key DO UPDATE
    SET name                  = EXCLUDED.name,
        description           = EXCLUDED.description,
        industry              = EXCLUDED.industry,
        stage                 = EXCLUDED.stage,
        growth_phase_current  = EXCLUDED.growth_phase_current,
        growth_completion_pct = EXCLUDED.growth_completion_pct,
        public_slug           = EXCLUDED.public_slug,
        profile_kind          = EXCLUDED.profile_kind,
        verification_level    = EXCLUDED.verification_level,
        capability_scores     = EXCLUDED.capability_scores,
        last_verified_at      = EXCLUDED.last_verified_at,
        next_review_at        = EXCLUDED.next_review_at,
        public_index          = EXCLUDED.public_index,
        share_settings        = EXCLUDED.share_settings,
        attestations          = EXCLUDED.attestations,
        updated_at            = now();
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
