-- 0383_increment_shares_held_hardening.sql
-- ---------------------------------------------------------------------------
-- S29 post-ship review — two hardenings on `increment_shares_held` (0381):
--
--   1. search_path pinned to `public, pg_temp`. 0381 pinned `public` only;
--      Postgres puts pg_temp FIRST implicitly unless it is listed, which is
--      the documented pattern for SECURITY DEFINER functions (the body is
--      schema-qualified, so this is belt-and-braces, not a live hole —
--      EXECUTE is service_role only).
--   2. |p_delta| bounded at 1e12 (`invalid_parameter_value`), matching
--      `MAX_SHARES_DELTA` in web/src/lib/cap-table/shares-held.ts, so a
--      caller bug can never move a register by more than a trillion shares
--      in one statement.
--
-- Same signature, same grants, same return; CREATE OR REPLACE keeps the
-- OID so nothing that references the function needs to change. Both TS
-- callers already reject the bound before the call — this is the
-- server-side floor.
--
-- Idempotent. Apply with scripts/db/apply-migration.sh (never auto-applied).
--
-- Rollback
--   re-apply 0381_increment_shares_held.sql (restores the 0381 body).
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.increment_shares_held(
  p_shareholder_id uuid,
  p_delta          bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new bigint;
BEGIN
  IF p_shareholder_id IS NULL OR p_delta IS NULL THEN
    RAISE EXCEPTION 'increment_shares_held: shareholder id and delta are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_delta = 0 OR abs(p_delta) > 1000000000000 THEN
    RAISE EXCEPTION 'increment_shares_held: delta % is out of range (non-zero, |delta| <= 1e12)', p_delta
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The whole increment is this one statement: the row lock serialises
  -- concurrent callers and the second sees the first's write. The WHERE
  -- refuses an overdraw so the register can never hold a negative balance.
  UPDATE public.shareholders s
     SET shares_held = s.shares_held + p_delta
   WHERE s.id = p_shareholder_id
     AND s.shares_held + p_delta >= 0
  RETURNING s.shares_held INTO v_new;

  IF v_new IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.shareholders s2 WHERE s2.id = p_shareholder_id) THEN
      RAISE EXCEPTION 'increment_shares_held: shareholder % not found', p_shareholder_id
        USING ERRCODE = 'no_data_found';
    END IF;
    RAISE EXCEPTION 'increment_shares_held: delta % would take shareholder % below zero', p_delta, p_shareholder_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_shares_held(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_shares_held(uuid, bigint) FROM anon;
REVOKE ALL ON FUNCTION public.increment_shares_held(uuid, bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_shares_held(uuid, bigint) TO service_role;

COMMENT ON FUNCTION public.increment_shares_held(uuid, bigint) IS
  'Atomic shares_held += delta (non-zero, |delta| <= 1e12; rejects a result < 0). search_path public, pg_temp. Called by the cap-table issue_shares action and the DRIP allotment (web/src/lib/cap-table/shares-held.ts, S29-hardening + S29 review).';

COMMIT;
