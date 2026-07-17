-- 0081_lifecycle_rpc.sql (H-code-1 / M-code-8 hardening)
--
-- Close the double-send race in the lifecycle mailer. Prior state:
-- loadDue() was a plain SELECT and advance() was a read → append → upsert
-- dance. Two overlapping cron ticks could pick the same row and mail
-- twice; two concurrent advance() calls could clobber each other's
-- history append.
--
-- This migration introduces two SECURITY-DEFINER RPCs:
--   * pick_lifecycle_due(limit)       — atomic pick + reserve using
--                                        FOR UPDATE SKIP LOCKED inside a
--                                        CTE; sets next_send_at = NULL
--                                        in the same tx so no other
--                                        worker can see the row again.
--   * advance_lifecycle(user, from,
--                       next, at)     — appends history + sets next step
--                                        in a single UPDATE statement.
--
-- Additive-only + idempotent: re-applying this file is a no-op (functions
-- are `create or replace`, index uses `if not exists`).

-- Partial index — speeds up the pick and covers the FOR UPDATE lookup
-- with the same predicate the RPC uses.
create index if not exists lifecycle_state_due_idx
  on lifecycle_state (next_send_at)
  where next_send_at is not null
    and current_step is distinct from 'done';

-- Atomic pick: reserve rows so concurrent workers can't grab the same one.
create or replace function pick_lifecycle_due(p_limit int default 100)
returns table(
  user_id      uuid,
  current_step text,
  history      jsonb,
  updated_at   timestamptz
) as $$
  with picked as (
    select ls.user_id
      from lifecycle_state ls
     where ls.next_send_at is not null
       and ls.next_send_at <= now()
       and ls.current_step is distinct from 'done'
     order by ls.next_send_at
     limit p_limit
     for update skip locked
  )
  update lifecycle_state ls
     set next_send_at = null,
         updated_at   = now()
    from picked
   where ls.user_id = picked.user_id
   returning ls.user_id, ls.current_step, ls.history, ls.updated_at;
$$ language sql security definer;

-- Atomic advance: append history + set next step in a single statement.
create or replace function advance_lifecycle(
  p_user         uuid,
  p_from         text,
  p_next         text,
  p_next_send_at timestamptz
)
returns text as $$
  update lifecycle_state
     set current_step = p_next,
         next_send_at = p_next_send_at,
         updated_at   = now(),
         history      = coalesce(history, '[]'::jsonb)
                        || jsonb_build_object('step', p_from, 'ts', now())
   where user_id = p_user
   returning current_step;
$$ language sql security definer;

grant execute on function pick_lifecycle_due(int)       to service_role, authenticated;
grant execute on function advance_lifecycle(uuid, text, text, timestamptz) to service_role;

notify pgrst, 'reload schema';
