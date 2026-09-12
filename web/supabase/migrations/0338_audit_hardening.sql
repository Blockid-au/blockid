-- Migration 0338 — audit_events hardening (S20-A review P2-4 + P2-5, 2026-09-12)
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
-- P2-5  Append-only at the grant level. anon / authenticated / service_role
--       all held UPDATE, DELETE and TRUNCATE on audit_events (Supabase's
--       default `GRANT ALL ... TO anon, authenticated, service_role`).
--       TRUNCATE bypasses RLS AND the row-level no-mutate triggers, so it
--       was the one path that could silently empty the evidence log.
--       PostgREST exposes no TRUNCATE, so not exploitable today; still:
--         * anon / authenticated: no privileges at all (reads go through the
--           service-role client; RLS already denied them in effect);
--         * service_role: INSERT + SELECT only. The legacy
--           lib/audit.ts appendAudit() hmac_signature UPDATE was already
--           rejected by the 0076 no-update trigger and is logged as
--           non-fatal — it now fails with permission denied instead, same
--           code path;
--         * BEFORE TRUNCATE statement trigger as belt-and-braces (a future
--           GRANT cannot re-open it without also dropping the trigger).
--       `audit_events_no_mutate()` (0076) just RAISEs and returns nothing,
--       which is valid for a FOR EACH STATEMENT trigger, so it is reused.
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

-- P2-5 ---------------------------------------------------------------------

REVOKE ALL ON public.audit_events FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.audit_events FROM service_role;
GRANT INSERT, SELECT ON public.audit_events TO service_role;

-- The identity sequence backs INSERT; anon/authenticated never insert.
DO $$
DECLARE
  v_seq text;
BEGIN
  SELECT pg_get_serial_sequence('public.audit_events', 'id') INTO v_seq;
  IF v_seq IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', v_seq);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', v_seq);
  END IF;
END $$;

DROP TRIGGER IF EXISTS audit_events_no_truncate ON public.audit_events;
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON public.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_events_no_mutate();

COMMENT ON TRIGGER audit_events_no_truncate ON public.audit_events IS
  'S20-A P2-5: TRUNCATE bypasses RLS and row triggers; block it at statement level.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify after apply:
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'audit_events' ORDER BY 1, 2;
--     → service_role: INSERT, SELECT only; no anon / authenticated rows.
--   SET enable_seqscan = off;
--   EXPLAIN SELECT id FROM public.audit_events
--    WHERE detail->>'project_id' = '00000000-0000-0000-0000-000000000000'
--    ORDER BY id DESC LIMIT 50;
--     → Index Scan using audit_events_project_id_idx (no Filter).
--   TRUNCATE public.audit_events;  -- as postgres: ERROR audit_events is append-only
