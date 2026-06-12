-- Startup Growth Phase Progress Tracking
-- Tracks completion of each of the 12 growth phases per project/account
-- Each phase has multiple steps (deliverables) that can be completed
-- Enables step-by-step guidance and progress visualization in reports

CREATE TABLE IF NOT EXISTS public.startup_phase_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.svi_accounts(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id text NOT NULL,          -- e.g. 'vision', 'customer_dev', 'revenue_model'
  phase_order integer NOT NULL,     -- 1-12
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'review', 'completed')),
  completion_pct integer NOT NULL DEFAULT 0
    CHECK (completion_pct >= 0 AND completion_pct <= 100),
  steps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Array of { id, title, completed, completedAt, notes, aiSuggestion }
  started_at timestamptz,
  completed_at timestamptz,
  ai_recommendations jsonb,        -- Latest AI-generated next-step suggestions
  last_updated_by text,            -- 'user' | 'ai_agent' | 'system'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, project_id, phase_id)
);

CREATE INDEX IF NOT EXISTS idx_phase_progress_account ON public.startup_phase_progress(account_id);
CREATE INDEX IF NOT EXISTS idx_phase_progress_project ON public.startup_phase_progress(project_id);
CREATE INDEX IF NOT EXISTS idx_phase_progress_status ON public.startup_phase_progress(status);

ALTER TABLE public.startup_phase_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own phase progress"
  ON public.startup_phase_progress FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM public.svi_accounts WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
    )
  );

CREATE POLICY "Users can update own phase progress"
  ON public.startup_phase_progress FOR UPDATE
  USING (
    account_id IN (
      SELECT id FROM public.svi_accounts WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
    )
  );

-- Add overall_phase_completion to svi_accounts for quick summary queries
ALTER TABLE public.svi_accounts
  ADD COLUMN IF NOT EXISTS growth_phase_current text DEFAULT 'vision',
  ADD COLUMN IF NOT EXISTS growth_completion_pct integer DEFAULT 0;

-- Add overall_phase_completion to projects for multi-project support
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS growth_phase_current text DEFAULT 'vision',
  ADD COLUMN IF NOT EXISTS growth_completion_pct integer DEFAULT 0;

NOTIFY pgrst, 'reload schema';
