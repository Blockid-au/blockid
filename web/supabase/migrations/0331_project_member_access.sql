-- 0331_project_member_access.sql — S17-A project-level permissions
-- ---------------------------------------------------------------------------
-- Makes project membership real on the data layer:
--
--   1. Composite indexes that back the two new hot lookups in
--      web/src/lib/projects.ts:
--        • getAcceptedMemberships(user_id)  → (user_id, project_id) WHERE accepted
--        • getProject / assertProjectAccess → (project_id, user_id) WHERE accepted
--      0105 only had single-column indexes (project_id) and (user_id).
--
--   2. A SQL helper `public.project_role_for(project_id, user_id)` that returns
--      'owner' | 'admin' | 'editor' | 'viewer' | NULL — the same rank the app
--      uses — so any future RLS policy or SQL report can ask "what can this
--      user do on this project?" in one call.
--
--   3. A member-aware SELECT policy on `public.projects` (defense-in-depth).
--      Verified 2026-09-11: every read of projects / project_members /
--      svi_accounts / svi_analyses / svi_evidence / data_rooms /
--      funding_reports goes through the service-role client
--      (web/src/lib/supabase.ts → BYPASSRLS); the anon/browser clients
--      (lib/supabase/browser.ts, lib/supabase/server-anon.ts) only manage the
--      auth session cookie and never touch these tables. `projects` has had
--      RLS enabled with NO policies since 0020, so the policy below changes
--      nothing for today's traffic — it just means that if a surface is ever
--      moved to the anon key, an accepted member sees the shared project the
--      same way the owner does, matching 0105's "member reads own row".
--
-- Apply (NOT auto-applied on deploy — see memory/reference_db_migrations):
--   docker exec -i supabase-db psql -U postgres -d postgres \
--     -f /path/to/0331_project_member_access.sql
--   then: NOTIFY pgrst, 'reload schema';
--
-- Idempotent: IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS throughout.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. Indexes ----------------------------------------------------------------

-- "which projects is this user a member of" (listProjects / getActiveProject)
CREATE INDEX IF NOT EXISTS project_members_user_project_accepted_idx
  ON public.project_members (user_id, project_id)
  WHERE status = 'accepted' AND user_id IS NOT NULL;

-- "what is this user's role on this project" (getProject / assertProjectAccess)
CREATE INDEX IF NOT EXISTS project_members_project_user_accepted_idx
  ON public.project_members (project_id, user_id)
  WHERE status = 'accepted' AND user_id IS NOT NULL;

-- 2. Role helper --------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.project_role_for(p_project_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
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
  'Mirrors roleAtLeast() in web/src/lib/projects.ts.';

REVOKE ALL ON FUNCTION public.project_role_for(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.project_role_for(uuid, uuid) TO authenticated, service_role;

-- 3. Member-aware read policy on projects (defense-in-depth) -----------------

DROP POLICY IF EXISTS "owner or accepted member reads project" ON public.projects;
CREATE POLICY "owner or accepted member reads project" ON public.projects
  FOR SELECT USING (
    user_id = auth.uid()
    OR id IN (
      SELECT project_id FROM public.project_members
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
  );

COMMENT ON POLICY "owner or accepted member reads project" ON public.projects IS
  'S17-A: shared projects are readable by accepted members. Writes stay service-role only.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
