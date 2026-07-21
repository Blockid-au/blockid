-- 0098_share_management_grandfather_backfill.sql
-- P8.3 (reseller-module goal): grandfather existing paying subscribers into
-- the new share_management add-on so the P8 SKU split does not silently
-- strip cap-table / vesting / ESOP / tokenization access from active users.
-- ADDITIVE + IDEMPOTENT. Safe to re-run.
--
-- Per plan §F.4 (docs/plans/reseller-module-plan.md:1046-1049):
--   Cutover T = P8 release deploy time. Snapshot subscription_trial_state.
--   Any user with (status IN ('active','trialing')) on a legacy paid plan
--   at cutover is grandfathered forever. If their subscription later lapses
--   60+ days the customer-success flow (P11) removes the grandfather flag —
--   this migration does NOT touch that lifecycle path.
--
-- Two writes per matching user:
--   1. UPDATE app_users SET grandfathered_share_management=true,
--                            grandfathered_at=now()
--      (columns landed in 0092_reseller_column_extensions.sql:18-19)
--   2. INSERT INTO entitlements(user_id,'share_management',true,'grandfathered')
--      so entitlements.ts can() short-circuits without touching subscription
--      state on every request. source='grandfathered' is already a member of
--      the entitlements_source_check enum from 0075:63-71.

begin;

-- 1. Flip the app_users grandfather flag for every active/trialing paying
-- customer whose plan predates the share_management split. The idempotency
-- guard (grandfathered_share_management = false) means re-runs are no-ops.
update app_users u
  set grandfathered_share_management = true,
      grandfathered_at = now()
  where u.grandfathered_share_management = false
    and exists (
      select 1
        from subscription_trial_state s
       where s.user_id = u.id
         and s.status in ('active','trialing')
         and s.plan_id in (
           'founder_growth',
           'founder_scale',
           'founder_enterprise',
           'growth',
           'growth_annual'
         )
    );

-- 2. Materialise the share_management entitlement row for the same cohort.
-- Uses the composite PK (user_id, feature) to skip duplicates on re-run.
insert into entitlements (user_id, feature, allowed, source, granted_at, detail)
  select u.id,
         'share_management',
         true,
         'grandfathered',
         now(),
         jsonb_build_object(
           'backfill_migration', '0098',
           'cutover_plan_id',    s.plan_id,
           'cutover_status',     s.status
         )
    from app_users u
    join subscription_trial_state s on s.user_id = u.id
   where u.grandfathered_share_management = true
     and s.status in ('active','trialing')
     and s.plan_id in (
       'founder_growth',
       'founder_scale',
       'founder_enterprise',
       'growth',
       'growth_annual'
     )
on conflict (user_id, feature) do nothing;

commit;

-- PostgREST schema cache reload hint (matches reseller migration convention):
-- notify pgrst, 'reload schema';
