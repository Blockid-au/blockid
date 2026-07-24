-- Migration 0107 — persistent endpoint rate limiter (round 5.4a)
--
-- Replaces the in-process Map<string, number[]> rate limiter used by
-- /api/dataroom/populate-from-template with a Postgres-backed fixed-window
-- counter that survives restarts and works across containers.
--
-- Generalizable: any endpoint can call consumeRateLimit() (see
-- web/src/lib/rate-limit/persistent.ts) with its own bucket + limit.
--
-- Note: A separate `api_rate_limits` table already exists (see migration
-- 0072_svi_api_subscriptions.sql, used by SVI API key throttling). We
-- deliberately use a distinct name here — `endpoint_rate_limits` — so the
-- two systems don't collide.
--
-- Applied via: docker exec -i supabase-db psql -U supabase_admin -d postgres
--                   -v ON_ERROR_STOP=1 < 0107_rate_limits.sql
-- Then:        docker exec -i supabase-db psql -U postgres -d postgres
--                   -c "NOTIFY pgrst, 'reload schema';"
--
-- IMPORTANT: Manual apply — never auto-applied on deploy (project memory
-- reference_db_migrations).

BEGIN;

-- ---------------------------------------------------------------------------
-- endpoint_rate_limits — one row per (bucket_key, window_start)
-- ---------------------------------------------------------------------------
--
-- bucket_key format: "<endpoint>:<user_id-or-ip>", e.g.
--   "dataroom.populate:8f2c...-uuid"
--   "reveal-email:203.0.113.55"
--
-- window_start is the floored start of the current window in UTC. Combined
-- with the unique constraint below, this gives us idempotent upserts under
-- concurrent hits (ON CONFLICT ... DO UPDATE increments atomically).

CREATE TABLE IF NOT EXISTS public.endpoint_rate_limits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key   text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 1,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS endpoint_rate_limits_bucket_window_idx
  ON public.endpoint_rate_limits (bucket_key, window_start DESC);

-- Supports the prune_rate_limits() cleanup helper below.
CREATE INDEX IF NOT EXISTS endpoint_rate_limits_cleanup_idx
  ON public.endpoint_rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- updated_at trigger — bump on every UPDATE so audit-style queries can
-- distinguish "created" from "last-touched" without another column.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.endpoint_rate_limits_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_endpoint_rate_limits_touch_updated_at
  ON public.endpoint_rate_limits;

CREATE TRIGGER trg_endpoint_rate_limits_touch_updated_at
  BEFORE UPDATE ON public.endpoint_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.endpoint_rate_limits_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — default-deny. Only the service role (which bypasses RLS entirely)
-- reads/writes this table. No end-user should ever touch it directly.
-- ---------------------------------------------------------------------------

ALTER TABLE public.endpoint_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies granted to authenticated/anon — RLS defaults to DENY when
-- the role has no matching policy. Service role bypasses RLS.

REVOKE ALL ON public.endpoint_rate_limits FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoint_rate_limits TO service_role;

-- ---------------------------------------------------------------------------
-- prune_rate_limits() — cleanup helper called by
-- /api/cron/prune-rate-limits (bearer-auth cron endpoint).
--
-- Default retention is 2 hours: enough to cover the largest window we
-- currently issue (1h) plus a safety buffer for late writes. Bump the
-- interval when we add day-scale windows.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prune_rate_limits(
  older_than interval DEFAULT '2 hours'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pruned integer;
BEGIN
  DELETE FROM public.endpoint_rate_limits
   WHERE window_start < now() - older_than;
  GET DIAGNOSTICS pruned = ROW_COUNT;
  RETURN pruned;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_rate_limits(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_rate_limits(interval) TO service_role;

COMMIT;
