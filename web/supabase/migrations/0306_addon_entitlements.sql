-- 0306_addon_entitlements.sql
-- Make the `entitlements` table the runtime home for per-user add-on grants,
-- so the A$59/mo Equity add-on can actually be sold.
--
-- Context (2026-09-09):
--   `getEntitlements()` resolved features from a plan id alone. A founder who
--   bought the Equity add-on was charged A$59/month and granted nothing, so
--   the purchase path was deliberately suspended behind
--   ADDON_ENTITLEMENTS_WIRED in web/src/lib/stripe.ts. This migration gives
--   the runtime a place to record the grant.
--
-- The table already exists (0075) with exactly the right shape —
-- (user_id, feature) PK, allowed, source, granted_at, expires_at, detail,
-- FK to app_users ON DELETE CASCADE, owner-read + service-role RLS. It has
-- simply never had a reader. It now has one:
-- `web/src/lib/entitlements/user-grants.ts`.
--
-- Two changes:
--   1. `source` may now be 'addon'  — the 0075 CHECK allowed only
--      plan / override / grandfathered.
--   2. A partial index for the hot read path: "every live feature for one
--      user". The PK is (user_id, feature) so a user-only prefix scan already
--      works; the added index narrows it to allowed rows and lets the planner
--      skip revoked history.
--
-- ADDITIVE + IDEMPOTENT. No rows are written, deleted, or reinterpreted, so
-- no existing subscriber's access changes. The table is empty today
-- (select count(*) from entitlements => 0).
--
-- Supersedes 0302_drop_unused_entitlements_table.sql, which proposed dropping
-- this table for having no readers. That migration was never applied and has
-- been neutralised in the repo.
--
-- Rollback:
--   alter table entitlements drop constraint entitlements_source_check;
--   alter table entitlements add constraint entitlements_source_check
--     check (source in ('plan','override','grandfathered'));
--   drop index if exists entitlements_user_allowed_idx;

begin;

alter table entitlements
  drop constraint if exists entitlements_source_check;

alter table entitlements
  add constraint entitlements_source_check
  check (source in ('plan', 'override', 'grandfathered', 'addon'));

create index if not exists entitlements_user_allowed_idx
  on entitlements (user_id)
  where allowed = true;

comment on table entitlements is
  'Per-user feature grants layered ON TOP of the plan bundle. Read by '
  'web/src/lib/entitlements/user-grants.ts and unioned into getEntitlements(). '
  'Only allowed=true, non-expired rows widen access — a missing row never '
  'widens, and rows are never used to subtract a plan feature.';

comment on column entitlements.source is
  'plan | override | grandfathered | addon. ''addon'' rows are written by the '
  'Stripe webhook when a paid add-on subscription item is active, and deleted '
  'when it is cancelled, expires, or payment fails.';

comment on column entitlements.detail is
  'For source=''addon'': { addon, price_id, subscription_id, subscription_item_id }. '
  '`addon` is the add-on key so one add-on can be revoked without touching another.';

commit;

notify pgrst, 'reload schema';
