-- Team members (per project)
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  role text NOT NULL DEFAULT 'founder', -- founder, cofounder, advisor, employee, investor
  equity_pct numeric(8,4) NOT NULL DEFAULT 0, -- e.g. 25.0000%
  vesting_months integer, -- total vesting period (e.g. 48)
  cliff_months integer, -- cliff period (e.g. 12)
  vesting_start_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_members_project ON public.team_members(project_id);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Equity events (grants, transfers, dilutions)
CREATE TABLE IF NOT EXISTS public.equity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  event_type text NOT NULL, -- 'grant', 'vest', 'transfer', 'dilution', 'exercise'
  equity_pct numeric(8,4) NOT NULL,
  description text,
  event_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equity_events_project ON public.equity_events(project_id, event_date DESC);
ALTER TABLE public.equity_events ENABLE ROW LEVEL SECURITY;
