-- Accelerator cohort management tables
-- Enables program managers to track cohort SVI progress

CREATE TABLE IF NOT EXISTS public.accelerator_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  organization text,
  manager_email text NOT NULL,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cohort_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.accelerator_cohorts(id) ON DELETE CASCADE,
  email text NOT NULL,
  startup_name text,
  svi_account_id uuid REFERENCES public.svi_accounts(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cohort_id, email)
);

CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort ON public.cohort_members(cohort_id);
ALTER TABLE public.accelerator_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_members ENABLE ROW LEVEL SECURITY;
