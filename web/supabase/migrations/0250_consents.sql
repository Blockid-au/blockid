-- 0250_consents.sql
-- Consent domain — grantor-scoped consent records + append-only audit twin.
--
-- Master Upgrade Plan §9.4 (consent domain) + §5.2 (migration lane 0250-0252).
-- Stage 4 Batch E sub-task E1.
--
-- Fills gap G2 identified in the plan: web/src/lib/consent.ts existed at the
-- code layer but had no DB backing for the *new* grantor→recipient consent
-- model. The legacy `consent_events` table (migration 0076) captures Privacy
-- Act / wholesale-certification disclaimers acknowledged by the *user* — it
-- is orthogonal to this table which captures a *business* granting a *named
-- recipient* permission to access resources (evidence, reports, profile).
--
-- Naming: to avoid colliding with the legacy 0076 `consent_events` (which
-- has different columns and different semantics), the append-only audit
-- twin for this table is named `consent_state_events`.
--
-- FK notes:
--   * grantor_business_id references public.projects(id) until the Phase 2
--     first-class businesses(id) table lands (migration 0202_business_profile.sql
--     per §5.2). A follow-up migration will re-point this without dropping data.
--   * grantor_user_id references public.app_users(id).
--
-- Idempotency: every DDL uses IF NOT EXISTS. Single BEGIN/COMMIT.
--
-- RLS: enabled defense-in-depth (mirrors 0270 + 0091). The app writes via the
-- service-role key with BYPASSRLS.
--
-- Reserved lane: 02xx spec lane per Master Plan §5.2. CEO loop must not
-- author files matching 02xx_*.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who granted. grantor_business_id is the business the consent is issued
  -- *on behalf of*; grantor_user_id is the natural person who clicked
  -- "Grant" and is legally accountable for the disclosure.
  grantor_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE CASCADE,
  grantor_business_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Who it's granted to. recipient_kind narrows the meaning of recipient_id:
  --   email        → an RFC-5322 address (string)
  --   org          → app_users/projects uuid (string form)
  --   link         → recipient_id NULL — anyone with the share URL
  --   api_partner  → OAuth client_id string
  --   public       → recipient_id NULL — profile is world-visible
  recipient_kind text NOT NULL
    CHECK (recipient_kind IN ('email','org','link','api_partner','public')),
  recipient_id text,

  -- Why. Open enum — the app whitelists these but the DB stays flexible so
  -- a new purpose code (e.g. `carbon_audit`) ships without a migration.
  --   investment_review, procurement_check, grant_review,
  --   cross_border_analysis, general_share
  purpose_code text NOT NULL,

  -- What. resources = list of resource refs the consent covers, e.g.
  -- ['evidence:abc123', 'report:def456', 'profile:public']. permissions =
  -- capability map, e.g. {"read": true, "download": false, "forward": false}.
  resources   jsonb NOT NULL DEFAULT '[]'::jsonb,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Under which framework. Cited in the disclosure receipt shown to the
  -- recipient. Examples: 'apps:app6' (Australian Privacy Principle 6 —
  -- use/disclosure), 'pdpd:art11' (Vietnam PDPD art. 11 — consent),
  -- 'contract' (Article 6(1)(b) GDPR — contractual necessity).
  legal_basis text,

  -- Lifecycle timestamps. granted_at is fixed at insert; expires_at drives
  -- the nightly EXPIRED cron; revoked_at is a manual/API kill switch.
  granted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  revoked_at        timestamptz,
  revocation_reason text,

  -- Convenience flags. Denormalised from permissions for hot-path lookups
  -- in the share-package enforcer. onward_share_prohibited defaults TRUE —
  -- silence is *no* redisclosure per §9.4.
  download_permitted        boolean NOT NULL DEFAULT false,
  onward_share_prohibited   boolean NOT NULL DEFAULT true,

  -- Free-form metadata (UTM at grant time, viewer_hint, locale...). MUST
  -- NOT contain PII per §9.4 privacy-by-default: enforced application-side.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Expiry must be in the future relative to grant. NULL is fine — a
  -- perpetual consent is a valid choice but should be rare in practice.
  CONSTRAINT consents_expires_after_granted
    CHECK (expires_at IS NULL OR expires_at > granted_at)
);

-- Fast lookups by grantor (owner UI: "who did I share with?").
CREATE INDEX IF NOT EXISTS consents_grantor_user_idx
  ON public.consents (grantor_user_id);

CREATE INDEX IF NOT EXISTS consents_grantor_business_idx
  ON public.consents (grantor_business_id);

-- Fast lookups by recipient (partner UI: "what have I been granted?").
CREATE INDEX IF NOT EXISTS consents_recipient_idx
  ON public.consents (recipient_id);

-- Nightly EXPIRED cron scans this partial index; skips already-revoked
-- rows entirely, so the scan stays proportional to the live-consent set.
CREATE INDEX IF NOT EXISTS consents_expires_active_idx
  ON public.consents (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.consents IS
  'Grantor-scoped consent record: a business (grantor) permitting a named recipient (email/org/link/api_partner/public) to access a resource set (evidence/report/profile) under a stated purpose and legal basis. Master Upgrade Plan §9.4. Distinct from the legacy 0076 consent_events which captures Privacy-Act disclaimer acks by an individual user.';

COMMENT ON COLUMN public.consents.metadata IS
  'Free-form JSONB for grant-time context (UTM, locale, viewer_hint). MUST NOT contain PII — enforced application-side per §9.4 privacy-by-default.';

COMMENT ON COLUMN public.consents.onward_share_prohibited IS
  'Denormalised from permissions.forward. Defaults TRUE — silence means no onward disclosure per §9.4.';

-- ---------------------------------------------------------------------------
-- consent_state_events — append-only audit twin of every state change.
-- ---------------------------------------------------------------------------
-- Renamed from the plan's suggested `consent_events` because that identifier
-- is taken by migration 0076 (Privacy-Act disclaimer ack log). Colliding on
-- the name would cause CREATE TABLE IF NOT EXISTS to no-op and give us the
-- wrong schema silently — a subtle correctness bug. The `_state_events`
-- suffix makes the twin relationship to `consents` explicit.

CREATE TABLE IF NOT EXISTS public.consent_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  consent_id uuid NOT NULL
    REFERENCES public.consents(id) ON DELETE CASCADE,

  -- Lifecycle transitions the app records:
  --   granted    → row created
  --   extended   → expires_at pushed forward
  --   revoked    → revoked_at set (with revocation_reason)
  --   expired    → nightly cron flipped expires_at boundary
  --   viewed     → recipient opened the share_package (enforceConsent)
  --   downloaded → recipient exported the artefact (if download_permitted)
  event_type text NOT NULL
    CHECK (event_type IN ('granted','extended','revoked','expired','viewed','downloaded')),

  -- NULL when the transition was system-driven (e.g. nightly expiry cron).
  actor_user_id uuid,

  event_at timestamptz NOT NULL DEFAULT now(),

  -- MUST NOT contain PII (enforced application-side + covered by test).
  -- Safe things to store: hashed IP, coarse user-agent bucket, elapsed_ms.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS consent_state_events_consent_time_idx
  ON public.consent_state_events (consent_id, event_at DESC);

ALTER TABLE public.consent_state_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.consent_state_events IS
  'Append-only audit twin of public.consents. One row per lifecycle transition. metadata MUST NOT contain PII — enforced application-side per §9.4.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
