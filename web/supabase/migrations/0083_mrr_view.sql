-- 0083_mrr_view.sql
-- T-1007: Real MRR calculation via subscription_trial_state x plans join.
-- ADDITIVE ONLY. Idempotent — safe to re-run.
--
-- Rationale (see web/content/reports/cfo-review-v2.0.0-beta.6.md Section 3):
-- the pre-existing "Revenue 30d" tile sums cash inflow from revenue_events,
-- which conflates annual up-fronts and one-off upgrades with recurring
-- monthly cash. True MRR is (active subs) x (their monthly-normalised
-- plan price) evaluated as a snapshot against subscription_trial_state.
--
-- v_mrr_active     — one row per active plan, with count + monthly cents.
-- v_mrr_by_segment — same, aggregated by plans.segment (founder / investor_* /
--                    advisor / accelerator) for the admin tile breakdown.
-- v_arr_run_rate   — single-row: sum(mrr_cents) x 12 as arr_cents.
--
-- All views are unqualified SELECTs so RLS from the underlying tables still
-- applies via the service_role client the metrics lib uses.

create or replace view v_mrr_active as
select
  plans.id as plan_id,
  plans.segment,
  plans.name as display_name,
  count(*) as active_subs,
  -- Normalise yearly/custom plans to monthly cents.
  sum(
    plans.price_aud_cents / case plans.interval
      when 'yearly' then 12
      when 'monthly' then 1
      else 0
    end
  ) as mrr_cents
from subscription_trial_state sts
join plans on plans.id = sts.plan_id
where sts.status = 'active'
  and plans.interval in ('monthly','yearly')
  and plans.price_aud_cents > 0
group by plans.id, plans.segment, plans.name;

create or replace view v_mrr_by_segment as
select
  segment,
  sum(active_subs)::bigint as active_subs,
  sum(mrr_cents)::bigint as mrr_cents
from v_mrr_active
group by segment;

create or replace view v_arr_run_rate as
select sum(mrr_cents) * 12 as arr_cents from v_mrr_active;

-- PostgREST schema reload so the views are queryable via the REST API.
notify pgrst, 'reload schema';
