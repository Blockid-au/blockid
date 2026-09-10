-- 0324_spend_credits_rpc.sql
-- ---------------------------------------------------------------------------
-- Money-path review 2026-09-10, finding #18 (foundation for #2 / #3):
-- `spendCredits` in web/src/lib/credits.ts used to READ credit_balances,
-- compute `balance - cost` in JS and UPDATE with a `.gte("balance", cost)`
-- guard. Two concurrent spends from a balance of 6 both read 6, both pass
-- the guard and both write 3 → net -3 for two features. The debit has to be
-- a single UPDATE that subtracts server-side.
--
--   spend_credits_atomic(p_user_id, p_cost, p_feature, p_meta)
--     → (ok boolean, balance numeric)
--
--   ok=true  : one row was debited; `balance` is the post-debit balance and
--              the credit_transactions + usage_logs audit rows were written
--              in the same transaction.
--   ok=false : no row matched (no balance row, or balance < cost); `balance`
--              is the current balance (0 when the row is missing). Nothing
--              was written.
--
-- Column types follow migration 0015 (NUMERIC(10,2) — fractional credits),
-- so p_cost is numeric, not int. credits.ts falls back to the old
-- read-then-guard path with a console.warn when this function is missing
-- (42883 / PGRST202), so deploying the code before applying this file
-- cannot break production; it just keeps the old race until applied.
--
-- Also here (finding #3): grant_application_drafts.status gains
-- 'spend_failed' so a draft whose credit spend failed can be quarantined
-- instead of deleted (latestGrantDraft / getGrantDraft exclude it).
--
-- Idempotent. Apply by hand (self-hosted Supabase; migrations are not run on
-- deploy):
--   docker cp web/supabase/migrations/0324_spend_credits_rpc.sql supabase-db:/tmp/0324.sql
--   docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/0324.sql
--
-- Rollback
--   drop function if exists public.spend_credits_atomic(uuid, numeric, text, jsonb);
--   (the widened CHECK is backward compatible — leave it)
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.spend_credits_atomic(
  p_user_id uuid,
  p_cost    numeric,
  p_feature text,
  p_meta    jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (ok boolean, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  IF p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'spend_credits_atomic: p_cost must be >= 0 (got %)', p_cost;
  END IF;

  -- The whole debit is this one statement: the WHERE re-checks the balance
  -- under the row lock, so two concurrent callers serialise and the second
  -- sees the already-debited value.
  UPDATE public.credit_balances cb
     SET balance        = cb.balance - p_cost,
         lifetime_spent = cb.lifetime_spent + p_cost,
         updated_at     = now()
   WHERE cb.user_id = p_user_id
     AND cb.balance >= p_cost
  RETURNING cb.balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    -- No row matched: report the current balance (0 when none exists).
    RETURN QUERY
      SELECT false, COALESCE((SELECT cb2.balance FROM public.credit_balances cb2 WHERE cb2.user_id = p_user_id), 0::numeric);
    RETURN;
  END IF;

  -- Audit rows travel in the same transaction as the debit.
  INSERT INTO public.credit_transactions (user_id, amount, balance_after, reason, metadata)
  VALUES (p_user_id, -p_cost, v_new_balance, p_feature, COALESCE(p_meta, '{}'::jsonb));

  INSERT INTO public.usage_logs (user_id, feature, credits_used, metadata)
  VALUES (p_user_id, p_feature, p_cost, COALESCE(p_meta, '{}'::jsonb));

  RETURN QUERY SELECT true, v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.spend_credits_atomic(uuid, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spend_credits_atomic(uuid, numeric, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.spend_credits_atomic(uuid, numeric, text, jsonb) IS
  'Atomic credit debit: balance = balance - cost WHERE balance >= cost, plus credit_transactions + usage_logs rows. Called by web/src/lib/credits.ts spendCredits (review 2026-09-10 #18).';

-- ─── grant_application_drafts.status += spend_failed (finding #3) ────────────
ALTER TABLE public.grant_application_drafts
  DROP CONSTRAINT IF EXISTS grant_application_drafts_status_check;
ALTER TABLE public.grant_application_drafts
  ADD CONSTRAINT grant_application_drafts_status_check
  CHECK (status IN ('draft', 'final', 'spend_failed'));

COMMIT;

NOTIFY pgrst, 'reload schema';
