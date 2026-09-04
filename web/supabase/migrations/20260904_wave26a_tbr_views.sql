-- Wave 26A: TBR view analytics (DocSend-style).
--
-- Records anonymised open events for `/tbr/<token>` links so the founder can
-- see who read their Trusted Business Report, how long they read for, and
-- roughly where from — WITHOUT ever exposing raw IPs or PII to the founder.
--
-- Ingestion: POST /api/tbr/[token]/view-start creates a row; POST
-- /api/tbr/[token]/view-end patches `read_ms` and `ended_at`.
--
-- Founder-side surface: GET /api/svi/report/views aggregates + returns the
-- 20 most recent views with `country`, `device`, and `read_seconds` only.
-- The raw `viewer_ip` never leaves the server; it is kept solely for abuse
-- detection and coarse country derivation (which will be replaced by a
-- Cloudflare `cf-ipcountry` header when available in prod).

CREATE TABLE IF NOT EXISTS public.tbr_views (
  id             BIGSERIAL PRIMARY KEY,
  share_token    TEXT NOT NULL,
  viewer_ip      INET,
  viewer_country TEXT,
  viewer_ua      TEXT,
  viewer_device  TEXT,
  referrer       TEXT,
  viewed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_ms        INTEGER,
  ended_at       TIMESTAMPTZ
);

-- Founder-side listing: latest views for a given share token.
CREATE INDEX IF NOT EXISTS idx_tbr_views_token_viewed
  ON public.tbr_views (share_token, viewed_at DESC);
