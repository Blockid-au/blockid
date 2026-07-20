-- 0089 — ESOP grant tracker + Division 83A eligibility checks.
--
-- Distinct from the legacy `esop_grants` table referenced by
-- /api/esop/pool + /api/esop/score (which is scoped by esop_pool_id and
-- has no migration file). This table is scoped by (user_id, project_id)
-- and drives /workspace/esop/grants + the Division 83A checker
-- (AU Startup Concession, ITAA 1997 Subdivision 83A-B/C).
--
-- Table names are `esop_option_grants` / `esop_option_div83a_checks` to
-- avoid clobbering the legacy `esop_grants` schema in production.

CREATE TABLE IF NOT EXISTS public.esop_option_grants (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                UUID,
  user_id                   UUID NOT NULL,
  grantee_name              TEXT NOT NULL,
  grantee_email             TEXT,
  grant_date                DATE NOT NULL,
  shares_under_option       NUMERIC NOT NULL CHECK (shares_under_option > 0),
  strike_price_aud          NUMERIC NOT NULL DEFAULT 0 CHECK (strike_price_aud >= 0),
  vesting_years             INT NOT NULL DEFAULT 4 CHECK (vesting_years BETWEEN 1 AND 6),
  cliff_months              INT NOT NULL DEFAULT 12 CHECK (cliff_months BETWEEN 0 AND 24),
  status                    TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','exercised','lapsed','cancelled')),
  div83a_status             TEXT
    CHECK (div83a_status IS NULL OR div83a_status IN ('eligible','ineligible','unsure')),
  div83a_last_checked_at    TIMESTAMPTZ,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esop_option_grants_user
  ON public.esop_option_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_esop_option_grants_project
  ON public.esop_option_grants(project_id);
CREATE INDEX IF NOT EXISTS idx_esop_option_grants_status
  ON public.esop_option_grants(status);

ALTER TABLE public.esop_option_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS esop_option_grants_service_all ON public.esop_option_grants;
CREATE POLICY esop_option_grants_service_all ON public.esop_option_grants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS esop_option_grants_owner_select ON public.esop_option_grants;
CREATE POLICY esop_option_grants_owner_select ON public.esop_option_grants
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS esop_option_grants_owner_insert ON public.esop_option_grants;
CREATE POLICY esop_option_grants_owner_insert ON public.esop_option_grants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS esop_option_grants_owner_update ON public.esop_option_grants;
CREATE POLICY esop_option_grants_owner_update ON public.esop_option_grants
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.esop_option_div83a_checks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id      UUID NOT NULL REFERENCES public.esop_option_grants(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('eligible','ineligible','unsure')),
  criteria      JSONB NOT NULL DEFAULT '[]'::jsonb,
  guidance      TEXT,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esop_option_div83a_checks_grant_time
  ON public.esop_option_div83a_checks(grant_id, checked_at DESC);

ALTER TABLE public.esop_option_div83a_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS esop_option_div83a_checks_service_all ON public.esop_option_div83a_checks;
CREATE POLICY esop_option_div83a_checks_service_all ON public.esop_option_div83a_checks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS esop_option_div83a_checks_owner_select ON public.esop_option_div83a_checks;
CREATE POLICY esop_option_div83a_checks_owner_select ON public.esop_option_div83a_checks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.esop_option_grants g
      WHERE g.id = grant_id AND g.user_id = auth.uid()
    )
  );
