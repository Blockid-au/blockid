-- 0390_analyses_first_analysis_full_report.sql
-- ---------------------------------------------------------------------------
-- S32-B "the first analysis" (founder report 2026-09-15).
--
-- Why
--   /analyze showed a score, a range and four heuristic findings, then asked
--   for an email to send a five-page summary. It never echoed what BlockID had
--   actually read from the input, and the C-level AI commentary — the part
--   the founder was told the agents produce — was not on the result page at
--   all. The first (free) analysis now runs the full pipeline as a background
--   job keyed on the `analyses` row: SVI with per-dimension reasoning, an
--   indicative valuation with stated assumptions, seven C-level sections,
--   a 30-day plan — and a >= 10-page PDF emailed once when the job lands.
--
-- What
--   Job state on `public.analyses` (one job per analysis, retried by the
--   `first-analysis-report` cron at most FULL_REPORT_MAX_ATTEMPTS times):
--     * full_report_status       queued | running | done | failed
--     * full_report_json         the FirstAnalysisReport — written
--                                incrementally so the page can stream
--                                sections in as each agent finishes
--     * full_report_error        last failure reason, for support
--     * full_report_attempts     retry counter (cron gives up at 3)
--     * full_report_started_at   set when a worker claims the job; a
--                                `running` row older than 15 min is "stuck"
--                                and re-claimable
--     * full_report_finished_at  set on done / failed
--     * full_report_email        destination. A signed-in founder's account
--                                email, or the address a guest typed into
--                                the free-summary card (the existing gate)
--     * full_report_emailed_at   send-once stamp; NULL until the provider
--                                accepted the message
--
-- FKs: none added — `analyses` already carries user_id → app_users (0124).
-- No new tables. Nothing here is public: rows stay reachable only through
-- getAnalysisForViewer (owner or anon cookie) and the signed download link.
--
-- Not applied by deploy — run with scripts/db/apply-migration.sh.
-- Idempotent: add-column-if-not-exists throughout.
-- ---------------------------------------------------------------------------

begin;

alter table public.analyses
  add column if not exists full_report_status text;
alter table public.analyses
  add column if not exists full_report_json jsonb;
alter table public.analyses
  add column if not exists full_report_error text;
alter table public.analyses
  add column if not exists full_report_attempts integer not null default 0;
alter table public.analyses
  add column if not exists full_report_started_at timestamptz;
alter table public.analyses
  add column if not exists full_report_finished_at timestamptz;
alter table public.analyses
  add column if not exists full_report_email text;
alter table public.analyses
  add column if not exists full_report_emailed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'analyses_full_report_status_check'
      and conrelid = 'public.analyses'::regclass
  ) then
    alter table public.analyses
      add constraint analyses_full_report_status_check
      check (full_report_status is null or full_report_status in ('queued', 'running', 'done', 'failed'));
  end if;
end $$;

-- The cron's sweep: "queued or failed with attempts left, or running for
-- too long, or done but not yet emailed" — all filter on status, so a
-- partial index keeps the sweep off the finished rows.
create index if not exists analyses_full_report_pending_idx
  on public.analyses (full_report_status, created_at desc)
  where full_report_status is not null and full_report_emailed_at is null;

comment on column public.analyses.full_report_status is
  'S32-B first-analysis job state: queued | running | done | failed. NULL = never enqueued (pre-0390 rows).';
comment on column public.analyses.full_report_json is
  'S32-B FirstAnalysisReport JSON (lib/analyses/first-analysis/types.ts), written incrementally as sections land.';
comment on column public.analyses.full_report_email is
  'Destination for the emailed PDF: account email for a signed-in founder, or the address a guest gave at the free-summary gate.';
comment on column public.analyses.full_report_emailed_at is
  'Send-once stamp for the first-analysis PDF email. NULL until the provider accepted the message.';

commit;
