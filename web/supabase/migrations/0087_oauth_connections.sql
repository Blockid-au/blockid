-- T0016 Evidence Vault Phase 2 — dedicated OAuth connection table with
-- per-user, per-project scoping and encrypted-at-rest token storage.
-- Distinct from the legacy `public.oauth_connections` (migration 0027) which
-- keyed on email + provider only; kept for backward compatibility.

CREATE TABLE IF NOT EXISTS public.oauth_connections_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'stripe', 'ga4')),
  provider_account_id TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique on (user_id, provider, project_id). Postgres treats NULL as distinct
-- in a unique index by default, so we coalesce project_id to a sentinel UUID
-- so a single "workspace-wide" connection per (user, provider) is enforced.
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_connections_v2_user_provider_project
  ON public.oauth_connections_v2 (user_id, provider, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_oauth_connections_v2_user
  ON public.oauth_connections_v2 (user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_connections_v2_status
  ON public.oauth_connections_v2 (status);

ALTER TABLE public.oauth_connections_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oauth_connections_v2_service_all ON public.oauth_connections_v2;
CREATE POLICY oauth_connections_v2_service_all
  ON public.oauth_connections_v2
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS oauth_connections_v2_owner_select ON public.oauth_connections_v2;
CREATE POLICY oauth_connections_v2_owner_select
  ON public.oauth_connections_v2
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- svi_signals — normalised signal store fed by connector syncs. Idempotent so
-- callback + sync routes can safely upsert without a dedicated migration.
CREATE TABLE IF NOT EXISTS public.svi_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID,
  provider TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  signal_value_num DOUBLE PRECISION,
  signal_value_text TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_svi_signals_unique
  ON public.svi_signals (user_id, provider, signal_key, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_svi_signals_user_provider
  ON public.svi_signals (user_id, provider);

ALTER TABLE public.svi_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS svi_signals_service_all ON public.svi_signals;
CREATE POLICY svi_signals_service_all
  ON public.svi_signals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS svi_signals_owner_select ON public.svi_signals;
CREATE POLICY svi_signals_owner_select
  ON public.svi_signals
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
