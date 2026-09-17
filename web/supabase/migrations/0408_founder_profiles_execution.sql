-- 0408_founder_profiles_execution.sql
-- ---------------------------------------------------------------------------
-- G14-S37 — Founder execution profile (docs/plans/g14-investor-feedback-
-- 2026-09-16.md §5 row S37; judge question C6 "How do you take execution
-- capability of the founder team into account?").
--
-- Before S37 the FTV dimension (15 % of the index) was regex over prose:
-- `founder_profiles` (0064) was flattened to a sentence and re-parsed for
-- "serial" / "co-founder" / "advisor". This migration adds the STRUCTURED
-- execution fields the rubric in lib/founder/execution.ts scores
-- (exits 30 · prior raises 15 · years in domain 20 · role coverage 15 ·
-- full-time 10 · worked together 5 · GitHub activity 5) plus the persisted
-- result and per-field provenance.
--
--   prior_exits        jsonb [{company, year, type: acquisition|ipo|shutdown, value_band}]
--   prior_raises       jsonb [{company, round, amount_aud_band, year}]
--   github_url         text
--   full_time_pct      smallint 0..100
--   worked_together_before boolean
--   roles              jsonb {ceo, cto, cpo, cfo}: name | null
--   execution_score    smallint 0..100 — the rubric result at the last score
--   execution_computed_at timestamptz
--   execution_source   jsonb {field: "founder" | "linkedin_parser" | "github" | "evaluator"}
--
-- No new FK (founder_profiles.account_id → app_users already exists).
-- Idempotent (IF NOT EXISTS columns, DO-guarded CHECK constraints).
-- Apply by hand (never on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0408_founder_profiles_execution.sql

alter table public.founder_profiles
  add column if not exists prior_exits jsonb not null default '[]'::jsonb,
  add column if not exists prior_raises jsonb not null default '[]'::jsonb,
  add column if not exists github_url text,
  add column if not exists full_time_pct smallint,
  add column if not exists worked_together_before boolean,
  add column if not exists roles jsonb not null default '{}'::jsonb,
  add column if not exists execution_score smallint,
  add column if not exists execution_computed_at timestamptz,
  add column if not exists execution_source jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'founder_profiles_full_time_pct_range'
  ) then
    alter table public.founder_profiles
      add constraint founder_profiles_full_time_pct_range
      check (full_time_pct is null or (full_time_pct >= 0 and full_time_pct <= 100));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'founder_profiles_execution_score_range'
  ) then
    alter table public.founder_profiles
      add constraint founder_profiles_execution_score_range
      check (execution_score is null or (execution_score >= 0 and execution_score <= 100));
  end if;
end $$;

comment on column public.founder_profiles.prior_exits is 'G14-S37: [{company, year, type: acquisition|ipo|shutdown, value_band}] — rubric 30 pts';
comment on column public.founder_profiles.prior_raises is 'G14-S37: [{company, round, amount_aud_band, year}] — rubric 15 pts';
comment on column public.founder_profiles.roles is 'G14-S37: {ceo, cto, cpo, cfo}: name | null — role coverage 15 pts';
comment on column public.founder_profiles.execution_score is 'G14-S37: lib/founder/execution.ts founderExecutionSignals().executionScore at the last score (0..100, cap 70 while self-reported)';
comment on column public.founder_profiles.execution_source is 'G14-S37: {field: founder|linkedin_parser|github|evaluator} — provenance per structured field';

notify pgrst, 'reload schema';
