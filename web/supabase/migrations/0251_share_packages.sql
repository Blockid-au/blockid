-- 0251_share_packages.sql
-- Consent domain — share package (tokenised recipient bundle).
--
-- Master Upgrade Plan §9.4 (consent domain) + §18.2 (share package spec) +
-- §5.2 (migration lane 0250-0252). Stage 4 Batch E sub-task E2.
--
-- A share_package is the *material* the recipient sees when they open a
-- share link. Every package is governed by exactly one consent row (0250)
-- so revoking the consent tears down every derived share transparently.
--
-- FK notes:
--   * business_id → public.projects(id) until Phase 2 businesses(id) lands.
--   * consent_id  → public.consents(id) — one-to-one governance.
--   * report_order_id → public.report_orders(id), nullable because profile
--     shares don't have a Trust Business Report attached.
--
-- Idempotency: IF NOT EXISTS everywhere; UNIQUE(share_token) protects
-- against duplicate link generation.
--
-- RLS: enabled defense-in-depth (mirrors 0270/0250). Reads via anon key
-- go through /api/share/[token] which calls enforceConsent(); direct table
-- access is service-role only.
--
-- Reserved lane: 02xx spec per §5.2.

BEGIN;

CREATE TABLE IF NOT EXISTS public.share_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  business_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL
    REFERENCES public.app_users(id),

  -- Every share is governed by exactly one consent row. Revoke the consent
  -- and every derived share evaporates via the enforceConsent middleware.
  consent_id uuid NOT NULL
    REFERENCES public.consents(id),

  -- URL-safe random 32-char token. Application generates via
  -- crypto.randomBytes(24).toString('base64url').slice(0,32).
  share_token text NOT NULL UNIQUE,

  -- Nullable — profile-only shares have no report artefact.
  report_order_id uuid
    REFERENCES public.report_orders(id),

  -- Explicit resource whitelist. Even if the parent consent grants more,
  -- the share_package can only ever expose the subset listed here. This is
  -- the last line of defense against over-disclosure.
  included_resources jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Visible watermark applied to PDFs/images. Recipient email or org name
  -- so a leaked copy is traceable back to a specific disclosure.
  watermark text,

  -- Access telemetry.
  access_count       integer     NOT NULL DEFAULT 0
    CHECK (access_count >= 0),
  first_accessed_at  timestamptz,
  last_accessed_at   timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Owner console query: "list every share I've created for this business".
CREATE INDEX IF NOT EXISTS share_packages_business_owner_idx
  ON public.share_packages (business_id, owner_user_id);

-- Consent revocation cascade: "flush every share bound to this consent".
CREATE INDEX IF NOT EXISTS share_packages_consent_idx
  ON public.share_packages (consent_id);

ALTER TABLE public.share_packages ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.share_packages IS
  'Tokenised recipient bundle governed by exactly one consents(id) row. share_token is the URL-safe handle presented to the recipient; enforceConsent() at request-time re-checks the parent consent for expiry/revocation and appends a consent_state_events row before returning content. Master Upgrade Plan §18.2 + §9.4.';

COMMENT ON COLUMN public.share_packages.included_resources IS
  'Resource whitelist for this share. Subset of the parent consents.resources — never a superset. Last line of defense against over-disclosure.';

COMMENT ON COLUMN public.share_packages.watermark IS
  'Recipient identifier (email or org name) burned into exported PDFs so a leaked copy traces back to a specific disclosure.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
