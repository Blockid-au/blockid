-- 0123_data_rooms_one_per_project.sql
-- ---------------------------------------------------------------------------
-- One data room per (user, project), so generating can upsert instead of
-- accumulating duplicates.
--
-- Why
--   POST /api/data-room/generate charged 3 credits, built the room, returned it
--   as JSON and wrote nothing. A refresh meant the founder had paid for a
--   result that no longer existed. The route now persists to `data_rooms`,
--   which needs a conflict target to upsert against — without one, every
--   regeneration would insert another row.
--
--   NULLS NOT DISTINCT so a null project_id cannot smuggle duplicates past the
--   constraint (Postgres treats NULLs as distinct by default). No existing rows
--   violate this: 2 rows, both with a project_id, no duplicate pairs.
--
-- Apply as the table owner: `data_rooms` is owned by supabase_admin, not
-- postgres, so `docker exec -i supabase-db psql -U supabase_admin -d postgres`
-- (the -U postgres form used for most migrations fails with "must be owner").
--
-- Idempotent: `if not exists`, safe to re-run.
-- ---------------------------------------------------------------------------

create unique index if not exists data_rooms_user_project_uidx
  on data_rooms (user_id, project_id) nulls not distinct;

notify pgrst, 'reload schema';
