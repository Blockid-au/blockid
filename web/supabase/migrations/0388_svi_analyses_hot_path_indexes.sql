-- 0388_svi_analyses_hot_path_indexes.sql
-- ---------------------------------------------------------------------------
-- S31-C capacity audit (2026-09-13) — indexes for the trial-wave hot path.
--
-- Why
--   `public.svi_analyses` is the most-read table on the trial journey and
--   has only its primary key. pg_stat_statements (since 2026-08-01):
--     WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 5000
--       45,046 calls, 51 ms mean, 2,316 s total — the single largest query
--       by total time on the box (startup-index headline/listings pages +
--       /api/index/* + investor digests, every request, no cache).
--   The codebase filters this table 51x by `email`, 21x by `project_id`,
--   30x by `created_at >=` and orders 47x by `created_at` (grep of
--   `.from("svi_analyses")` call sites). At 182 rows a seq scan costs
--   0.3 ms; the JSON aggregation of `analysis_json` is what costs the 51 ms
--   and an index does not fix that (see the audit report — the fix there is
--   a 5-minute data-layer cache). What an index DOES fix is the shape of the
--   scan once a trial wave pushes the table past ~5 k rows: each founder's
--   workspace load (`eq("email") order created_at desc`) and each public
--   startup-index page (`gte("created_at")`) currently reads every row and
--   de-TOASTs nothing but still sorts the whole table.
--
-- What
--   idx_svi_analyses_email_created   (email, created_at DESC)
--   idx_svi_analyses_project_created (project_id, created_at DESC)
--                                    WHERE project_id IS NOT NULL
--   idx_svi_analyses_created_at      (created_at DESC)
--
-- Not applied by deploy — run with scripts/db/apply-migration.sh, which
-- wraps the file in one transaction. `CREATE INDEX CONCURRENTLY` cannot run
-- inside a transaction, so these are plain `CREATE INDEX IF NOT EXISTS`:
-- each takes a SHARE lock on svi_analyses for the build (sub-second at the
-- current 2.6 MB; writes to the table wait, reads do not). Apply off-peak.
-- Idempotent: safe to re-run.

CREATE INDEX IF NOT EXISTS idx_svi_analyses_email_created
  ON public.svi_analyses (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_svi_analyses_project_created
  ON public.svi_analyses (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_svi_analyses_created_at
  ON public.svi_analyses (created_at DESC);

COMMENT ON INDEX public.idx_svi_analyses_email_created IS
  'S31-C: founder workspace / report lookups — eq(email) order created_at desc';
COMMENT ON INDEX public.idx_svi_analyses_project_created IS
  'S31-C: per-project analysis history — eq(project_id) order created_at desc';
COMMENT ON INDEX public.idx_svi_analyses_created_at IS
  'S31-C: startup-index 90-day window — gte(created_at) order created_at desc';

NOTIFY pgrst, 'reload schema';
