-- 0432_cohort_snapshots_member_select.sql
-- ---------------------------------------------------------------------------
-- G22-A — cohort membership completeness
-- (docs/plans/g22-upgrade-hardening-2026-09-21.md § 2 A.6).
--
-- 0422 gave `public.cohort_snapshots` an OWNER-only SELECT policy (the batch
-- creator) plus the service-role ALL policy the server routes use. 0423 then
-- added reviewer / viewer seats on a batch (`public.evaluation_batch_members`)
-- and let those seats SELECT the batch and its items — but not its
-- snapshots. A future user-JWT client (the institutional API's RLS path, a
-- direct PostgREST read) would therefore show a reviewer the cohort table
-- and no history. This migration closes that gap: a member of the batch may
-- SELECT its snapshots, exactly what `GET /api/evaluations/batch/[id]/
-- snapshots` answers through the service role after G22-A.
--
-- Read-only: no INSERT / UPDATE / DELETE for members (snapshots are written
-- by the server only — snapshot route / batch runner via the service role).
-- Idempotent (DROP POLICY IF EXISTS + CREATE POLICY, DO-guarded on the two
-- tables existing). Apply by hand at merge:
--   scripts/db/apply-migration.sh web/supabase/migrations/0432_cohort_snapshots_member_select.sql
-- ---------------------------------------------------------------------------

begin;

do $$
begin
  if to_regclass('public.cohort_snapshots') is null then
    raise notice '0432: public.cohort_snapshots missing (apply 0422 first) — nothing to do';
    return;
  end if;
  if to_regclass('public.evaluation_batch_members') is null then
    raise notice '0432: public.evaluation_batch_members missing (apply 0423 first) — nothing to do';
    return;
  end if;

  execute 'alter table public.cohort_snapshots enable row level security';

  execute 'drop policy if exists cohort_snapshots_member_select on public.cohort_snapshots';
  execute $p$
    create policy cohort_snapshots_member_select on public.cohort_snapshots
      for select using (
        exists (
          select 1 from public.evaluation_batch_members m
           where m.batch_id = cohort_snapshots.batch_id
             and m.user_id = auth.uid()
        )
      )
  $p$;

  execute $c$
    comment on policy cohort_snapshots_member_select on public.cohort_snapshots is
      'G22-A (0432): a reviewer / viewer / owner seat on the batch (evaluation_batch_members) reads its snapshots; writes stay service-role only.'
  $c$;
end
$$;

commit;

notify pgrst, 'reload schema';
