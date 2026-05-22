-- Add onboarding columns to app_users
-- These track whether the user has completed the welcome wizard
-- and store their profile data from the onboarding form.

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS startup_name TEXT;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS startup_stage TEXT;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS industry TEXT;
