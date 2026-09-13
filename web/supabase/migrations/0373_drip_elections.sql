-- 0373_drip_elections.sql
-- ---------------------------------------------------------------------------
-- S28-A — dividend reinvestment plan (DRIP) elections.
--
-- Why
--   A shareholder may elect to have some or all of each dividend applied to
--   new shares instead of cash. The company keeps the election (who, what
--   percentage, since when, on what price basis) so that when distribution
--   statements are issued for a dividend (S25-B issue flow) the reinvested
--   amount, price and share count can be computed and recorded.
--
-- What
--   `drip_elections` — one ACTIVE row per (project, shareholder). Revoking
--   sets `revoked_at` (rows are never deleted — an allocation made under
--   the election still references it).
--
--     participation_pct  0–100 % of the shareholder's net cash dividend to
--                        reinvest.
--     price_basis        'share_price_mid' → the S26-B blended price per
--                        share (`computeSharePrice()` mid) at issue time;
--                        'manual' → `manual_price_aud` (the price the
--                        directors set under the plan rules).
--     user_id            the caller who recorded the election — provenance
--                        only, NO foreign key to app_users (same stance as
--                        0350 / 0372; the project FK governs the row's life).
--
-- RLS
--   Enabled. Owner may SELECT their project's elections; every write goes
--   through the service role from the elections routes (editor+).
--
-- Apply (self-hosted Supabase; migrations are NOT applied on deploy):
--   scripts/db/apply-migration.sh web/supabase/migrations/0373_drip_elections.sql
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.drip_elections (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID          NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id            UUID          NOT NULL,
  shareholder_id     UUID          NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,
  participation_pct  NUMERIC(5,2)  NOT NULL CHECK (participation_pct >= 0 AND participation_pct <= 100),
  price_basis        TEXT          NOT NULL DEFAULT 'share_price_mid'
                                   CHECK (price_basis IN ('share_price_mid', 'manual')),
  manual_price_aud   NUMERIC(14,6) CHECK (manual_price_aud IS NULL OR manual_price_aud > 0),
  elected_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT drip_elections_manual_price
    CHECK (price_basis <> 'manual' OR manual_price_aud IS NOT NULL)
);

-- One ACTIVE election per (project, shareholder); a revoked row frees the slot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_drip_elections_active
  ON public.drip_elections (project_id, shareholder_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drip_elections_project
  ON public.drip_elections (project_id, elected_at DESC);

ALTER TABLE public.drip_elections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drip_elections_owner_select ON public.drip_elections;
CREATE POLICY drip_elections_owner_select ON public.drip_elections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = drip_elections.project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS drip_elections_service_all ON public.drip_elections;
CREATE POLICY drip_elections_service_all ON public.drip_elections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.drip_elections IS
  'S28-A: dividend reinvestment plan elections — one active row per (project, shareholder); revoked rows kept (allocations reference them); written only by service-role routes.';
COMMENT ON COLUMN public.drip_elections.participation_pct IS
  '0–100: share of the net cash dividend applied to new shares.';
COMMENT ON COLUMN public.drip_elections.price_basis IS
  'share_price_mid = S26-B blended price per share (mid) at issue; manual = manual_price_aud.';
COMMENT ON COLUMN public.drip_elections.user_id IS
  'Recorder (owner or accepted editor/admin member). No FK on purpose; see header.';

NOTIFY pgrst, 'reload schema';
