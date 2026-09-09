-- 0302_drop_unused_entitlements_table.sql
-- SUPERSEDED 2026-09-09 — NO-OP. DO NOT RESTORE THE DROP.
--
-- This migration proposed `drop table if exists entitlements` on the grounds
-- that the table had no runtime readers. That was true at the time and is no
-- longer true.
--
-- It was never applied (the table is still present in production). Running it
-- now would delete every per-user add-on grant, silently stripping ESOP,
-- vesting and on-chain access from founders paying A$59/month for it — the
-- table is the runtime store for those grants as of
-- 0306_addon_entitlements.sql, read by
-- web/src/lib/entitlements/user-grants.ts and unioned into getEntitlements().
--
-- The body is left as an intentional no-op rather than deleted so the
-- migration sequence stays contiguous and anyone replaying the folder in
-- order lands on this explanation instead of a missing file.

begin;

-- Deliberately empty. See 0306_addon_entitlements.sql.

commit;
