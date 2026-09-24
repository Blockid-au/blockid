-- Rollback for 0460 (G33-T08): the audit_events_hash_chain() definition live before 24/09/2026.
-- Restores id-before-lock behaviour (the fork race); use only if 0460 itself misbehaves.
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
END $function$

;
