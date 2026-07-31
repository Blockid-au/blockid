-- 0298_profile_kind_discriminator.sql
-- Adds `public.projects.profile_kind` — the discriminator that lets the
-- public Business ID surfaces tell a REAL verified customer apart from
-- SAMPLE DATA.
--
-- Problem this fixes
-- ------------------
-- Before this column every row on /id/[slug] rendered identically: the
-- hero showed "Verified Business Identity", the ladder chip showed
-- "L{n} {label}", and /embed/badge emitted an SVG reading
-- "BlockID Verified — Level {n}". That chrome is truthful for a business
-- that actually went through verification. It is NOT truthful for the
-- seeded demo rows, and the badge is the sharpest edge: it is hotlinked
-- as an <img> onto third-party pages where it appears stripped of all
-- surrounding context. A demo badge reading "BlockID Verified — Level 3"
-- on someone else's website is a false verification claim.
--
-- Rather than rely on every future template edit remembering to special-
-- case the demo slugs by name, the distinction becomes a first-class
-- column that the reader whitelists and the renderers branch on. See
-- src/lib/business-id/profile-disclosure.ts (pure rules + colocated test)
-- and src/lib/business-id/public-profile.ts (whitelist).
--
-- Values
-- ------
--   'customer' (DEFAULT) — a real business; verified chrome is honest.
--   'demo'               — sample data; every public surface MUST carry a
--                          visible "Sample data" disclosure.
--
-- The CHECK constraint is deliberately closed. Adding a third kind later
-- is a one-line migration; silently accepting a typo'd kind would make
-- the reader fall back to 'customer' and drop a disclosure, which is the
-- exact failure mode this column exists to prevent.
--
-- DEFAULT 'customer' is safe for the backfill: at the time of writing
-- every existing row is either a real founder's private project (no
-- public_slug, never rendered publicly) or the demo seeded by 0297, and
-- 0297's row is explicitly re-marked 'demo' at the bottom of this file.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + a guarded constraint add, so a
-- re-run is a no-op.
--
-- Applied via:
--   docker cp 0298_profile_kind_discriminator.sql supabase-db:/tmp/x.sql
--   docker exec supabase-db psql -U postgres -d postgres -f /tmp/x.sql
--
-- Reserved lane: 02xx spec lane per Master Upgrade Plan §5.2.

BEGIN;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS profile_kind text NOT NULL DEFAULT 'customer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.projects'::regclass
       AND conname  = 'projects_profile_kind_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_profile_kind_check
      CHECK (profile_kind IN ('customer', 'demo'));
  END IF;
END $$;

COMMENT ON COLUMN public.projects.profile_kind IS
  'Discriminator for the public /id/[slug] surfaces. ''customer'' = a real verified business (verified chrome is truthful). ''demo'' = SAMPLE DATA — the page, the VI mirror, the JSON API and the /embed/badge SVG must all carry a visible "Sample data" disclosure and must never make an unqualified "BlockID Verified" claim. Branching lives in src/lib/business-id/profile-disclosure.ts and is pinned by its colocated test. Added by migration 0298.';

-- ── Backfill: 0297's seeded demo is sample data ────────────────────
-- 0297 seeds "BlockID Demo Co (Sample Profile)" — a fictional business
-- with fictional attesters, referenced by the /business-id marketing
-- page. It carried verified chrome only because there was no way to say
-- otherwise. Mark it now.
UPDATE public.projects
   SET profile_kind = 'demo',
       updated_at   = now()
 WHERE public_slug = 'blockid-demo'
   AND profile_kind IS DISTINCT FROM 'demo';

COMMIT;

NOTIFY pgrst, 'reload schema';
