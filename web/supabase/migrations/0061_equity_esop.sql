-- T0094 — Equity & ESOP Engine (BlockID Pillar #2)
--
-- Per-startup, AU-native equity planning + ESOP management. Stored as
-- permanent institutional memory in BlockID.
--
-- Naming note: `equity_vesting_schedules` / `equity_vesting_events` use the
-- `equity_` prefix to avoid colliding with the legacy `vesting_schedules`
-- table (0032) which belongs to the cap-table module.

-- Equity plan per startup (one per startup profile)
CREATE TABLE IF NOT EXISTS public.equity_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  startup_name TEXT NOT NULL,
  total_shares BIGINT NOT NULL DEFAULT 10000000,
  pre_money_valuation NUMERIC(15,2),
  incorporation_date DATE,
  jurisdiction TEXT DEFAULT 'AU',
  share_classes JSONB DEFAULT '[{"name":"Ordinary","votes_per_share":1,"liquidation_preference":1}]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.equity_plans ENABLE ROW LEVEL SECURITY;

-- Members: founders, employees, advisors, investors, option holders
CREATE TABLE IF NOT EXISTS public.equity_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equity_plan_id UUID REFERENCES public.equity_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('founder','cofounder','employee','advisor','investor','option_holder')),
  share_class TEXT NOT NULL DEFAULT 'Ordinary',
  shares_issued BIGINT DEFAULT 0,
  options_granted BIGINT DEFAULT 0,
  join_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.equity_members ENABLE ROW LEVEL SECURITY;

-- ESOP pool configuration
CREATE TABLE IF NOT EXISTS public.esop_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equity_plan_id UUID REFERENCES public.equity_plans(id) ON DELETE CASCADE,
  pool_size_shares BIGINT NOT NULL,
  pool_size_percent NUMERIC(5,2),
  scheme_type TEXT DEFAULT 'ESS' CHECK (scheme_type IN ('ESS','ESOP','SAR','phantom','direct')),
  au_tax_concession BOOLEAN DEFAULT true, -- ESIC / Division 83A ESS concession
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.esop_pools ENABLE ROW LEVEL SECURITY;

-- Vesting schedules (per member). Prefixed to avoid collision with
-- the legacy `vesting_schedules` table from migration 0032.
CREATE TABLE IF NOT EXISTS public.equity_vesting_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equity_plan_id UUID REFERENCES public.equity_plans(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.equity_members(id) ON DELETE CASCADE,
  total_shares BIGINT NOT NULL,
  cliff_months INTEGER NOT NULL DEFAULT 12,
  vest_months INTEGER NOT NULL DEFAULT 48,
  schedule_type TEXT DEFAULT 'monthly' CHECK (schedule_type IN ('monthly','quarterly','annual','milestone')),
  start_date DATE NOT NULL,
  accelerate_on_exit BOOLEAN DEFAULT false,
  milestones JSONB DEFAULT '[]', -- [{description, shares, achieved_at}]
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.equity_vesting_schedules ENABLE ROW LEVEL SECURITY;

-- Calculated vesting events (generated, not manually entered)
CREATE TABLE IF NOT EXISTS public.equity_vesting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vesting_schedule_id UUID REFERENCES public.equity_vesting_schedules(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  shares_vested BIGINT NOT NULL,
  cumulative_vested BIGINT NOT NULL,
  is_cliff BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.equity_vesting_events ENABLE ROW LEVEL SECURITY;

-- Document templates generated from equity data
CREATE TABLE IF NOT EXISTS public.equity_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equity_plan_id UUID REFERENCES public.equity_plans(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.equity_members(id),
  document_type TEXT NOT NULL CHECK (document_type IN ('esop_grant','vesting_agreement','cap_table_summary','shareholder_register','founders_agreement')),
  content_md TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.equity_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_equity_plans_user ON public.equity_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_equity_members_plan ON public.equity_members(equity_plan_id);
CREATE INDEX IF NOT EXISTS idx_equity_vesting_schedules_member ON public.equity_vesting_schedules(member_id);
CREATE INDEX IF NOT EXISTS idx_equity_vesting_events_schedule ON public.equity_vesting_events(vesting_schedule_id);
CREATE INDEX IF NOT EXISTS idx_esop_pools_plan ON public.esop_pools(equity_plan_id);
CREATE INDEX IF NOT EXISTS idx_equity_documents_plan ON public.equity_documents(equity_plan_id);

-- RLS policies: plan owner sees everything in their plan
DROP POLICY IF EXISTS equity_plans_owner ON public.equity_plans;
CREATE POLICY equity_plans_owner ON public.equity_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS equity_members_owner ON public.equity_members;
CREATE POLICY equity_members_owner ON public.equity_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.equity_plans p WHERE p.id = equity_plan_id AND p.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.equity_plans p WHERE p.id = equity_plan_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS esop_pools_owner ON public.esop_pools;
CREATE POLICY esop_pools_owner ON public.esop_pools
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.equity_plans p WHERE p.id = equity_plan_id AND p.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.equity_plans p WHERE p.id = equity_plan_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS equity_vesting_schedules_owner ON public.equity_vesting_schedules;
CREATE POLICY equity_vesting_schedules_owner ON public.equity_vesting_schedules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.equity_plans p WHERE p.id = equity_plan_id AND p.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.equity_plans p WHERE p.id = equity_plan_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS equity_vesting_events_owner ON public.equity_vesting_events;
CREATE POLICY equity_vesting_events_owner ON public.equity_vesting_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.equity_vesting_schedules s
      JOIN public.equity_plans p ON p.id = s.equity_plan_id
      WHERE s.id = vesting_schedule_id AND p.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.equity_vesting_schedules s
      JOIN public.equity_plans p ON p.id = s.equity_plan_id
      WHERE s.id = vesting_schedule_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS equity_documents_owner ON public.equity_documents;
CREATE POLICY equity_documents_owner ON public.equity_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.equity_plans p WHERE p.id = equity_plan_id AND p.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.equity_plans p WHERE p.id = equity_plan_id AND p.user_id = auth.uid())
  );
