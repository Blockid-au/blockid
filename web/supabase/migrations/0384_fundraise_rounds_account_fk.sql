-- 0384_fundraise_rounds_account_fk.sql — fundraise_rounds.account_id → app_users
-- (live QA lane 2, 2026-09-13, P1-1)
-- ---------------------------------------------------------------------------
-- Migration 0043 created fundraise_rounds.account_id REFERENCES svi_accounts(id),
-- but every writer (api/fundraise since 2026-07, S26-A rounds-server, the
-- commitments/activate routes) stores the app_users id — so every insert
-- failed 23503 and the table has never held a row in production. Repoint the
-- FK to app_users(id) ON DELETE CASCADE (the key the code actually uses);
-- the table is empty, so the constraint validates immediately. The new FK is
-- the 129th on app_users → erasure-map entry (delete) + erase_account()
-- re-emitted by 0385.
BEGIN;

ALTER TABLE public.fundraise_rounds DROP CONSTRAINT IF EXISTS fundraise_rounds_account_id_fkey;
ALTER TABLE public.fundraise_rounds
  ADD CONSTRAINT fundraise_rounds_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES public.app_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_fundraise_rounds_account_id ON public.fundraise_rounds (account_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
