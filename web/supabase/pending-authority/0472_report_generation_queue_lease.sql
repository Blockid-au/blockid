-- 0472 — report_generation_queue lease: claim token, attempts, heartbeat (27/09/2026, O08).
--
-- A paid Trust Business Report order whose worker dies mid-run (deploy
-- retiring an origin, restart, OOM) stayed `running` forever: nothing ever
-- re-claimed a running row, so the customer waited indefinitely and support
-- had to refund by hand.
--
-- Additive only:
--   claim_token  uuid        — minted per claim; every write the worker makes
--                              is fenced on it, so a reclaimed worker's late
--                              write matches zero rows (no double READY, no
--                              double refund).
--   attempts     integer     — number of claims made (bumped on each claim;
--                              the claim is a conditional update on the value
--                              read, so two claimants cannot both win).
--   heartbeat_at timestamptz — refreshed every 30 s while a claim runs; the
--                              drain cron re-queues (or, attempts spent,
--                              fails + refunds) a running row with no
--                              heartbeat for > 10 min and a claim > 15 min old.
--
-- Existing rows get attempts = 0 and NULL token/heartbeat, which the code
-- reads as "legacy claim" (age alone decides). Retained releases never
-- select or write these columns and are unaffected. The new code
-- (lib/paywall/report-order-worker.ts) detects the columns missing
-- (42703 / PGRST204), logs once and keeps the pre-O08 behaviour until this
-- file is applied, re-probing every 10 min. No personal data, no FKs.
BEGIN;
ALTER TABLE public.report_generation_queue
  ADD COLUMN IF NOT EXISTS claim_token uuid;
ALTER TABLE public.report_generation_queue
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.report_generation_queue
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
ALTER TABLE public.report_generation_queue
  DROP CONSTRAINT IF EXISTS report_generation_queue_attempts_check;
ALTER TABLE public.report_generation_queue
  ADD CONSTRAINT report_generation_queue_attempts_check CHECK (attempts >= 0);
-- The reclaim sweep scans running rows oldest-claim first.
CREATE INDEX IF NOT EXISTS report_generation_queue_running_started_idx
  ON public.report_generation_queue (started_at)
  WHERE status = 'running';
COMMIT;
NOTIFY pgrst, 'reload schema';
