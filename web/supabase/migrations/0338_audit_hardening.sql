-- Migration 0338 — audit_events hardening (S20-A review P2-4, 2026-09-12)
--
-- P2-4  Usable viewer indexes. 0335 created
--         audit_events_project_ts_idx ON ((detail->>'project_id'), ts DESC) WHERE detail ? 'project_id'
--       but the reader (web/src/lib/audit/events.ts) filters with
--         detail->>'project_id' = $1 ORDER BY id DESC
--       and the planner cannot prove the partial predicate `detail ? 'project_id'`
--       from that filter (EXPLAIN with enable_seqscan=off fell back to a PK
--       backward scan + Filter). Every /workspace/audit-log page and CSV
--       export therefore scanned the table. Replace both viewer indexes with
--       non-partial `(…, id DESC)` indexes that match the query's ORDER BY.
--
-- Applied via: docker exec -i supabase-db psql -U postgres -d postgres
--              < web/supabase/migrations/0338_audit_hardening.sql
--              (the file ends with NOTIFY pgrst so PostgREST reloads its
--              privilege cache)

BEGIN;

-- P2-4 ---------------------------------------------------------------------

DROP INDEX IF EXISTS public.audit_events_project_ts_idx;
CREATE INDEX IF NOT EXISTS audit_events_project_id_idx
  ON public.audit_events ((detail->>'project_id'), id DESC);

DROP INDEX IF EXISTS public.audit_events_user_ts_idx;
CREATE INDEX IF NOT EXISTS audit_events_user_id_idx
  ON public.audit_events (user_id, id DESC);

COMMENT ON INDEX public.audit_events_project_id_idx IS
  'S20-A P2-4: matches events.ts `detail->>project_id = $1 ORDER BY id DESC` (no partial WHERE).';
COMMENT ON INDEX public.audit_events_user_id_idx IS
  'S20-A P2-4: matches events.ts `user_id = $1 ORDER BY id DESC`.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify after apply:
--   SET enable_seqscan = off;
--   EXPLAIN SELECT id FROM public.audit_events
--    WHERE detail->>'project_id' = '00000000-0000-0000-0000-000000000000'
--    ORDER BY id DESC LIMIT 50;
--     → Index Scan using audit_events_project_id_idx (no Filter).
