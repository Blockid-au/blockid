-- =============================================================================
-- BlockID — API Key Management & Rate Limiting
--
-- Adds tables for API key storage (hashed, never raw) and sliding-window
-- rate limit tracking. Keys are scoped per user with configurable permissions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  key_hash text NOT NULL, -- SHA-256 of the actual key (never store raw)
  key_prefix text NOT NULL, -- first 16 chars for display: "bk_live_abc..."
  permissions text[] NOT NULL DEFAULT ARRAY['svi:read', 'svi:create', 'score:create'],
  rate_limit_per_min integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON public.api_keys(user_id);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Rate limit tracking (sliding window per minute)
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key_hash, window_start)
);
