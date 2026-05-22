-- Add password-based authentication support
-- Allows email + password login alongside Google OAuth and magic links

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Index for email lookups during password login
CREATE INDEX IF NOT EXISTS idx_app_users_email_lower
  ON public.app_users (lower(email));

COMMENT ON COLUMN public.app_users.password_hash IS
  'bcrypt hash of user password. NULL = password login not set (uses magic link or Google OAuth only).';
