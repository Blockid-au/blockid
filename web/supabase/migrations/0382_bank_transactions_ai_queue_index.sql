-- 0382_bank_transactions_ai_queue_index.sql
-- ---------------------------------------------------------------------------
-- S29-hardening (S28 post-ship review #11) — the AI categorise queue index.
--
-- Why
--   0377 shipped `idx_bank_transactions_review` as a partial index on
--   `needs_review = true`, described as "needs review first + the categorise
--   queue". The queue reads are NOT that predicate: `loadAiQueue` /
--   `countAiQueue` (web/src/lib/expenses/server.ts) select
--     WHERE project_id = $1 AND category_source IS NULL
--     ORDER BY occurred_on DESC
--   A rule-categorised row that still needs a human pick has
--   needs_review = true AND category_source = 'rule' (not in the queue), and
--   a queued row has category_source IS NULL — the two predicates overlap
--   but neither implies the other, so the planner cannot use the review
--   index for the queue and falls back to `idx_bank_transactions_project_date`
--   plus a filter over every row of the project. Fine at 5 k rows; not fine
--   once the queue count is on the workspace page for every project.
--
-- What
--   idx_bank_transactions_ai_queue — (project_id, occurred_on DESC)
--   WHERE category_source IS NULL. Tiny (only queued rows), matches the
--   query's filter + order exactly, and `countAiQueue` becomes an
--   index-only count. The 0377 review index is left as-is (the "needs
--   review first" list still uses it).
--
-- Idempotent. Apply with scripts/db/apply-migration.sh (never auto-applied).
--
-- Rollback
--   drop index if exists public.idx_bank_transactions_ai_queue;
-- ---------------------------------------------------------------------------

BEGIN;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_ai_queue
  ON public.bank_transactions (project_id, occurred_on DESC)
  WHERE category_source IS NULL;

COMMENT ON INDEX public.idx_bank_transactions_ai_queue IS
  'AI categorise queue: loadAiQueue / countAiQueue read project_id + category_source IS NULL ordered by occurred_on DESC (S29-hardening, S28 review #11).';

COMMIT;
