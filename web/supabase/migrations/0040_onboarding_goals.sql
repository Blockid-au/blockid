-- 0040: Add startup_goals array to app_users for onboarding goal capture
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS startup_goals TEXT[];
