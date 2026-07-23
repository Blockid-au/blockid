-- Migration 0105 — project_members (iteration-13 T4)
--
-- Q4 Multi-project #3: share a project with a co-founder/team member.
-- Adds per-project role membership (viewer|editor|admin) that layers on
-- top of the existing owner-only (projects.user_id = auth.uid()) model
-- without altering the owner-of-record.
--
-- Invite flow: the project owner creates a project_members row with a
-- one-time `token` (crypto-strong hex). The invitee opens
-- /invites/[token], authenticates, and POSTs to
-- /api/projects/members/accept — which flips status='invited' →
-- 'accepted', stamps user_id + accepted_at.
--
-- Applied via: docker exec supabase-db psql -U postgres -d postgres
--              -f 0105_project_members.sql
-- Then: NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_email    text NOT NULL,
  user_id       uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  role          text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','editor','admin')),
  status        text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','revoked')),
  invited_by    uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  invited_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  token         text NOT NULL UNIQUE,
  UNIQUE (project_id, user_email)
);

CREATE INDEX IF NOT EXISTS project_members_project_id_idx
  ON public.project_members (project_id);

CREATE INDEX IF NOT EXISTS project_members_user_id_idx
  ON public.project_members (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Owner reads all members of their projects.
DROP POLICY IF EXISTS "project owner reads members" ON public.project_members;
CREATE POLICY "project owner reads members" ON public.project_members
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- Accepted members read own row (lets a co-founder see "you have access to X").
DROP POLICY IF EXISTS "member reads own row" ON public.project_members;
CREATE POLICY "member reads own row" ON public.project_members
  FOR SELECT USING (user_id = auth.uid() AND status = 'accepted');

COMMENT ON TABLE public.project_members IS
  'Per-project team membership (viewer|editor|admin). Owner (projects.user_id) '
  'remains authoritative; this table adds shared collaborators. Writes flow '
  'through the service-role helpers in web/src/lib/project-members/scope.ts.';

COMMIT;

-- After apply:
--   NOTIFY pgrst, 'reload schema';
