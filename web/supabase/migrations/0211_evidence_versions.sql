-- 0211_evidence_versions.sql
-- v3 Master Upgrade Plan Phase 3 §12.4 / §5.2 lane 0210-0212 / §5.3
-- append-only version log for public.evidence.
--
-- Purpose: every write to evidence (initial upload OR later
-- re-upload / metadata correction) creates one row here so the
-- verifier can reconstruct exactly what bytes existed at what time.
-- version_number is monotonic per evidence_id and is auto-assigned
-- by the BEFORE INSERT trigger below if the caller does not supply
-- one, so application code never has to reason about race-safe
-- numbering.
--
-- Idempotency: DDL uses IF NOT EXISTS; the trigger function is
-- CREATE OR REPLACE with a DROP TRIGGER IF EXISTS beforehand so the
-- migration re-applies cleanly.
--
-- RLS: enabled defense-in-depth (writes go through service-role).

BEGIN;

CREATE TABLE IF NOT EXISTS public.evidence_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  evidence_id uuid NOT NULL
    REFERENCES public.evidence(id) ON DELETE CASCADE,

  -- Monotonic per evidence_id. Auto-assigned by the trigger below
  -- when NULL / <= 0 so callers can insert without a SELECT MAX race.
  version_number integer NOT NULL,

  -- Snapshot of the binary as it existed at this version. sha256 is
  -- the same lowercase hex format enforced elsewhere; storage_path
  -- points at the immutable object in the `evidence` bucket (each
  -- version is a distinct storage object — we never mutate in place).
  sha256 text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  content_type text NOT NULL,

  created_by uuid REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Optional human-readable audit note ("re-scanned at higher DPI",
  -- "replaced page 3", "founder corrected issuer name").
  change_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS evidence_versions_evidence_version_uniq
  ON public.evidence_versions (evidence_id, version_number);

CREATE INDEX IF NOT EXISTS evidence_versions_evidence_created_idx
  ON public.evidence_versions (evidence_id, created_at DESC);

ALTER TABLE public.evidence_versions ENABLE ROW LEVEL SECURITY;

-- Auto-assign version_number if the caller did not supply one (or
-- passed NULL / 0). Uses MAX+1 inside the same row-locking BEFORE
-- INSERT so concurrent inserts serialise on the evidence_id lookup;
-- combined with the UNIQUE index above, a losing writer sees a
-- unique-violation and can retry safely.
DROP FUNCTION IF EXISTS public.evidence_versions_bump_on_insert() CASCADE;
CREATE OR REPLACE FUNCTION public.evidence_versions_bump_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version_number IS NULL OR NEW.version_number <= 0 THEN
    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO NEW.version_number
      FROM public.evidence_versions
      WHERE evidence_id = NEW.evidence_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evidence_versions_bump_trg
  ON public.evidence_versions;
CREATE TRIGGER evidence_versions_bump_trg
  BEFORE INSERT ON public.evidence_versions
  FOR EACH ROW EXECUTE FUNCTION public.evidence_versions_bump_on_insert();

COMMENT ON TABLE public.evidence_versions IS
  'Append-only version log for public.evidence. One row per binary/metadata mutation. version_number is auto-assigned per evidence_id by the BEFORE INSERT trigger. Master Upgrade Plan Phase 3 §12.4 / §5.3.';

COMMENT ON COLUMN public.evidence_versions.version_number IS
  'Monotonic per evidence_id. Callers may leave NULL and the trigger evidence_versions_bump_on_insert will set it to MAX+1.';

COMMENT ON COLUMN public.evidence_versions.storage_path IS
  'Immutable storage object for this specific version — we never mutate an object in place. New version = new upload = new storage_path.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
