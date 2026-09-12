-- 0341_valuation_certificates.sql
-- ---------------------------------------------------------------------------
-- S22-A — valuation certificate PDF for investor due diligence.
--
-- Why
--   Roadmap-v2 reconciliation 2026-09-11, "Valuation certificate PDF (for
--   investor DD)": the VC valuation report PDF (`api/valuation/pdf`) already
--   exists but has no certificate format, no number, no hash and no way for
--   an investor to check it. This table is the register of issued
--   certificates: one row per issue, the payload frozen as issued, the
--   SHA-256 of that payload, and a revocation marker.
--
-- What
--   `valuation_certificates`
--     id                uuid pk
--     project_id        the startup the certificate describes (member-aware
--                       access is resolved through project_members at read
--                       time; the row itself is keyed on the project)
--     user_id           the caller who issued it (owner OR an accepted
--                       editor/admin member) — credits were theirs
--     score_history_id  optional provenance: the startup_score_history row the
--                       figures were read from (null when the SVI analysis
--                       row was used directly)
--     certificate_no    public, unique, human-readable `VC-XXXXX-XXXXX`
--                       (lib/valuation-certificate/hash.ts)
--     content_hash      `blockid:v1:<sha256>` of the canonical payload
--     payload           the frozen ValuationCertificateData — the PDF and the
--                       verify page render from THIS, never a recompute
--     startup_name /    denormalised so the PUBLIC verify page can answer
--     svi_score /       (issued date, startup name, hash match, revoked)
--     issued_at         without touching any other table and without the
--                       payload's financial figures
--     credits_charged   0 when included by plan (Growth+ / Startup Package)
--     revoked_at /      set by POST /api/valuation/certificate/[id]/revoke
--     revoked_reason    (owner / admin); a revoked row is never deleted
--
-- RLS
--   Enabled; no anon/authenticated policies. Every reader/writer is a server
--   route using the service-role key (the verify page included) — the same
--   defence-in-depth stance as startup_score_history (20260905).
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     < web/supabase/migrations/0341_valuation_certificates.sql
--   then: NOTIFY pgrst, 'reload schema';
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.valuation_certificates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  score_history_id  UUID        REFERENCES public.startup_score_history(id) ON DELETE SET NULL,
  certificate_no    TEXT        NOT NULL UNIQUE
                                CHECK (certificate_no ~ '^VC-[0-9A-HJ-NP-Z]{5}-[0-9A-HJ-NP-Z]{5}$'),
  content_hash      TEXT        NOT NULL CHECK (content_hash ~ '^blockid:v1:[0-9a-f]{64}$'),
  payload           JSONB       NOT NULL,
  startup_name      TEXT        NOT NULL,
  svi_score         INTEGER     NOT NULL,
  credits_charged   NUMERIC(8,2) NOT NULL DEFAULT 0,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at        TIMESTAMPTZ,
  revoked_reason    TEXT        CHECK (revoked_reason IS NULL OR char_length(revoked_reason) <= 500),
  CONSTRAINT valuation_certificates_revoked_pair
    CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);

-- Dashboard list: newest first per project.
CREATE INDEX IF NOT EXISTS idx_valuation_certificates_project
  ON public.valuation_certificates (project_id, issued_at DESC);

-- Verify page lookups go through the unique certificate_no index.

ALTER TABLE public.valuation_certificates ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.valuation_certificates IS
  'S22-A: register of issued valuation certificates (frozen payload + SHA-256 + revocation). Read/written only by service-role routes.';
COMMENT ON COLUMN public.valuation_certificates.certificate_no IS
  'Public certificate number VC-XXXXX-XXXXX printed on the PDF and used by /verify/valuation/[no].';
COMMENT ON COLUMN public.valuation_certificates.content_hash IS
  'blockid:v1:<sha256 hex> of the canonical (sorted-key) JSON of `payload` — lib/valuation-certificate/hash.ts.';
COMMENT ON COLUMN public.valuation_certificates.payload IS
  'ValuationCertificateData as issued; the PDF and the verify page render from this, never from a recompute.';
COMMENT ON COLUMN public.valuation_certificates.revoked_at IS
  'Set with revoked_reason by the project owner/admin; the row stays so the verify page can say "revoked".';

NOTIFY pgrst, 'reload schema';
