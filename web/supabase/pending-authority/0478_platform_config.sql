-- 0478_platform_config.sql — G35 Pricing v5 cut-over (21/10/2026).
--
-- `lib/platform-config.ts` has read and written `public.platform_config`
-- (key → jsonb value) since the admin pricing panel shipped, but no migration
-- ever created the table: every read fell back to CONFIG_DEFAULTS and every
-- admin save (`/api/admin/platform-config`) failed. Pricing v5 is switched on
-- through `platform_config.payg_enabled`, so the table has to exist.
--
-- Additive and idempotent. Service role only (the app reads it through the
-- admin client server-side; `/api/platform-config` exposes a public slice).
-- `updated_by` is a free-text label, not a user FK, so erase_account() is
-- unaffected.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_config (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_config FROM anon, authenticated;
GRANT ALL ON public.platform_config TO service_role;

COMMENT ON TABLE public.platform_config IS
  'Admin overrides for lib/platform-config.ts CONFIG_DEFAULTS (key → jsonb). Service role only. G35 0478.';

COMMIT;

NOTIFY pgrst, 'reload schema';
