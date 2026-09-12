-- Migration 0340 — webhook secret columns + atomic failure counting
-- (S20-B security review, 2026-09-12; follows 0336_webhooks.sql)
--
-- P2-1  `webhook_endpoints_owner_select` (0336) lets an authenticated owner
--       SELECT every column of their rows through PostgREST — including
--       `secret_hash` and `secret_enc`. The app never reads these tables
--       with a user JWT (all reads go through the admin client + the
--       /api/webhooks routes, which strip both columns), but the browser
--       Supabase client exists, so the "secret never leaves the server"
--       claim only held for the API path. Column-level REVOKE closes it:
--       the RLS policy still applies, the two columns are simply not
--       selectable by `anon` / `authenticated` (a `select *` now errors
--       with 42501 for those roles; the service role is unaffected).
--
-- P2-2  `failure_count` was read at tick start and written back as
--       `count + 1` (dispatch.ts recordOutcome) — two overlapping ticks
--       (50 × 8 s > the 5 min period) lose increments, and a user's
--       PATCH { active: true } racing a tick holding count 19 gets written
--       back to 20 and re-disabled. Both RPCs below make the bookkeeping
--       one statement under a row lock:
--
--         webhook_endpoint_record_failure(p_id)
--           → failure_count + 1, last_failure_at = now(); when the new
--             count reaches 20 and the row was active it flips
--             active=false / disabled_reason='auto_disabled:20_consecutive_failures'.
--             Returns (failure_count, active, disabled) — `disabled` is
--             true ONLY for the call that flipped the row, so the caller
--             writes exactly one notification.
--         webhook_endpoint_record_success(p_id)
--           → failure_count = 0, last_success_at = now().
--
--       Both are SECURITY DEFINER and executable by the service role only.
--       The dispatcher falls back to the pre-0340 read-modify-write path
--       when the functions are missing (42883 / PGRST202), so the code
--       may deploy before this file is applied. Default batch lowered to
--       25/tick in the same change.
--
-- Applied via: docker exec -i supabase-db psql -U postgres -d postgres
--              < web/supabase/migrations/0340_webhook_secret_columns.sql
-- Then:        docker exec supabase-db psql -U postgres -d postgres
--              -c "NOTIFY pgrst, 'reload schema';"

begin;

-- ── P2-1: secret columns are never readable through PostgREST ─────────────

revoke select (secret_hash, secret_enc) on public.webhook_endpoints from anon, authenticated;

comment on column public.webhook_endpoints.secret_hash is
  'sha256(secret). Not selectable by anon/authenticated (0340) — server only.';
comment on column public.webhook_endpoints.secret_enc is
  'AES-256-GCM sealed signing secret (WEBHOOK_SECRET_KEY). Not selectable by anon/authenticated (0340) — server only.';

-- ── P2-2: atomic consecutive-failure bookkeeping ──────────────────────────

create or replace function public.webhook_endpoint_record_failure(p_id uuid)
returns table (failure_count integer, active boolean, disabled boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max        constant integer := 20;
  v_reason     constant text := 'auto_disabled:20_consecutive_failures';
  v_was_active boolean;
  v_count      integer;
  v_active     boolean;
begin
  -- Row lock: overlapping ticks queue here and each sees the latest count.
  select e.active into v_was_active
    from public.webhook_endpoints e
   where e.id = p_id
     for update;
  if not found then
    return;
  end if;

  update public.webhook_endpoints e
     set failure_count   = e.failure_count + 1,
         last_failure_at = now(),
         active          = e.active and (e.failure_count + 1) < v_max,
         disabled_reason = case
                             when e.active and (e.failure_count + 1) >= v_max then v_reason
                             else e.disabled_reason
                           end
   where e.id = p_id
   returning e.failure_count, e.active into v_count, v_active;

  return query select v_count, v_active, (v_was_active and not v_active);
end
$$;

create or replace function public.webhook_endpoint_record_success(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.webhook_endpoints
     set failure_count   = 0,
         last_success_at = now()
   where id = p_id;
$$;

revoke all on function public.webhook_endpoint_record_failure(uuid) from public, anon, authenticated;
revoke all on function public.webhook_endpoint_record_success(uuid) from public, anon, authenticated;
grant execute on function public.webhook_endpoint_record_failure(uuid) to service_role;
grant execute on function public.webhook_endpoint_record_success(uuid) to service_role;

comment on function public.webhook_endpoint_record_failure(uuid) is
  'S20-B (0340): failure_count + 1 under a row lock; auto-disables at 20 and reports whether THIS call flipped the endpoint. Service role only.';
comment on function public.webhook_endpoint_record_success(uuid) is
  'S20-B (0340): failure_count = 0 + last_success_at. Service role only.';

commit;

notify pgrst, 'reload schema';
