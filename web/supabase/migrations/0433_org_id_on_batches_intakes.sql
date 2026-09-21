-- 0433_org_id_on_batches_intakes.sql
-- ---------------------------------------------------------------------------
-- G22-B (2026-09-21, docs/plans/g22-upgrade-hardening-2026-09-21.md § 2 B)
-- The organisation model reaches the two institutional artefact tables:
--
--   evaluation_batches.org_id  uuid NULL → investor_organisations(id)
--                              ON DELETE SET NULL, indexed (new column)
--   program_intakes.org_id     already present since 0405 as a bare
--                              `uuid NULL` (never stamped, no FK, no index);
--                              this migration adds the FK + index so both
--                              tables carry the same shape.
--
-- Why
--   G21 P3 review (2026-09-21): a seat holder can sit in several
--   organisations and owns a personal one, and neither table carried an
--   org id — so retention (lib/org/retention.ts) and the audit export
--   (lib/org/audit-export.ts) had to treat the OWNER ACCOUNT as the
--   organisation. With `org_id` stamped at creation from
--   `resolveActingOrg(creator)` (lib/investor/organisations.ts — the org the
--   creator acts for, personal org included) the scope becomes
--   `org_id = org`, unioned with owner-owned rows that still have no org_id
--   (rows created before this migration and not yet backfilled), so nothing
--   shipped earlier is orphaned.
--
-- Backfill (run AFTER applying; dry-run by default):
--   node web/scripts/org/backfill-org-ids.mjs            # counts only
--   node web/scripts/org/backfill-org-ids.mjs --write    # stamps org_id
--
-- No app_users FK is added → the erasure map (lib/privacy/erasure-map.ts)
-- is unchanged. Deleting an organisation detaches its cohorts / intake
-- links (SET NULL); the rows themselves stay with their creator.
--
-- Idempotent: IF NOT EXISTS + DO-guarded FKs. Readers and the two insert
-- paths fall back on 42703 until this file is applied.
--
-- Apply: scripts/db/apply-migration.sh web/supabase/migrations/0433_org_id_on_batches_intakes.sql
-- ---------------------------------------------------------------------------

BEGIN;

-- ─── 1. evaluation_batches.org_id ────────────────────────────────────────────

ALTER TABLE public.evaluation_batches
  ADD COLUMN IF NOT EXISTS org_id uuid NULL;

DO $$
BEGIN
  IF to_regclass('public.investor_organisations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'evaluation_batches_org_id_fkey'
          AND conrelid = 'public.evaluation_batches'::regclass
     ) THEN
    ALTER TABLE public.evaluation_batches
      ADD CONSTRAINT evaluation_batches_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.investor_organisations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS evaluation_batches_org_id_idx
  ON public.evaluation_batches (org_id)
  WHERE org_id IS NOT NULL;

COMMENT ON COLUMN public.evaluation_batches.org_id IS
  'G22-B: the investor_organisations row the creator acted for when the cohort was made (resolveActingOrg; personal org included). NULL = created before 0433 and not yet backfilled (scripts/org/backfill-org-ids.mjs) — retention / audit export then fall back to owner-owned rows. SET NULL when the organisation is deleted.';

-- ─── 2. program_intakes.org_id (column since 0405; FK + index here) ──────────

ALTER TABLE public.program_intakes
  ADD COLUMN IF NOT EXISTS org_id uuid NULL;

DO $$
BEGIN
  IF to_regclass('public.investor_organisations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'program_intakes_org_id_fkey'
          AND conrelid = 'public.program_intakes'::regclass
     ) THEN
    -- 0405 never stamped the column, so no live row can violate the FK;
    -- NOT VALID is still cheaper on a large table and VALIDATE runs after.
    ALTER TABLE public.program_intakes
      ADD CONSTRAINT program_intakes_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.investor_organisations(id) ON DELETE SET NULL
      NOT VALID;
    ALTER TABLE public.program_intakes VALIDATE CONSTRAINT program_intakes_org_id_fkey;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS program_intakes_org_id_idx
  ON public.program_intakes (org_id)
  WHERE org_id IS NOT NULL;

COMMENT ON COLUMN public.program_intakes.org_id IS
  'G22-B: the investor_organisations row the creator acted for when the intake link was made (resolveActingOrg; personal org included). Column from 0405, FK + index from 0433. NULL = created before 0433 and not yet backfilled — retention / audit export then fall back to owner-owned rows. SET NULL when the organisation is deleted.';

COMMIT;

NOTIFY pgrst, 'reload schema';
