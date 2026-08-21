-- Investor Portal Core (StartupValueIndex.com bilingual investor intelligence)
-- Adds the tables from master-prompt §61 that don't already exist in BlockID.
-- Reuses: companies/public_business_profiles, cap_table, evidence, valuations,
--         svi_analyses, clevel_reports_v2, dataroom_*, watchlist.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. investor_organisations + investor_mandates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investor_organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('vc','angel','family_office','cvc','accelerator','government','institutional')),
  home_country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investor_organisation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES investor_organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'investor_viewer','investor_analyst','investment_manager','investment_partner',
    'ic_member','fund_admin','accelerator_analyst','institutional_admin'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE TABLE IF NOT EXISTS investor_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES investor_organisations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sectors_include TEXT[] DEFAULT '{}',
  sectors_exclude TEXT[] DEFAULT '{}',
  geographies TEXT[] DEFAULT '{}',
  stages TEXT[] DEFAULT '{}',
  cheque_min_aud NUMERIC(14,2),
  cheque_max_aud NUMERIC(14,2),
  ownership_target_pct NUMERIC(5,2),
  revenue_min_aud NUMERIC(14,2),
  growth_min_pct NUMERIC(5,2),
  risk_tolerance TEXT CHECK (risk_tolerance IN ('low','medium','high')),
  esg_constraints TEXT[] DEFAULT '{}',
  lead_or_follow TEXT CHECK (lead_or_follow IN ('lead','follow','both')),
  followon_reserve_pct NUMERIC(5,2),
  weights JSONB DEFAULT '{}'::jsonb,  -- master-prompt §5.2 configurable weights
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Claims + verdicts + evidence links  (master-prompt §14, §15)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  claim_text TEXT NOT NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN (
    'market','product','technology','traction','customer','revenue','growth',
    'financial','team','ip','legal','regulatory','competition','partnership','esg','valuation'
  )),
  materiality TEXT NOT NULL CHECK (materiality IN ('low','medium','high','critical')),
  founder_source_id UUID,  -- references evidence(id) if founder-supplied
  extracted_from_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claims_company ON claims(company_id);
CREATE INDEX IF NOT EXISTS idx_claims_materiality ON claims(materiality);

