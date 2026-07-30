-- 0252_revocations.sql
-- Global revocation registry (BCR-004).
--
-- Master Upgrade Plan §9.4 (consent domain) + §5.2 (migration lane
-- 0250-0252). Stage 4 Batch E sub-task E3.
--
-- One table holds every revocation across four artefact kinds:
--   * consent               — public.consents(id) uuid
--   * share_package         — public.share_packages(share_token)
--   * verifiable_credential — VC JWT jti (holder's off-chain credential)
--   * report_version        — public.report_versions(id) uuid (Phase 4)
--
-- Rationale for a single registry (vs a boolean revoked flag per table):
--   1. A recipient / verifier can check ONE endpoint to answer "is this
--      still valid?" regardless of artefact kind — critical for VC
--      verifiers that don't have DB access to the issuing tables.
--   2. Batched anchoring to Anvil (private EVM per platform_roadmap) writes
--      a Merkle root over the day's revoked_at rows; anchor_tx captures the
--      tx hash for auditor lookup.
--   3. Revocations survive after the underlying row is purged. No FKs by
--      design — the registry is deliberately loose-typed on revoked_ref so
--      it can outlive its target.
--
-- Idempotency: UNIQUE(revocation_kind, revoked_ref) makes a duplicate
-- revoke call a no-op (`INSERT ... ON CONFLICT DO NOTHING`).
--
-- RLS: enabled defense-in-depth. Reads via anon key go through the
-- /.well-known/revocations endpoint which applies rate limits + kind
-- filters; direct table access is service-role only.
--
-- Reserved lane: 02xx spec per §5.2.

BEGIN;

CREATE TABLE IF NOT EXISTS public.revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  revocation_kind text NOT NULL
    CHECK (revocation_kind IN (
      'consent',
      'share_package',
      'verifiable_credential',
      'report_version'
    )),

  -- Loose-typed reference — see file header for the shape per kind.
  -- Deliberately NOT a FK so the row survives when the target is purged.
  revoked_ref text NOT NULL,

  revoked_at timestamptz NOT NULL DEFAULT now(),

  -- NULL when the revocation was system-driven (cron expiry, DSR erasure).
  revoked_by_user_id uuid REFERENCES public.app_users(id),

  reason text,

  -- Filled by the daily batch-anchor cron with the Anvil tx hash of the
  -- Merkle root that includes this row. NULL means "not yet anchored".
  anchor_tx text,

  -- Duplicate revoke of the same artefact is a no-op (ON CONFLICT DO NOTHING).
  CONSTRAINT revocations_kind_ref_uniq UNIQUE (revocation_kind, revoked_ref)
);

-- /.well-known/revocations feed query: "give me every VC revoked since T"
-- — status-list style. Descending on revoked_at makes the recent window
-- cheap to scan.
CREATE INDEX IF NOT EXISTS revocations_kind_time_idx
  ON public.revocations (revocation_kind, revoked_at DESC);

ALTER TABLE public.revocations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.revocations IS
  'Global revocation registry (BCR-004): one row per revoked artefact across consents, share_packages, VCs, and report_versions. Loose-typed revoked_ref (no FKs) so entries survive target purge. Optional anchor_tx captures the Anvil Merkle-root tx hash from the daily batch-anchor cron. Master Upgrade Plan §9.4.';

COMMENT ON COLUMN public.revocations.revoked_ref IS
  'Kind-dependent handle: consents(id) uuid | share_packages.share_token | VC JWT jti | report_versions(id) uuid. Deliberately not FK-constrained so the registry outlives its target.';

COMMENT ON COLUMN public.revocations.anchor_tx IS
  'Anvil (private EVM chainId 420) tx hash of the daily Merkle-root anchor that includes this row. NULL until the anchor cron runs.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
