-- 0332_project_role_for_self_only.sql — S17-A review P2-4
-- ---------------------------------------------------------------------------
-- `public.project_role_for(project_id, user_id)` (0331) is SECURITY DEFINER
-- and granted to `authenticated`, so ANY signed-in Supabase user could probe
-- "what role does user X hold on project Y?" for arbitrary UUID pairs — a
-- membership oracle. The app never calls it with the anon key (every read
-- goes through the service-role client), so it was inert, but the grant was
-- wider than needed.
--
-- Fix: the function now answers only for the CALLER's own user id when
-- invoked under an end-user JWT. `service_role` (auth.uid() IS NULL, role
-- claim 'service_role') keeps full access so cron / SQL reports still work.
-- Any other (project, user) probe returns NULL — indistinguishable from
-- "not a member", so nothing leaks.
--
-- The `projects` SELECT policy from 0331 does not call this function (it
-- inlines the owner / accepted-member check with auth.uid()), so it is
-- untouched and keeps working for both owners and accepted members.
--
-- Apply (NOT auto-applied on deploy — see memory/reference_db_migrations):
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     -f /path/to/0332_project_role_for_self_only.sql
--   then: NOTIFY pgrst, 'reload schema';
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT are safe to re-run.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION public.project_role_for(p_project_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- P2-4: an end-user JWT may only ask about itself. service_role has no
    -- auth.uid() and a 'service_role' role claim, so it is exempt.
    WHEN auth.role() IS DISTINCT FROM 'service_role'
         AND p_user_id IS DISTINCT FROM auth.uid()
      THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = p_project_id AND p.user_id = p_user_id
    ) THEN 'owner'
    ELSE (
      SELECT m.role
      FROM public.project_members m
      WHERE m.project_id = p_project_id
        AND m.user_id = p_user_id
        AND m.status = 'accepted'
      LIMIT 1
    )
  END;
$$;

COMMENT ON FUNCTION public.project_role_for(uuid, uuid) IS
  'S17-A: owner | admin | editor | viewer | NULL for (project, user). Owner outranks admin. '
  'Mirrors roleAtLeast() in web/src/lib/projects.ts. '
  'P2-4: under an end-user JWT answers only for p_user_id = auth.uid(); service_role unrestricted.';

REVOKE ALL ON FUNCTION public.project_role_for(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.project_role_for(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_role_for(uuid, uuid) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
