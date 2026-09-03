-- Wave 25 Phase C: same-deck 24h cache for the SVI dimensions stream.
--
-- When the founder submits an identical `deckText` (SHA-256 keyed) within the
-- last 24 hours the SSE endpoint can skip the full 8-dim + criteria synthesis
-- AI round-trip and replay the cached results as a "cache_hit" event followed
-- by the usual dimension_complete + criteria_synthesis + done frames. This
-- takes a repeat run from ~72s down to <5s and eliminates the AI provider
-- spend entirely for the second run.
--
-- Scoping: per-user (a founder's own deck must not leak to another user, and
-- one user re-running their own deck is the sole intended cache-hit path).
-- The (deck_hash, user_id) pair is the natural key. `deck_hash` is the
-- primary key because a SHA-256 collision on legitimate 8KiB deck text is
-- vanishingly small AND the user_id check remains explicit in the read path.
--
-- TTL: enforced at read time by `created_at > now() - interval '24 hours'`.
-- A trivial daily cleanup job can DELETE stale rows if desired — the read
-- guard makes stale rows harmless.

CREATE TABLE IF NOT EXISTS public.svi_deck_cache (
  deck_hash        TEXT PRIMARY KEY,
  user_id          UUID NOT NULL,
  dim_results      JSONB NOT NULL,
  criterion_results JSONB,
  industry         TEXT,
  stage            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by user for cache-hit checks + per-user invalidation.
CREATE INDEX IF NOT EXISTS idx_svi_deck_cache_user_created
  ON public.svi_deck_cache (user_id, created_at DESC);

-- TTL helper: fast prune of stale rows without a table scan.
CREATE INDEX IF NOT EXISTS idx_svi_deck_cache_created
  ON public.svi_deck_cache (created_at);
