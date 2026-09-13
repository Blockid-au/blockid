-- 0381_increment_shares_held.sql
-- ---------------------------------------------------------------------------
-- S29-hardening (S28 post-ship review #12): `shareholders.shares_held` was a
-- read-modify-write on both issue paths — the cap-table `issue_shares`
-- action (web/src/app/api/cap-table/route.ts) and the DRIP allotment
-- (web/src/lib/dividends/drip-server.ts `recordDripAllocation`). Each read
-- the holding, added the new shares in JS and wrote the sum back, so a
-- register edit and a DRIP run in the same second lost one of the two
-- increments. The increment has to be ONE statement that adds server-side.
--
--   increment_shares_held(p_shareholder_id uuid, p_delta bigint) → bigint
--     Returns the post-increment `shares_held`.
--     Raises when the shareholder does not exist or the result would go
--     below zero (a buy-back / transfer that overdraws the holding is a bug
--     in the caller, never a silent negative register).
--
-- SECURITY DEFINER, EXECUTE granted to service_role only — every caller is
-- the admin client behind an `apiRoute()`-wrapped handler that has already
-- resolved the shareholder through the project scope. Both callers
-- feature-detect (42883 / PGRST202 → warn once, fall back to the old
-- read-modify-write) so deploying the code before this file cannot break
-- production; it just keeps the race until applied.
--
-- Idempotent. Apply with scripts/db/apply-migration.sh (never auto-applied).
--
-- Rollback
--   drop function if exists public.increment_shares_held(uuid, bigint);
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.increment_shares_held(
  p_shareholder_id uuid,
  p_delta          bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new bigint;
BEGIN
  IF p_shareholder_id IS NULL OR p_delta IS NULL THEN
    RAISE EXCEPTION 'increment_shares_held: shareholder id and delta are required'
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
  'Atomic shares_held += delta (rejects a result < 0). Called by the cap-table issue_shares action and the DRIP allotment (web/src/lib/cap-table/shares-held.ts, S29-hardening).';

COMMIT;
