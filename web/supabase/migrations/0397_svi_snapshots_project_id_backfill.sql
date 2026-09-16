-- 0397 — backfill svi_snapshots.project_id from svi_accounts.project_id
--
-- G13 W2 post-ship review (#5): the Investor Dossier and
-- `latestSviByProject` read `svi_snapshots.project_id`, but the column only
-- started being written on 2026-09-10 (T0271) — 3,302 rows had NULL, so every
-- existing startup showed "Not scored yet". The account → project link has
-- existed all along in `svi_accounts.project_id`; copy it across once.
-- Idempotent (only touches NULLs) and re-runnable.
BEGIN;

UPDATE public.svi_snapshots s
   SET project_id = a.project_id
  FROM public.svi_accounts a
 WHERE a.id = s.account_id
   AND s.project_id IS NULL
   AND a.project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS svi_snapshots_project_created_idx
  ON public.svi_snapshots (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

COMMIT;
