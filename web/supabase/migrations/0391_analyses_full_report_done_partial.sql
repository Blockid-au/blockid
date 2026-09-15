-- 0391_analyses_full_report_done_partial.sql
-- ---------------------------------------------------------------------------
-- S32-E "partial results are never thrown away" (live run 2026-09-15
-- 09:18 UTC, analysis 32fbf056-…: 3 of 7 voices written, job marked
-- `failed`, founder saw nothing and got no email).
--
-- Why
--   A first-analysis job whose run ends with at least four of the seven
--   C-level sections written is now delivered as it stands: the result page
--   shows the finished sections plus "N sections are still being written —
--   we will email the full report when they finish", the PDF renders the
--   available voices with a "to follow" note on the rest, and the email
--   goes out once for the partial ("(part 1)") and once more when the
--   5-minute cron has backfilled the missing sections (per-section
--   attempts in `full_report_json.sections[role]`, at most three, then the
--   voice is marked `unavailable` with an honest one-liner in the PDF).
--
-- What
--   One new value for `analyses.full_report_status`: `done_partial`.
--   The 0390 check constraint is dropped and re-added with the new value.
--   No new columns: the per-section state and the part-1 email stamp live
--   in `full_report_json` (types.ts `sections`, `partialAt`, `delivery`).
--
--   queued | running | done | done_partial | failed
--
-- Not applied by deploy — run with scripts/db/apply-migration.sh.
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
-- ---------------------------------------------------------------------------

begin;

alter table public.analyses
  drop constraint if exists analyses_full_report_status_check;

alter table public.analyses
  add constraint analyses_full_report_status_check
  check (
    full_report_status is null
    or full_report_status in ('queued', 'running', 'done', 'done_partial', 'failed')
  );

comment on column public.analyses.full_report_status is
  'S32-B/E first-analysis job state: queued | running | done | done_partial | failed. NULL = never enqueued (pre-0390 rows). done_partial (0391) = >= 4 of 7 sections delivered, the cron backfills the rest section by section.';

commit;
