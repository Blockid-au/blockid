-- OAuth connections: track connected third-party accounts for evidence connectors.
-- Each user can connect one account per provider (GitHub, Google Analytics, Stripe, etc.)

CREATE TABLE IF NOT EXISTS public.oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  provider TEXT NOT NULL,                -- 'github' | 'analytics' | 'stripe'
  provider_user_id TEXT,                 -- e.g. GitHub username or Google account ID
  access_token TEXT,                     -- encrypted in production; used for refresh
  refresh_token TEXT,                    -- optional: for providers that support refresh
  token_expires_at TIMESTAMPTZ,          -- optional: token expiry time
  metadata JSONB DEFAULT '{}',           -- provider-specific data (repos, profile, etc.)
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Each user can only connect one account per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_connections_email_provider
  ON public.oauth_connections (user_email, provider);

-- Index for lookups by provider
CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider
  ON public.oauth_connections (provider);

-- RLS (disabled for service role usage, same pattern as other tables)
ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;
