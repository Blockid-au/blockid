-- Prevent duplicate SVI accounts per email+project combination.
-- Migration 0020 dropped the original svi_accounts_email_key to support
-- multi-project, but left no protection against exact duplicates.

-- 1. Deduplicate any existing rows (keep the most recently active row).
DELETE FROM public.svi_accounts a
USING public.svi_accounts b
WHERE a.email = b.email
  AND COALESCE(a.project_id::text, '') = COALESCE(b.project_id::text, '')
  AND a.last_active_at < b.last_active_at;

-- 2. Composite unique: one svi_account per (email, project_id).
CREATE UNIQUE INDEX IF NOT EXISTS svi_accounts_email_project_unique
  ON public.svi_accounts (email, project_id);

-- 3. Partial unique: only one row per email when project_id is NULL (legacy).
CREATE UNIQUE INDEX IF NOT EXISTS svi_accounts_email_null_project_unique
  ON public.svi_accounts (email)
  WHERE project_id IS NULL;
