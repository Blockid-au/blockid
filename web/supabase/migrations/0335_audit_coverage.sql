-- Migration 0335 — audit coverage (S20-A, 2026-09-12)
--
-- Every mutating /api/** route is now recorded through the `apiRoute()`
-- wrapper (web/src/lib/audit/api-route.ts) as one row in the hash-chained
-- `audit_events` table (0076). This migration:
--
--   1. Serialises the chain trigger with a transaction-scoped advisory lock.
--      The 0076 trigger read "last row" without locking, so two concurrent
--      inserts could both chain onto the same prev_hash (a fork the
--      verifier reports as prev_hash_mismatch). Same payload expression as
--      0076 — existing hashes stay valid.
--   2. Adds the indexes the /workspace/audit-log filters need
--      (project id inside detail, action prefix, actor + time).
--   3. Adds `audit_events_verify_chain(p_from_id, p_limit)` — recomputes
--      every row's curr_hash from the stored columns with the trigger's own
--      expression and checks prev_hash linkage, so the nightly
--      /api/cron/audit-chain-verify never has to reproduce Postgres'
--      timestamp/jsonb canonicalisation in JavaScript.
--
-- Applied via: docker exec -i supabase-db psql -U postgres -d postgres
--              < web/supabase/migrations/0335_audit_coverage.sql
-- Then:        docker exec supabase-db psql -U postgres -d postgres
--              -c "NOTIFY pgrst, 'reload schema';"

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Serialised hash-chain trigger -----------------------------------------

CREATE OR REPLACE FUNCTION public.audit_events_hash_chain() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_prev text;
  v_payload text;
BEGIN
  -- One writer at a time until this transaction commits: the next insert
  -- then sees this row as "last" and chains onto it.
  PERFORM pg_advisory_xact_lock(hashtext('audit_events_hash_chain'));

  SELECT curr_hash INTO v_prev
    FROM public.audit_events
    ORDER BY id DESC
    LIMIT 1;

  NEW.prev_hash := coalesce(v_prev, '');

  v_payload := coalesce(NEW.prev_hash, '') ||
               '|' || coalesce(extract(epoch FROM NEW.ts)::text, '') ||
               '|' || coalesce(NEW.user_id::text, '') ||
               '|' || coalesce(NEW.actor, '') ||
               '|' || coalesce(NEW.action, '') ||
               '|' || coalesce(NEW.resource_type, '') ||
               '|' || coalesce(NEW.resource_id, '') ||
               '|' || coalesce(NEW.detail::text, '{}');

  NEW.curr_hash := encode(digest(v_payload, 'sha256'), 'hex');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_events_hash_chain_trg ON public.audit_events;
CREATE TRIGGER audit_events_hash_chain_trg
  BEFORE INSERT ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_hash_chain();

-- 2. Viewer indexes ----------------------------------------------------------

CREATE INDEX IF NOT EXISTS audit_events_project_ts_idx
  ON public.audit_events ((detail->>'project_id'), ts DESC)
  WHERE detail ? 'project_id';

CREATE INDEX IF NOT EXISTS audit_events_user_ts_idx
  ON public.audit_events (user_id, ts DESC);

CREATE INDEX IF NOT EXISTS audit_events_action_prefix_idx
  ON public.audit_events (action text_pattern_ops, ts DESC);

-- 3. Chain verifier ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_events_verify_chain(
  p_from_id bigint DEFAULT 0,
  p_limit integer DEFAULT 5000
) RETURNS TABLE (
  checked integer,
  first_broken_id bigint,
  reason text,
  last_id bigint,
  last_hash text
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r record;
  v_prev text := NULL;
  v_expected text;
  v_checked integer := 0;
  v_last_id bigint := NULL;
  v_last_hash text := NULL;
BEGIN
  -- Seed linkage from the row just before the window so a windowed scan
  -- still checks the join between pages.
  IF p_from_id > 0 THEN
    SELECT e.curr_hash INTO v_prev
      FROM public.audit_events e
      WHERE e.id < p_from_id
      ORDER BY e.id DESC
      LIMIT 1;
  END IF;

  FOR r IN
    SELECT e.*
      FROM public.audit_events e
      WHERE e.id >= p_from_id
      ORDER BY e.id ASC
      LIMIT greatest(1, least(coalesce(p_limit, 5000), 50000))
  LOOP
    IF v_prev IS NOT NULL AND coalesce(r.prev_hash, '') <> v_prev THEN
      RETURN QUERY SELECT v_checked, r.id, 'prev_hash_mismatch'::text, v_last_id, v_last_hash;
      RETURN;
    END IF;

    v_expected := encode(digest(
      coalesce(r.prev_hash, '') ||
      '|' || coalesce(extract(epoch FROM r.ts)::text, '') ||
      '|' || coalesce(r.user_id::text, '') ||
      '|' || coalesce(r.actor, '') ||
      '|' || coalesce(r.action, '') ||
      '|' || coalesce(r.resource_type, '') ||
      '|' || coalesce(r.resource_id, '') ||
      '|' || coalesce(r.detail::text, '{}'),
      'sha256'), 'hex');

    IF r.curr_hash <> v_expected THEN
      RETURN QUERY SELECT v_checked, r.id, 'curr_hash_mismatch'::text, v_last_id, v_last_hash;
      RETURN;
    END IF;

    v_checked := v_checked + 1;
    v_prev := r.curr_hash;
    v_last_id := r.id;
    v_last_hash := r.curr_hash;
  END LOOP;

  RETURN QUERY SELECT v_checked, NULL::bigint, NULL::text, v_last_id, v_last_hash;
END $$;

REVOKE ALL ON FUNCTION public.audit_events_verify_chain(bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_events_verify_chain(bigint, integer) TO service_role;

COMMENT ON FUNCTION public.audit_events_verify_chain(bigint, integer) IS
  'S20-A: recompute curr_hash + check prev_hash linkage for audit_events rows '
  'id >= p_from_id (max p_limit rows). Called by /api/cron/audit-chain-verify.';

COMMENT ON TABLE public.audit_events IS
  'Append-only, hash-chained audit log. Since S20-A every mutating /api/** '
  'route writes one row via web/src/lib/audit/api-route.ts (detail carries '
  'method, route, family, status, project_id, actor_role, ip_hash, ua_family).';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
