-- Migration 0102 — user role, permissions, soft-delete + anonymization columns
--
-- Per docs/plans/reseller-module-goal.md Track A P12.2 and P12
-- (user_management) exit_criteria: "migration 0101 extends app_users CHECK
-- constraint + adds custom_role/permissions/deleted_at/anonymized_at columns".
--
-- Slot 0101 was already consumed by 0101_reseller_stripe_billing_columns.sql
-- (landed prior to this tick). Using 0102 keeps the sequence contiguous
-- without re-numbering a shipped migration.
--
-- What this migration does
--   1. Adds four columns to public.app_users:
--        - custom_role   text            (nullable; ad-hoc role label the
--                                         admin console can assign to power-
--                                         users without minting a new
--                                         hard-coded role like 'admin')
--        - permissions   jsonb NOT NULL DEFAULT '[]'::jsonb
--                                        (string-array of fine-grained
--                                         capability keys e.g.
--                                         ['reseller.console',
--                                          'advisor_portal',
--                                          'esop.manage']; consumed by the
--                                         upcoming P12.6 permissions
--                                         endpoint + downstream can()
--                                         pipeline)
--        - deleted_at    timestamptz     (nullable; soft-delete timestamp;
--                                         all read paths that want to hide
--                                         deleted users filter on
--                                         deleted_at IS NULL)
--        - anonymized_at timestamptz     (nullable; independent of
--                                         deleted_at because APP-privacy-
--                                         driven anonymization can precede
--                                         a hard delete by 30 days or more)
--
--   2. Extends app_users_account_type_check to include the seven new
--      personas that P12.1 added to
--      web/src/lib/segments.ts:33-44 (ACCOUNT_TYPE_VALUES):
--        investor_angel, investor_vc, advisor, accelerator,
--        incubator, reseller, affiliate
--      The three legacy values (founder / investor / journalist) from
--      migration 0067 are preserved so pre-P12 rows keep validating.
--
--   3. Adds three helpful indexes:
--        - app_users_permissions_gin_idx     — GIN on permissions so
--                                              can()-style capability
--                                              lookups don't full-scan the
--                                              table once the array grows
--        - app_users_deleted_at_idx          — partial on non-null so
--                                              hide-deleted list pages
--                                              stay cheap
--        - app_users_custom_role_idx         — partial on non-null so
--                                              "all rows with custom role X"
--                                              admin filter chip stays cheap
--
-- Why these columns instead of a separate roles table
--   - custom_role is deliberately a text label, not a FK. Admins may need
--     to spin up ad-hoc roles ('cs_manager', 'gtm_pilot') without a schema
--     round-trip. If the label set ever needs to stabilise, a follow-up
--     migration can lift it into a lookup table with a FK; that's cheaper
--     than starting with the lookup and finding the label vocabulary is
--     unstable in the first six months.
--   - permissions is jsonb (not a link table) because the write pattern is
--     "grant this user this capability, right now" — one row per (user,
--     capability) would multiply row counts 5-10× for negligible gain, and
--     the existing entitlements table (0075) is the canonical spot for
--     purchased/billed feature flags. permissions is the operational
--     override channel, entitlements is the billing-derived channel.
--   - deleted_at + anonymized_at are separate because the APP 11
--     (data-minimisation) response and the account-closure request run on
--     different clocks. A user can close their account (deleted_at) while
--     still keeping their forum posts under a display name for another
--     year, and vice versa a compliance-driven anonymisation
--     (anonymized_at) can strip PII while the account is otherwise live.
--
-- Applied via: docker exec supabase-db psql -U postgres -d postgres
--              -f 0102_user_role_permissions.sql
-- Then:        NOTIFY pgrst, 'reload schema';
--
-- ADDITIVE + IDEMPOTENT. Safe to re-run — every column / index uses
-- IF NOT EXISTS; the CHECK constraint drop-then-add is idempotent because
-- the DROP uses IF EXISTS.

BEGIN;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS custom_role   text,
  ADD COLUMN IF NOT EXISTS permissions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

-- Extend account_type CHECK to cover the seven new personas P12.1 shipped
-- to the TypeScript enum. Legacy trio preserved so existing rows validate.
ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_account_type_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_account_type_check CHECK (
    account_type IN (
      'founder',
      'investor',
      'journalist',
      'investor_angel',
      'investor_vc',
      'advisor',
      'accelerator',
      'incubator',
      'reseller',
      'affiliate'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS app_users_permissions_gin_idx
  ON public.app_users USING GIN (permissions);

CREATE INDEX IF NOT EXISTS app_users_deleted_at_idx
  ON public.app_users (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS app_users_custom_role_idx
  ON public.app_users (custom_role)
  WHERE custom_role IS NOT NULL;

-- Column comments (surface intent in \d+ output and Studio inspector)
COMMENT ON COLUMN public.app_users.custom_role IS
  'Optional ad-hoc role label assigned by admins (e.g. cs_manager, gtm_pilot). Distinct from role text (user|admin) — this column is a free-form vocabulary the admin console can grow without a schema change.';

COMMENT ON COLUMN public.app_users.permissions IS
  'jsonb string-array of fine-grained capability keys (e.g. ["reseller.console", "advisor_portal"]). Operational override channel consumed by the can() pipeline; entitlements table remains the source of truth for billed features.';

COMMENT ON COLUMN public.app_users.deleted_at IS
  'Soft-delete timestamp. Read paths that hide deleted users filter deleted_at IS NULL. Distinct from anonymized_at because closure and anonymisation run on different clocks under APP 11.';

COMMENT ON COLUMN public.app_users.anonymized_at IS
  'PII-stripped-at timestamp. Set independently from deleted_at so a compliance-driven anonymisation does not force account closure and vice versa.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
