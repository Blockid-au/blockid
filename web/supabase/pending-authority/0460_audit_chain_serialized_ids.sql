-- 0460 — G33-T08: audit hash chain — serialise ids with the chain, verify as a graph.
--
-- Incident (24/09/2026 live test): `audit-chain-verify` has reported
-- `prev_hash_mismatch` at id 6702 daily since 18/09 and stopped there, so
-- ~7 000 later rows were never verified. Read-only analysis of rows 6698–6706:
-- the trigger serialises chaining with pg_advisory_xact_lock, but the row `id`
-- comes from the column default BEFORE the trigger runs, and the chain tip was
-- chosen as "highest id". Two concurrent inserts (6702, 6703) took the lock in
-- the opposite order to their ids; the next insert then picked 6703 as the tip
-- again and chained onto it a second time. Result: five forks (a parent with
-- two children) between 18/09 and 21/09 — every row's own hash still
-- recomputes, so this is a trigger race, not tampering.
--
-- Fix (append-only; no audit row is updated or deleted):
--   1. the trigger assigns NEW.id from the sequence AFTER taking the lock, so
--      id order == chain order and "highest id" is the true tip;
--   2. audit_events_verify_graph() verifies the whole ledger as a hash graph:
--      every hash recomputes, every prev_hash resolves, exactly one genesis,
--      and forks only at parents listed by the caller (the five historical
--      ones are pinned in lib/audit/chain-verify.ts with this incident note).
-- Idempotent: CREATE OR REPLACE / IF NOT EXISTS only.

CREATE OR REPLACE FUNCTION public.audit_events_hash_chain()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_prev text;
  v_payload text;
BEGIN
  -- One writer at a time until this transaction commits: the next insert
  -- then sees this row as "last" and chains onto it.
  PERFORM pg_advisory_xact_lock(hashtext('audit_events_hash_chain'));

  -- G33-T08: take the id under the lock (the default's value is discarded — a
  -- sequence gap, never a reuse), so ids and chain positions share one order.
  NEW.id := nextval(pg_get_serial_sequence('public.audit_events', 'id'));

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
END $function$;

CREATE INDEX IF NOT EXISTS audit_events_curr_hash_idx ON public.audit_events USING btree (curr_hash);
CREATE INDEX IF NOT EXISTS audit_events_prev_hash_idx ON public.audit_events USING btree (prev_hash);

CREATE OR REPLACE FUNCTION public.audit_events_verify_graph(p_known_forks text[] DEFAULT '{}')
 RETURNS TABLE(checked integer, first_broken_id bigint, reason text, last_id bigint, last_hash text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  r record;
  v_expected text;
  v_checked integer := 0;
  v_bad bigint;
  v_last_id bigint;
  v_last_hash text;
BEGIN
  SELECT e.id, e.curr_hash INTO v_last_id, v_last_hash
    FROM public.audit_events e ORDER BY e.id DESC LIMIT 1;

  -- 1. Every row's own hash recomputes from its stored fields.
  FOR r IN SELECT e.* FROM public.audit_events e ORDER BY e.id ASC LOOP
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
    IF r.curr_hash IS DISTINCT FROM v_expected THEN
      RETURN QUERY SELECT v_checked, r.id, 'curr_hash_mismatch'::text, v_last_id, v_last_hash;
      RETURN;
    END IF;
    v_checked := v_checked + 1;
  END LOOP;

  -- 2. Exactly one genesis row.
  IF (SELECT count(*) FROM public.audit_events e WHERE coalesce(e.prev_hash, '') = '') > 1 THEN
    SELECT min(e.id) INTO v_bad FROM public.audit_events e WHERE coalesce(e.prev_hash, '') = '' AND e.id > (SELECT min(g.id) FROM public.audit_events g WHERE coalesce(g.prev_hash, '') = '');
    RETURN QUERY SELECT v_checked, v_bad, 'multiple_genesis'::text, v_last_id, v_last_hash;
    RETURN;
  END IF;

  -- 3. Every non-genesis prev_hash points at an existing row (a deleted parent breaks here).
  SELECT min(e.id) INTO v_bad
    FROM public.audit_events e
    WHERE coalesce(e.prev_hash, '') <> ''
      AND NOT EXISTS (SELECT 1 FROM public.audit_events p WHERE p.curr_hash = e.prev_hash);
  IF v_bad IS NOT NULL THEN
    RETURN QUERY SELECT v_checked, v_bad, 'dangling_prev_hash'::text, v_last_id, v_last_hash;
    RETURN;
  END IF;

  -- 4. No fork except the parents the caller pinned (historical incidents).
  SELECT min(e.id) INTO v_bad
    FROM public.audit_events e
    WHERE coalesce(e.prev_hash, '') <> ''
      AND NOT (e.prev_hash = ANY (coalesce(p_known_forks, '{}')))
      AND (SELECT count(*) FROM public.audit_events s WHERE s.prev_hash = e.prev_hash) > 1;
  IF v_bad IS NOT NULL THEN
    RETURN QUERY SELECT v_checked, v_bad, 'fork'::text, v_last_id, v_last_hash;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_checked, NULL::bigint, NULL::text, v_last_id, v_last_hash;
END $function$;

REVOKE ALL ON FUNCTION public.audit_events_verify_graph(text[]) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.audit_events_verify_graph(text[]) TO service_role;
  END IF;
END $$;
