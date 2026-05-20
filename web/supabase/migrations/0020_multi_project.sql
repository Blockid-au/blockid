-- Multi-Project System: Enable users to manage multiple startup projects
-- within one account. Each project gets independent SVI scoring, evidence,
-- and tracking. Credits remain shared (one wallet per user).

-- 1. Projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  industry text,
  stage integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 2. Add project_id to related tables (nullable for backward compat)
ALTER TABLE public.svi_accounts ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.svi_analyses ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.usage_logs ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- 3. Relax svi_accounts unique constraint (allow multiple per email)
ALTER TABLE public.svi_accounts DROP CONSTRAINT IF EXISTS svi_accounts_email_key;

-- 4. Data migration: Create default project for every existing user
INSERT INTO public.projects (user_id, name, slug, is_default)
SELECT u.id, COALESCE(a.startup_name, 'My Startup'), 'default', true
FROM public.app_users u
LEFT JOIN public.svi_accounts a ON a.email = u.email
WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.user_id = u.id)
ON CONFLICT DO NOTHING;

-- 5. Backfill project_id on existing data
UPDATE public.svi_accounts sa SET project_id = (
  SELECT p.id FROM public.projects p
  JOIN public.app_users u ON p.user_id = u.id
  WHERE u.email = sa.email AND p.is_default = true LIMIT 1
) WHERE sa.project_id IS NULL;

UPDATE public.svi_analyses sa SET project_id = (
  SELECT p.id FROM public.projects p
  JOIN public.app_users u ON p.user_id = u.id
  WHERE u.email = sa.email AND p.is_default = true LIMIT 1
) WHERE sa.project_id IS NULL;