CREATE TABLE IF NOT EXISTS claim_verdicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN (
    'VERIFIED','SUPPORTED','PARTIALLY_SUPPORTED','UNVERIFIED',
    'CONTRADICTED','OUTDATED','INSUFFICIENT_DATA'
  )),
  confidence NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  analysis_summary_en TEXT NOT NULL,
  analysis_summary_vi TEXT NOT NULL,
  supporting_evidence_ids UUID[] DEFAULT '{}',
  contradictory_evidence_ids UUID[] DEFAULT '{}',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_check_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES claim_verdicts(id)
);
CREATE INDEX IF NOT EXISTS idx_claim_verdicts_claim ON claim_verdicts(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_verdicts_verdict ON claim_verdicts(verdict);

-- ---------------------------------------------------------------------------
-- 3. Four separated signals — investor_score, confidence_score, mandate_fit
--     (SVI already lives in svi_analyses/svi_snapshot_dimensions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investor_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  dimensions JSONB NOT NULL,           -- 11 dims from master-prompt §5.2
  weights_preset TEXT NOT NULL DEFAULT 'seed_default',
  weights JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_investor_scores_company ON investor_scores(company_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS confidence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  coverage JSONB NOT NULL,             -- master-prompt §5.3 coverage breakdown
  source_count INT NOT NULL DEFAULT 0,
  contradiction_count INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_confidence_scores_company ON confidence_scores(company_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS mandate_fit_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  mandate_id UUID NOT NULL REFERENCES investor_mandates(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, mandate_id)
);

-- ---------------------------------------------------------------------------
-- 4. Risk items (master-prompt §44) — cross-cutting, per company
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'market','product','execution','financial','funding','customer_concentration',
    'competition','technical','cybersecurity','legal','regulatory','ip','governance',
    'cap_table','founder_key_person','integrity_evidence','valuation','exit_liquidity'
  )),
  title_en TEXT NOT NULL,
  title_vi TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  likelihood TEXT NOT NULL CHECK (likelihood IN ('rare','unlikely','possible','likely','almost_certain')),
  materiality TEXT NOT NULL CHECK (materiality IN ('low','medium','high','critical')),
  evidence_ids UUID[] DEFAULT '{}',
  impact_en TEXT NOT NULL,
  impact_vi TEXT NOT NULL,
  mitigation_en TEXT NOT NULL,
  mitigation_vi TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','monitoring','mitigated','accepted')),
  owner_id UUID,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_risk_items_company ON risk_items(company_id);
CREATE INDEX IF NOT EXISTS idx_risk_items_severity ON risk_items(severity);

-- ---------------------------------------------------------------------------
-- 5. Investment theses + tracking (master-prompt §48)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investment_theses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  org_id UUID REFERENCES investor_organisations(id) ON DELETE CASCADE,
  thesis_points JSONB NOT NULL DEFAULT '[]'::jsonb,       -- [{summary_en, summary_vi, evidence_ids}]
  anti_thesis_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  kill_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investment_thesis_drift (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES investment_theses(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('strengthening','stable','weakening','materially_broken')),
  summary_en TEXT NOT NULL,
  summary_vi TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. DD projects + items (master-prompt §41)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dd_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  org_id UUID REFERENCES investor_organisations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dd_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES dd_projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'commercial','market','customer','product','technical','financial','tax',
    'legal','regulatory','ip','team','governance','cap_table','cybersecurity','esg'
  )),
  question_en TEXT NOT NULL,
  question_vi TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','requested','received','reviewing','resolved','waived')),
  owner_id UUID,
  founder_response TEXT,
  evidence_ids UUID[] DEFAULT '{}',
  analyst_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dd_items_project ON dd_items(project_id, priority);

-- ---------------------------------------------------------------------------
-- 7. IC reports (master-prompt §55)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  org_id UUID REFERENCES investor_organisations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('one_page','memo')),
  version INT NOT NULL DEFAULT 1,
  markdown_en TEXT,
  markdown_vi TEXT,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_cutoff TIMESTAMPTZ,
  evidence_count INT DEFAULT 0,
  confidence NUMERIC(5,2),
  generated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 8. Portfolios + alerts (master-prompt §50, §51)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES investor_organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  invested_amount_aud NUMERIC(14,2),
  instrument TEXT,
  entry_valuation_aud NUMERIC(14,2),
  entry_ownership_pct NUMERIC(5,2),
  invested_at TIMESTAMPTZ,
  UNIQUE(portfolio_id, company_id)
);

CREATE TABLE IF NOT EXISTS portfolio_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','critical')),
  summary_en TEXT NOT NULL,
  summary_vi TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  seen_by UUID[] DEFAULT '{}',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_alerts_recent ON portfolio_alerts(portfolio_id, observed_at DESC);

-- ---------------------------------------------------------------------------
-- 9. Sixteen answers cache — quick-load for company Overview
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sixteen_answers (
  company_id UUID PRIMARY KEY,
  run_id UUID,
  answers JSONB NOT NULL,              -- SixteenAnswers shape from decision/types.ts
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 10. Investor Decision snapshot — /company/[slug] top-of-page payload
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investor_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
  workflow_status TEXT NOT NULL,
  risk_rating TEXT NOT NULL,
  mandate_fit NUMERIC(5,2),
  payload JSONB NOT NULL,               -- InvestorDecision shape (see /decision/types.ts)
  UNIQUE(company_id, as_of)
);
CREATE INDEX IF NOT EXISTS idx_investor_decisions_latest ON investor_decisions(company_id, as_of DESC);

COMMIT;
