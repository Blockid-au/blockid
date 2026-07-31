-- 0281_vc_issued.sql
-- W3C Verifiable Credential issuance log (BCR-* / Master Upgrade Plan §11.1).
--
-- One row per JWT emitted by `/api/v1/id/[slug]/vc`. Purpose:
--
--   1. Deduplication: a request within the TTL window (default 90d) reuses
--      the most recent active row instead of minting a new JWT — saves the
--      Ed25519 sig cost and keeps `jti` stable for badge holders.
--   2. Revocation: `revocation_id` foreign-keys into `public.revocations`
--      (kind=verifiable_credential, revoked_ref=jti). NULL until revoked.
--   3. Anchor trail: `payload_hash` is the SHA-256 of the canonical VC JSON
--      before signing. The daily anchor cron writes the Merkle root over
--      `payload_hash` rows to Anvil and fills `anchor_tx` — a verifier can
--      independently prove the credential existed at issuance time.
--   4. Audit: `issued_at`, `credential_type`, and `verification_level` are
--      the columns the CDO / auditor dashboard groups on.
--
-- Sensitive fields are DELIBERATELY absent:
--   * We never store the full JWT (verifier reconstructs it from
--     payload_hash + subject_business_id + jti when it needs to challenge —
--     otherwise a DB leak becomes a credential-forgery leak).
--   * We never store the private key material (it lives in Vault).
--
-- RLS: enabled defense-in-depth. All reads go through the service-role
-- admin client — the public `/api/v1/id/[slug]/vc` endpoint filters by
-- subject_business_id + status; direct anon access to this table is not
-- part of any documented flow.
--
-- Reserved lane: 028x (unicorn / VC issuance) per §5.2 migration map.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vc_issued (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- W3C JWT id — also the string used as `revoked_ref` in the revocations
  -- registry. UNIQUE so a `revoke by jti` call cannot silently target the
  -- wrong row.
  jti text NOT NULL UNIQUE,

  subject_business_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,

  credential_type text NOT NULL
    CHECK (credential_type IN (
      'BusinessIdentity',
      'TrustLevel',
      'UnicornStage'
    )),

  -- Snapshot of the L0..L5 ladder at issuance time. Reading the current
  -- value from projects would misrepresent a historical credential.
  verification_level smallint,

  -- Populated only for credential_type = 'UnicornStage'. Loose text
  -- (not a FK) so a stage rename downstream doesn't cascade-null this row.
  unicorn_stage_id text,

  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,

  -- SHA-256 (blockid:v1:<hex>) of the canonical VC JSON before signing.
  -- Doubles as the leaf we anchor into Anvil's daily Merkle root.
  payload_hash text NOT NULL,

  -- Filled by the batch-anchor cron. NULL means "not yet anchored".
  anchor_tx text,

  -- Set when the row is revoked. NULL for active credentials. The referenced
  -- revocations row carries the reason + `revoked_at` timestamp.
  revocation_id uuid REFERENCES public.revocations(id)
);

-- Endpoint hot-path: "latest active credential of this type for this
-- business". Descending on issued_at avoids a sort for the top-1 lookup.
CREATE INDEX IF NOT EXISTS vc_issued_subject_type_idx
  ON public.vc_issued (subject_business_id, credential_type, issued_at DESC);

-- Reverse lookup used by the revoke endpoint and by cron anchor jobs.
CREATE INDEX IF NOT EXISTS vc_issued_jti_idx
  ON public.vc_issued (jti);

ALTER TABLE public.vc_issued ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.vc_issued IS
  'W3C Verifiable Credential issuance log (BCR-* / Master Upgrade Plan §11.1). One row per JWT emitted by /api/v1/id/[slug]/vc. Does NOT store the JWT itself — payload_hash + jti are enough to prove issuance and anchor to Anvil without giving a DB leak forgery power.';

COMMENT ON COLUMN public.vc_issued.jti IS
  'JWT id — reused verbatim as revocations.revoked_ref when this credential is revoked. UNIQUE so a revoke call cannot target the wrong row.';

COMMENT ON COLUMN public.vc_issued.payload_hash IS
  'SHA-256 (`blockid:v1:<hex>`) over the canonical VC JSON pre-signing. Leaf of the daily Anvil Merkle-root anchor written by the anchor cron.';

COMMENT ON COLUMN public.vc_issued.anchor_tx IS
  'Anvil (private EVM, chainId 420) tx hash of the daily Merkle-root anchor that includes this row. NULL until the cron runs.';

COMMENT ON COLUMN public.vc_issued.revocation_id IS
  'Set when the row is revoked. Points into public.revocations for the reason + timestamp. NULL for active credentials.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
