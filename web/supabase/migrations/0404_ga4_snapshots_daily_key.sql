-- 0404 — one GA4 snapshot per (user, project, property, day)
--
-- W5 review: every "Sync" click appended a ga4_signal_snapshots row. A
-- generated `taken_day` column + unique index lets the writer upsert.
-- NULL project_id / property_id are coalesced so the key is total.
BEGIN;

ALTER TABLE public.ga4_signal_snapshots
  ADD COLUMN IF NOT EXISTS taken_day date GENERATED ALWAYS AS ((taken_at AT TIME ZONE 'UTC')::date) STORED;

-- Collapse historical duplicates (keep the newest per key) before the index.
DELETE FROM public.ga4_signal_snapshots s
 USING public.ga4_signal_snapshots t
 WHERE s.user_id = t.user_id
   AND coalesce(s.project_id::text, '') = coalesce(t.project_id::text, '')
   AND coalesce(s.property_id, '') = coalesce(t.property_id, '')
   AND s.taken_day = t.taken_day
   AND s.taken_at < t.taken_at;

-- NULLS NOT DISTINCT (PG15) so a NULL project / property still forms one key
-- and PostgREST's `on_conflict=user_id,project_id,property_id,taken_day` matches.
CREATE UNIQUE INDEX IF NOT EXISTS ga4_signal_snapshots_daily_key
  ON public.ga4_signal_snapshots (user_id, project_id, property_id, taken_day) NULLS NOT DISTINCT;

COMMIT;
