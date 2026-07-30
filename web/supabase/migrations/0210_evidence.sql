-- 0210_evidence.sql
-- v3 Master Upgrade Plan Phase 3 §12.4 / §5.2 lane 0210-0212 / §5.3
-- evidence pipeline root table.
--
-- Purpose: canonical registry of every founder-uploaded artefact
-- (identity docs, cap table PDFs, board minutes, revenue exports,
-- product screenshots, etc.). Each row is the "current" pointer for a
-- logical evidence item; every mutation of the underlying binary
-- appends an immutable row to evidence_versions (0211). Structured
-- extraction output (LLM/OCR) is stored in evidence_extractions (0212)
-- pinned to a specific version.
--
-- FK notes:
--   * business_id references public.projects.id in this phase — the
--     first-class businesses(id) table lands as migration 0202 in
--     Phase 2 and a follow-up will re-point this FK without dropping
--     data. This is the same scaffolding pattern used by 0270.
--   * owner_user_id references public.app_users(id) — the platform's
--     first-class user identity (originating in early 000x migrations).
--
-- Idempotency:
--   Every DDL uses IF NOT EXISTS so re-application is a no-op. A
--   single BEGIN/COMMIT wraps the change so a partial failure rolls
--   back cleanly. Trailing NOTIFY reload asks PostgREST to reload its
--   schema cache without a service restart.
--
-- RLS: enabled defense-in-depth. All app writes today go through the
-- service-role key (BYPASSRLS); explicit policies land alongside the
-- HTTP route in Phase 3 Batch H.
--
-- Reserved lane: 02xx spec lane per Master Plan §5.2. CEO autonomous
-- loop must not author files matching 02xx_*.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope. business_id = entity the evidence belongs to. Points at
  -- projects until Phase 2 introduces the first-class businesses table.
  business_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.app_users(id),

  -- Open enum kept as text so a new category (e.g. `esg`) does not
  -- need a schema migration. Application layer validates against the
  -- canonical list; unknown values are tolerated for forward-compat.
  --   identity | governance | financial | product | traction |
  --   compliance | ip | people | esg | security | contract | other
  category text NOT NULL,

  -- Binary metadata. content_type is the MIME reported at upload time
  -- (application/pdf, image/png, ...). size_bytes must be positive to
  -- reject empty uploads at the DB layer.
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),

  -- Tamper evidence. Lowercase 64-char hex SHA-256 of the file bytes.
  -- Verified server-side by web/src/lib/evidence/hash-verify.ts before
  -- persisting the row.
  sha256 text NOT NULL,

  -- Supabase Storage path inside the private `evidence` bucket. Never
  -- served directly; access is brokered through signed URLs scoped to
  -- the requesting user's business membership.
  storage_path text NOT NULL,

  -- Sensitivity classification driving redaction + share-link policy.
  --   public            — safe to publish (e.g. marketing PDF)
  --   private (default) — visible to business members only
  --   restricted        — visible to owner + explicit collaborators
  --   highly_sensitive  — owner-only, extra audit logging
  sensitivity text NOT NULL DEFAULT 'private'
    CHECK (sensitivity IN ('public','private','restricted','highly_sensitive')),

  -- Provenance. Self-declared by the uploader; unverified until
  -- extractor or reviewer confirms.
  issuer text,
  issued_at date,
  expires_at date,

  -- Verification state machine — full transition table lives in
  -- web/src/lib/evidence/state-machine.ts. DB only enforces the enum;
  -- the pure helper enforces legal transitions.
  --   uploaded → processing → classified → verified
  --                        ↘ validation_required → verified|rejected
  --   any → expired (if now > expires_at)
  --   verified|expired → archived
  verification_state text NOT NULL DEFAULT 'uploaded'
    CHECK (verification_state IN (
      'uploaded','processing','classified','validation_required',
      'verified','rejected','expired','archived'
    )),

  -- Anti-malware scan verdict. NULL until the ClamAV worker runs
  -- (deferred follow-up — not wired in this batch). scan_scanned_at is
  -- the wall-clock time the verdict was recorded.
  scan_verdict text CHECK (scan_verdict IN ('clean','infected','error')),
  scan_scanned_at timestamptz,

  -- Free-form structured metadata (page count, extracted title, OCR
  -- language, orientation, etc.). Extractors write here; the schema
  -- stays permissive by design.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Same file (same sha256) cannot be uploaded twice for a business
-- while it is still live. Archived rows may share a hash so a
-- previously-archived doc can be re-uploaded intentionally.
CREATE UNIQUE INDEX IF NOT EXISTS evidence_business_sha256_active_uniq
  ON public.evidence (business_id, sha256)
  WHERE verification_state <> 'archived';

CREATE INDEX IF NOT EXISTS evidence_business_idx
  ON public.evidence (business_id);

CREATE INDEX IF NOT EXISTS evidence_verification_state_idx
  ON public.evidence (verification_state);

CREATE INDEX IF NOT EXISTS evidence_expires_at_idx
  ON public.evidence (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.evidence IS
  'Canonical registry of founder-uploaded evidence artefacts (identity, governance, financial, product, traction, compliance, ip, people, esg, security, contract). Master Upgrade Plan Phase 3 §12.4 / §5.3.';

COMMENT ON COLUMN public.evidence.business_id IS
  'The business the evidence belongs to. Currently references projects(id); a Phase 2 follow-up re-points this at the first-class businesses(id) table (migration 0202).';

COMMENT ON COLUMN public.evidence.sha256 IS
  'Lowercase 64-char hex SHA-256 of the file bytes. Verified server-side by web/src/lib/evidence/hash-verify.ts.';

COMMENT ON COLUMN public.evidence.storage_path IS
  'Path inside the private Supabase Storage bucket `evidence`. Never served directly; access via signed URLs scoped to the requesting user''s business membership.';

COMMENT ON COLUMN public.evidence.verification_state IS
  'State machine transitions live in web/src/lib/evidence/state-machine.ts. DB enforces the enum only.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
