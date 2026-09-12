-- 0344_schema_parity_repair.sql — release QA-2 P0 (2026-09-12)
--
-- Schema parity repair. `node scripts/db/migration-parity.mjs` found that a
-- number of migration files were never (or only partly) applied to production
-- because there was no ledger and migrations are applied by hand. Project
-- creation had been broken since ~2026-08-15 because 20260814_tech_analyses.sql
-- (which also adds projects.github_url) was never applied.
--
-- This file adds ONLY the missing objects, every statement guarded so it is
-- safe to re-run. It never drops, rewrites or backfills existing data.
--
-- Where the original file could not be applied as written, the reason is
-- noted inline and the object is created in the shape the code actually uses:
--   * FKs to auth.users(id) → public.app_users(id). This stack uses its own
--     app_users table for password auth; app_users ids are NOT in auth.users,
--     so an auth.users FK would reject every insert.
--   * `CREATE POLICY IF NOT EXISTS` is not valid Postgres → DO-guarded.
--   * exit_scenarios unique index `WHERE deleted_at IS NULL` referenced a
--     column that does not exist → NOT created (see parity-exceptions.json).
--
-- Files applied directly (already idempotent, not repeated here):
--   0041_unsubscribe_feedback.sql, 0103_credit_transactions_sandbox.sql,
--   20260816140000_investor_pack_shares.sql, 20260816200000_nurture_email_queue.sql,
--   20260816210000_feedback_credits.sql
--
-- Deliberately NOT repaired (see scripts/db/parity-exceptions.json):
--   0304 team_members org-chart columns (conflicts with the live 0023 shape),
--   20260816_clevel_reports_v2 calculate_trend_delta() (placeholder stub),
--   20260822_investor_portal_core.sql (17 tables, no runtime reader, no RLS).
--
-- Apply: scripts/db/apply-migration.sh supabase/migrations/0344_schema_parity_repair.sql

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Columns the app reads/writes that had no (applied) migration
-- ═══════════════════════════════════════════════════════════════════════════

-- projects.github_url — src/app/api/projects (create/update), founder tech
-- intelligence. Hand-added by QA on 2026-09-12 11:19 UTC; made formal here.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS github_url text;

-- app_users.onboarding_state — src/app/api/onboarding/save-progress writes
-- { step, state, updated_at } so a founder who bounces mid-flow can resume.
-- The route skips silently when the column is absent (42703), which is why
-- resume never worked in production.
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS onboarding_state jsonb;
COMMENT ON COLUMN public.app_users.onboarding_state IS
  'Resume-mid-flow onboarding snapshot { step, state, updated_at } written by /api/onboarding/save-progress.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 0025_svi_accounts_email_unique.sql — indexes only. The file also runs a
