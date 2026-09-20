-- 0420_revenue_events_kind_one_offs.sql
--
-- G21 P0 review (2026-09-20): the `revenue_events_kind_check` from 0075 only
-- allowed the subscription/credit-pack kinds, while the Stripe webhook has
-- been writing `trust_report_5aud`, `guest_analysis_3aud`,
-- `funding_report_3aud`, `startup_package` and now `cohort_pilot`. The insert
-- helper swallows the 23514 error, so every one-off sale since 2026-08 was
-- silently missing from revenue_events (live DB held only subscribe +
-- credit_pack rows). Widen the CHECK to every kind the code writes.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'revenue_events_kind_check') then
    alter table public.revenue_events drop constraint revenue_events_kind_check;
  end if;
  alter table public.revenue_events
    add constraint revenue_events_kind_check
    check (kind in (
      'trial_start','trial_convert','trial_end_no_payment',
      'subscribe','upgrade','downgrade','renewal','refund','chargeback',
      'credit_pack',
      'trust_report_5aud','guest_analysis_3aud','funding_report_3aud',
      'startup_package','cohort_pilot'
    ));
end $$;
