-- 0302_drop_unused_entitlements_table.sql
-- Drop the unused `entitlements` table introduced by 0075.
--
-- Context (2026-08-06 ops audit):
--   - 0075 created `entitlements` as a materialised feature-grant table.
--   - 0098 did a one-time backfill INSERTing share_management grandfather rows.
--   - No runtime code ever reads from `entitlements`. Grep across web/src for
--     `.from('entitlements')` / `INSERT INTO entitlements` returns zero
--     production callers. `useEntitlement` uses a computed JSON payload, not
--     this table. Grandfather status is read from
--     `app_users.grandfathered_share_management` directly.
--   - The table is therefore write-only dead weight; the grandfather backfill
--     data lives redundantly on `app_users`.
--
-- DESTRUCTIVE. Safe because:
--   * No SELECT/UPDATE/DELETE against `entitlements` exists in the app.
--   * The grandfather flag is preserved on `app_users.grandfathered_share_management`.
--   * RLS policies and indexes drop together with the table (CASCADE not needed
--     since nothing FKs INTO entitlements; drop plain).
--
-- Rollback: re-run 0075's table + 0098's insert. Data can be reconstructed
-- from `app_users.grandfathered_share_management = true`.

begin;

drop table if exists entitlements;

commit;

-- notify pgrst, 'reload schema';