--    de-duplicating DELETE; production has 0 duplicate (email, project_id)
--    rows so the indexes build cleanly and the DELETE is not repeated here.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS svi_accounts_email_project_unique
  ON public.svi_accounts (email, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS svi_accounts_email_null_project_unique
  ON public.svi_accounts (email)
  WHERE project_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 0100_showcase_reviews.sql — the opportunistic FK to
--    data_room_access_tokens (target table now exists; 0 orphan rows).
--    The file itself cannot be re-run: its CREATE POLICY is unguarded.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'data_room_access_tokens')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conrelid = 'public.showcase_reviews'::regclass
                        AND conname = 'showcase_reviews_access_token_fk') THEN
    ALTER TABLE public.showcase_reviews
      ADD CONSTRAINT showcase_reviews_access_token_fk
      FOREIGN KEY (access_token_id)
      REFERENCES public.data_room_access_tokens(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. 20260814_tech_analyses.sql — Tech Intelligence (src/app/api/founder/
--    tech-analysis, src/lib/health-score.ts). user_id → app_users (see header).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tech_analyses (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id                 uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id                    uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  tech_score                 integer NOT NULL CHECK (tech_score >= 0 AND tech_score <= 100),
  svi_contribution           integer NOT NULL DEFAULT 0,
  valuation_multiplier_boost numeric(5,4) NOT NULL DEFAULT 0,
  website_url                text,
  github_url                 text,
  website_signals            jsonb,
  github_signals             jsonb,
  llm_assessment             jsonb,
  tech_maturity              integer,
  product_presence           integer,
  developer_activity         integer,
  scalability_score          integer,
  analysis_version           text NOT NULL DEFAULT '1.0',
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tech_analyses_startup_user UNIQUE (startup_id, user_id)
);
CREATE INDEX IF NOT EXISTS tech_analyses_startup_id_idx ON public.tech_analyses (startup_id);
CREATE INDEX IF NOT EXISTS tech_analyses_user_id_idx    ON public.tech_analyses (user_id);
CREATE INDEX IF NOT EXISTS tech_analyses_created_at_idx ON public.tech_analyses (created_at DESC);
ALTER TABLE public.tech_analyses ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tech_analyses' AND policyname='Users read own tech analyses') THEN
    CREATE POLICY "Users read own tech analyses" ON public.tech_analyses FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tech_analyses' AND policyname='Users write own tech analyses') THEN
    CREATE POLICY "Users write own tech analyses" ON public.tech_analyses FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tech_analyses' AND policyname='Users update own tech analyses') THEN
    CREATE POLICY "Users update own tech analyses" ON public.tech_analyses FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tech_analyses' AND policyname='Service role full access tech analyses') THEN
    CREATE POLICY "Service role full access tech analyses" ON public.tech_analyses FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;
ALTER TABLE public.svi_index_snapshots ADD COLUMN IF NOT EXISTS tech_score integer;
ALTER TABLE public.svi_index_snapshots ADD COLUMN IF NOT EXISTS tech_valuation_boost numeric(5,4);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. 20260816_clevel_reports_v2.sql — the two real helper functions.
--    calculate_trend_delta() is a placeholder stub and is NOT recreated.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_latest_clevel_report_by_role(
  p_project_id uuid,
  p_role varchar
)
RETURNS TABLE (
  report_id uuid,
  role varchar,
  scenario varchar,
  title text,
  generated_at timestamp,
  dcf_valuation_base bigint
) AS $$
  SELECT id, role, scenario, title, generated_at, dcf_valuation_base
  FROM public.clevel_reports_v2
  WHERE project_id = p_project_id
    AND role = p_role
  ORDER BY generated_at DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.get_12_week_trend(
  p_project_id uuid,
  p_role varchar,
  p_scenario varchar DEFAULT 'base'
)
RETURNS TABLE (
  week_number integer,
  snapshot_date date,
  svi_score decimal,
  arr_aud bigint,
  runway_months integer,
  dcf_valuation_base bigint,
  ltv_cac_ratio decimal,
  churn_rate_pct decimal
) AS $$
  SELECT week_number, snapshot_date, svi_score, arr_aud, runway_months, dcf_valuation_base, ltv_cac_ratio, churn_rate_pct
  FROM public.clevel_trend_snapshots
  WHERE project_id = p_project_id
    AND role = p_role
  ORDER BY snapshot_date DESC
  LIMIT 12;
$$ LANGUAGE sql STABLE;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. 20260816_competitive_positioning_feature.sql — everything after
--    competitor_features (which did land). The original positioning_statements
--    had `user_id REFERENCES auth.users` and a composite FK onto
--    projects(user_id, id) that has no unique index; both replaced with the
--    plain app_users / projects FKs used everywhere else.
--    Consumer: src/lib/competitive-positioning.ts.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.positioning_statements (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id                    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  statement                     text NOT NULL,
  category                      text,
  target_segment                text,
  unique_value_prop             text,
  competitor_context_anonymized jsonb,
  confidence_score              numeric(3,2),
  generated_by                  text DEFAULT 'ai',
  version_num                   integer DEFAULT 1,
  created_at                    timestamptz DEFAULT now(),
  updated_at                    timestamptz DEFAULT now(),
  CONSTRAINT positioning_statements_confidence_score_range CHECK (
    confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)
  )
);
CREATE INDEX IF NOT EXISTS idx_positioning_statements_user_project ON public.positioning_statements (user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_positioning_statements_created_at   ON public.positioning_statements (created_at DESC);
ALTER TABLE public.positioning_statements ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='positioning_statements' AND policyname='positioning_statements_select_own') THEN
    CREATE POLICY positioning_statements_select_own ON public.positioning_statements FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='positioning_statements' AND policyname='positioning_statements_insert_own') THEN
    CREATE POLICY positioning_statements_insert_own ON public.positioning_statements FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='positioning_statements' AND policyname='positioning_statements_update_own') THEN
    CREATE POLICY positioning_statements_update_own ON public.positioning_statements FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='positioning_statements' AND policyname='positioning_statements_delete_own') THEN
    CREATE POLICY positioning_statements_delete_own ON public.positioning_statements FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.competitor_analysis_metadata (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id         uuid NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  website_score         numeric(3,1),
  has_pricing_page      boolean,
  has_analytics_signals boolean,
  tech_stack            jsonb,
  tech_signals          jsonb,
  last_analyzed_at      timestamptz,
  analysis_method       text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  CONSTRAINT website_score_range CHECK (
    website_score IS NULL OR (website_score >= 0 AND website_score <= 100)
  )
);
CREATE INDEX IF NOT EXISTS idx_analysis_metadata_competitor_id   ON public.competitor_analysis_metadata (competitor_id);
CREATE INDEX IF NOT EXISTS idx_analysis_metadata_analysis_method ON public.competitor_analysis_metadata (analysis_method);
ALTER TABLE public.competitor_analysis_metadata ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='competitor_analysis_metadata' AND policyname='analysis_metadata_select_own') THEN
    CREATE POLICY analysis_metadata_select_own ON public.competitor_analysis_metadata FOR SELECT
      USING (competitor_id IN (SELECT id FROM public.competitors WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='competitor_analysis_metadata' AND policyname='analysis_metadata_insert_own') THEN
    CREATE POLICY analysis_metadata_insert_own ON public.competitor_analysis_metadata FOR INSERT
      WITH CHECK (competitor_id IN (SELECT id FROM public.competitors WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='competitor_analysis_metadata' AND policyname='analysis_metadata_update_own') THEN
    CREATE POLICY analysis_metadata_update_own ON public.competitor_analysis_metadata FOR UPDATE
      USING (competitor_id IN (SELECT id FROM public.competitors WHERE user_id = auth.uid()))
      WITH CHECK (competitor_id IN (SELECT id FROM public.competitors WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE OR REPLACE VIEW public.v_competitor_analysis AS
SELECT
  c.id, c.user_id, c.project_id, c.name, c.website, c.category, c.threat_level,
  COUNT(cf.id) AS features_count,
  SUM(CASE WHEN cf.has_founder_feature = true  THEN 1 ELSE 0 END)::int AS founder_features_match,
  SUM(CASE WHEN cf.has_founder_feature = false THEN 1 ELSE 0 END)::int AS founder_features_gap,
  cam.website_score, cam.has_pricing_page, cam.has_analytics_signals,
  cam.tech_stack, cam.tech_signals, cam.last_analyzed_at,
  c.created_at, c.updated_at
FROM public.competitors c
LEFT JOIN public.competitor_features cf ON c.id = cf.competitor_id
LEFT JOIN public.competitor_analysis_metadata cam ON c.id = cam.competitor_id
GROUP BY
  c.id, c.user_id, c.project_id, c.name, c.website, c.category, c.threat_level,
  cam.id, cam.website_score, cam.has_pricing_page, cam.has_analytics_signals,
  cam.tech_stack, cam.tech_signals, cam.last_analyzed_at, c.created_at, c.updated_at;

CREATE OR REPLACE FUNCTION public.compute_feature_parity_score(p_competitor_id uuid)
RETURNS numeric(5,2) AS $$
DECLARE
  v_total_features int;
  v_matching_features int;
BEGIN
  SELECT COUNT(*) INTO v_total_features FROM public.competitor_features WHERE competitor_id = p_competitor_id;
  IF v_total_features = 0 THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO v_matching_features FROM public.competitor_features
   WHERE competitor_id = p_competitor_id AND has_founder_feature = true;
  RETURN ROUND((v_matching_features::numeric / v_total_features::numeric) * 100, 2);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.compute_differentiation_score(p_competitor_id uuid)
RETURNS numeric(5,2) AS $$
DECLARE
  v_total_features int;
  v_founder_unique int;
BEGIN
  SELECT COUNT(*) INTO v_total_features FROM public.competitor_features WHERE competitor_id = p_competitor_id;
  IF v_total_features = 0 THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO v_founder_unique FROM public.competitor_features
   WHERE competitor_id = p_competitor_id AND has_founder_feature = true;
  RETURN ROUND((v_founder_unique::numeric / v_total_features::numeric) * 100, 2);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.update_competitor_features_updated_at()
RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION public.update_positioning_statements_updated_at()
RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION public.update_analysis_metadata_updated_at()
RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_competitor_features_updated_at ON public.competitor_features;
CREATE TRIGGER trg_competitor_features_updated_at
  BEFORE UPDATE ON public.competitor_features
  FOR EACH ROW EXECUTE FUNCTION public.update_competitor_features_updated_at();
DROP TRIGGER IF EXISTS trg_positioning_statements_updated_at ON public.positioning_statements;
CREATE TRIGGER trg_positioning_statements_updated_at
  BEFORE UPDATE ON public.positioning_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_positioning_statements_updated_at();
DROP TRIGGER IF EXISTS trg_analysis_metadata_updated_at ON public.competitor_analysis_metadata;
CREATE TRIGGER trg_analysis_metadata_updated_at
  BEFORE UPDATE ON public.competitor_analysis_metadata
  FOR EACH ROW EXECUTE FUNCTION public.update_analysis_metadata_updated_at();

GRANT SELECT ON public.v_competitor_analysis TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_feature_parity_score(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_differentiation_score(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. 20260816120000_checkout_session_reseller_commissions.sql — the file's
--    FKs point at auth.users; the webhook writes reseller_id = resellers.id
--    (from session.metadata) and founder_id = app_users.id, so the FKs are
--    corrected to the tables the ids actually come from.
--    Consumer: src/lib/reseller/checkout-commission.ts.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.checkout_session_reseller_commissions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id            uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  founder_id             uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  promo_code             text NOT NULL,
  stripe_session_id      text NOT NULL UNIQUE,
  gross_amount_aud_cents integer NOT NULL CHECK (gross_amount_aud_cents > 0),
  commission_aud_cents   integer NOT NULL CHECK (commission_aud_cents >= 0),
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS csrc_reseller_id_idx    ON public.checkout_session_reseller_commissions (reseller_id);
CREATE INDEX IF NOT EXISTS csrc_founder_id_idx     ON public.checkout_session_reseller_commissions (founder_id);
CREATE INDEX IF NOT EXISTS csrc_status_created_idx ON public.checkout_session_reseller_commissions (status, created_at);
COMMENT ON TABLE public.checkout_session_reseller_commissions IS
  'Lightweight commission ledger for checkout.session.completed attributions (M3). Keyed on stripe_session_id. Commission = 20% of ex-GST (gross / 1.1 * 0.2). Recurring renewal commissions flow through reseller_commissions (migration 0094).';
ALTER TABLE public.checkout_session_reseller_commissions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='checkout_session_reseller_commissions' AND policyname='service_role_full') THEN
    CREATE POLICY "service_role_full" ON public.checkout_session_reseller_commissions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. 0304_founder_core_features.sql — the three tables that never landed
--    (the file aborted on team_members_reports_to_idx because team_members
--    already existed with the 0023 shape). Consumers: src/lib/founder-features.ts,
--    src/app/api/founder/{gtm,pricing-tiers,roadmap}. set_updated_at() exists.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.gtm_strategies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_segment     text,
  problem_statement  text,
  value_prop         text,
  positioning        text,
  primary_channel    text,
  secondary_channels text[],
  sales_motion       text,
  price_anchor       text,
  launch_plan        text,
  north_star_metric  text,
  north_star_target  numeric,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);
CREATE INDEX IF NOT EXISTS gtm_strategies_user_idx    ON public.gtm_strategies (user_id);
CREATE INDEX IF NOT EXISTS gtm_strategies_project_idx ON public.gtm_strategies (project_id);
ALTER TABLE public.gtm_strategies ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.gtm_strategies IS 'One GTM canvas per project. Founder-owned, service-role writes only.';

CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name              text NOT NULL,
  model             text NOT NULL DEFAULT 'flat'
    CHECK (model IN ('freemium','flat','per_seat','usage','tiered','enterprise')),
  price_monthly_aud numeric,
  price_annual_aud  numeric,
  billing_note      text,
  features          text[] NOT NULL DEFAULT '{}',
  target_segment    text,
  cta_label         text,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pricing_tiers_project_idx ON public.pricing_tiers (project_id);
CREATE INDEX IF NOT EXISTS pricing_tiers_user_idx    ON public.pricing_tiers (user_id);
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.pricing_tiers IS 'Founder-owned SaaS pricing tiers (not BlockID platform pricing).';

CREATE TABLE IF NOT EXISTS public.roadmap_milestones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  quarter     text NOT NULL,
  title       text NOT NULL,
  description text,
  category    text,
  status      text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','in_progress','shipped','cancelled')),
  target_date date,
  owner       text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS roadmap_milestones_project_idx ON public.roadmap_milestones (project_id);
CREATE INDEX IF NOT EXISTS roadmap_milestones_quarter_idx ON public.roadmap_milestones (project_id, quarter);
ALTER TABLE public.roadmap_milestones ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.roadmap_milestones IS 'Founder-authored quarterly roadmap milestones. N rows per project.';

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gtm_strategies','pricing_tiers','roadmap_milestones'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t, t);
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. 20260825_exit_scenarios.sql — the file aborted on an index predicate
--    (`WHERE deleted_at IS NULL`, no such column) and on `CREATE POLICY IF NOT
--    EXISTS` (invalid syntax). exit_scenarios + 3 indexes had landed; the two
--    child tables had not. Consumers: src/lib/investor-pack/exit-strategy-
--    chapter.ts, src/lib/startup-package/svi-recompute.ts, api/exit-strategy.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.exit_scenarios ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exit_scenarios' AND policyname='exit_scenarios_owner_select') THEN
    CREATE POLICY exit_scenarios_owner_select ON public.exit_scenarios FOR SELECT USING (account_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exit_scenarios' AND policyname='exit_scenarios_owner_insert') THEN
    CREATE POLICY exit_scenarios_owner_insert ON public.exit_scenarios FOR INSERT WITH CHECK (account_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exit_scenarios' AND policyname='exit_scenarios_owner_update') THEN
    CREATE POLICY exit_scenarios_owner_update ON public.exit_scenarios FOR UPDATE USING (account_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exit_scenarios' AND policyname='exit_scenarios_owner_delete') THEN
    CREATE POLICY exit_scenarios_owner_delete ON public.exit_scenarios FOR DELETE USING (account_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exit_scenarios' AND policyname='exit_scenarios_service_select') THEN
    CREATE POLICY exit_scenarios_service_select ON public.exit_scenarios FOR SELECT USING (auth.role() = 'service_role');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.cap_table_projections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exit_scenario_id         uuid NOT NULL REFERENCES public.exit_scenarios(id) ON DELETE CASCADE,
  round_num                integer NOT NULL CHECK (round_num BETWEEN 0 AND 3),
  round_type               varchar(50) NOT NULL CHECK (round_type IN ('current_cap_table', 'series_a', 'series_b', 'exit')),
  round_year_relative      integer,
  round_size_aud           bigint,
  post_money_valuation_aud bigint,
  pre_money_valuation_aud  bigint,
  new_investor_name        varchar(255),
  founder_stake_pct_after  numeric(5,2) NOT NULL CHECK (founder_stake_pct_after BETWEEN 0 AND 100),
  investor_stake_pct       numeric(5,2) CHECK (investor_stake_pct BETWEEN 0 AND 100),
  esop_stake_pct           numeric(5,2) CHECK (esop_stake_pct BETWEEN 0 AND 100),
  total_shares_issued      bigint,
  founder_shares           bigint,
  investor_shares          bigint,
  created_at               timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cap_table_projections_scenario_id_idx ON public.cap_table_projections (exit_scenario_id);
CREATE INDEX IF NOT EXISTS cap_table_projections_round_idx       ON public.cap_table_projections (exit_scenario_id, round_num);
CREATE UNIQUE INDEX IF NOT EXISTS cap_table_projections_scenario_round_unique_idx ON public.cap_table_projections (exit_scenario_id, round_num);
ALTER TABLE public.cap_table_projections ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cap_table_projections' AND policyname='cap_table_projections_select') THEN
    CREATE POLICY cap_table_projections_select ON public.cap_table_projections FOR SELECT
      USING (exit_scenario_id IN (SELECT id FROM public.exit_scenarios WHERE account_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cap_table_projections' AND policyname='cap_table_projections_insert') THEN
    CREATE POLICY cap_table_projections_insert ON public.cap_table_projections FOR INSERT
      WITH CHECK (exit_scenario_id IN (SELECT id FROM public.exit_scenarios WHERE account_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cap_table_projections' AND policyname='cap_table_projections_update') THEN
    CREATE POLICY cap_table_projections_update ON public.cap_table_projections FOR UPDATE
      USING (exit_scenario_id IN (SELECT id FROM public.exit_scenarios WHERE account_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cap_table_projections' AND policyname='cap_table_projections_delete') THEN
    CREATE POLICY cap_table_projections_delete ON public.cap_table_projections FOR DELETE
      USING (exit_scenario_id IN (SELECT id FROM public.exit_scenarios WHERE account_id = auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.exit_readiness_assessments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exit_scenario_id        uuid NOT NULL UNIQUE REFERENCES public.exit_scenarios(id) ON DELETE CASCADE,
  product_maturity_score  integer CHECK (product_maturity_score BETWEEN 0 AND 100),
  revenue_scale_score     integer CHECK (revenue_scale_score BETWEEN 0 AND 100),
  team_stability_score    integer CHECK (team_stability_score BETWEEN 0 AND 100),
  market_fit_score        integer CHECK (market_fit_score BETWEEN 0 AND 100),
  overall_readiness_score integer CHECK (overall_readiness_score BETWEEN 0 AND 100),
  readiness_band          varchar(50) CHECK (readiness_band IN ('not_ready', 'developing', 'ready', 'exceptional')),
  critical_gaps           jsonb DEFAULT '[]',
  narrative               text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exit_readiness_assessments_scenario_id_idx ON public.exit_readiness_assessments (exit_scenario_id);
ALTER TABLE public.exit_readiness_assessments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exit_readiness_assessments' AND policyname='exit_readiness_assessments_select') THEN
    CREATE POLICY exit_readiness_assessments_select ON public.exit_readiness_assessments FOR SELECT
      USING (exit_scenario_id IN (SELECT id FROM public.exit_scenarios WHERE account_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exit_readiness_assessments' AND policyname='exit_readiness_assessments_insert') THEN
    CREATE POLICY exit_readiness_assessments_insert ON public.exit_readiness_assessments FOR INSERT
      WITH CHECK (exit_scenario_id IN (SELECT id FROM public.exit_scenarios WHERE account_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exit_readiness_assessments' AND policyname='exit_readiness_assessments_update') THEN
    CREATE POLICY exit_readiness_assessments_update ON public.exit_readiness_assessments FOR UPDATE
      USING (exit_scenario_id IN (SELECT id FROM public.exit_scenarios WHERE account_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exit_readiness_assessments' AND policyname='exit_readiness_assessments_delete') THEN
    CREATE POLICY exit_readiness_assessments_delete ON public.exit_readiness_assessments FOR DELETE
      USING (exit_scenario_id IN (SELECT id FROM public.exit_scenarios WHERE account_id = auth.uid()));
  END IF;
END $$;
GRANT ALL ON public.exit_scenarios, public.cap_table_projections, public.exit_readiness_assessments TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
