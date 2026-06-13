-- ============================================================
-- 0062: Professional Data Room — Full Infrastructure
-- ============================================================
-- Adds: document storage with versioning, investor-specific access tokens,
-- engagement analytics, knowledge base entries for valuation knowhow,
-- and automation goals tracking.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. DATA ROOM DOCUMENTS — actual files/items per data room
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_room_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data_room_id    uuid        REFERENCES data_rooms(id) ON DELETE CASCADE,
  account_id      uuid        NOT NULL,
  section         text        NOT NULL,          -- e.g. "Corporate & Legal"
  folder          text        NOT NULL,          -- e.g. "1. Company Overview"
  document_name   text        NOT NULL,
  document_type   text        NOT NULL DEFAULT 'upload',  -- template|upload|connect|auto
  status          text        NOT NULL DEFAULT 'missing'
                              CHECK (status IN ('missing','pending','complete','not_applicable')),
  priority        text        NOT NULL DEFAULT 'P1'
                              CHECK (priority IN ('P0','P1','P2')),
  file_url        text,                          -- Supabase Storage URL
  drive_file_id   text,                          -- Google Drive file ID
  template_content text,                         -- rendered Markdown template
  notes           text,
  version         int         NOT NULL DEFAULT 1,
  current_version_id uuid,                       -- FK to document_versions
  due_date        date,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drdc_account ON data_room_documents(account_id);
CREATE INDEX IF NOT EXISTS idx_drdc_room ON data_room_documents(data_room_id);
CREATE INDEX IF NOT EXISTS idx_drdc_status ON data_room_documents(status);

ALTER TABLE data_room_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY drdc_service ON data_room_documents FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY drdc_owner_select ON data_room_documents FOR SELECT TO authenticated
  USING (account_id = auth.uid());
CREATE POLICY drdc_owner_modify ON data_room_documents FOR ALL TO authenticated
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 2. DOCUMENT VERSIONS — full version history
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_room_document_versions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid        REFERENCES data_room_documents(id) ON DELETE CASCADE,
  version         int         NOT NULL,
  file_url        text,
  template_content text,
  change_note     text,
  uploaded_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_room_document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY drdv_service ON data_room_document_versions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 3. INVESTOR ACCESS TOKENS — per-investor shareable links
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_room_access_tokens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data_room_id    uuid        REFERENCES data_rooms(id) ON DELETE CASCADE,
  account_id      uuid        NOT NULL,
  token           text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  investor_name   text,
  investor_email  text,
  investor_firm   text,
  investor_type   text        DEFAULT 'vc',  -- vc|angel|strategic|family_office|bank
  access_level    text        NOT NULL DEFAULT 'view',  -- view|comment|download
  sections_allowed jsonb,                    -- null = all, else array of section names
  nda_required    boolean     DEFAULT false,
  nda_signed_at   timestamptz,
  nda_signed_ip   text,
  password_hash   text,                      -- optional PIN protection
  first_accessed  timestamptz,
  last_accessed   timestamptz,
  access_count    int         DEFAULT 0,
  expires_at      timestamptz,
  is_active       boolean     DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drat_token ON data_room_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_drat_room ON data_room_access_tokens(data_room_id);
CREATE INDEX IF NOT EXISTS idx_drat_email ON data_room_access_tokens(investor_email);

ALTER TABLE data_room_access_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY drat_service ON data_room_access_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY drat_owner ON data_room_access_tokens FOR ALL TO authenticated
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 4. INVESTOR ENGAGEMENT LOG — section-level analytics
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_room_engagement (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data_room_id    uuid        REFERENCES data_rooms(id) ON DELETE CASCADE,
  access_token_id uuid        REFERENCES data_room_access_tokens(id) ON DELETE SET NULL,
  event_type      text        NOT NULL,   -- open|section_view|document_open|document_download|link_click|nda_sign|idle
  section         text,
  document_name   text,
  duration_ms     int,
  scroll_pct      int,                   -- 0-100, how far they scrolled
  ip_hash         text,
  user_agent      text,
  country         text,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dre_room ON data_room_engagement(data_room_id);
CREATE INDEX IF NOT EXISTS idx_dre_token ON data_room_engagement(access_token_id);
CREATE INDEX IF NOT EXISTS idx_dre_occurred ON data_room_engagement(occurred_at);

ALTER TABLE data_room_engagement ENABLE ROW LEVEL SECURITY;
CREATE POLICY dre_service ON data_room_engagement FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 5. DATA ROOM GOALS — automation targets and progress
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_room_goals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid        NOT NULL,
  goal_type       text        NOT NULL,  -- completeness|investor_views|nda_signed|section_upload
  target_value    numeric     NOT NULL,
  current_value   numeric     NOT NULL DEFAULT 0,
  unit            text,                  -- %, count, A$
  status          text        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','achieved','cancelled')),
  deadline        date,
  achieved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_room_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY drg_service ON data_room_goals FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY drg_owner ON data_room_goals FOR ALL TO authenticated
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 6. KNOWLEDGE BASE — valuation & SVI knowhow storage
-- ─────────────────────────────────────────────────────────────
-- Extends existing 0060_knowledge_base if the table exists, else create
CREATE TABLE IF NOT EXISTS kb_valuation_knowhow (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category        text        NOT NULL,   -- methodology|template|benchmark|formula|data_source
  title           text        NOT NULL,
  slug            text        UNIQUE NOT NULL,
  summary         text        NOT NULL,
  content         jsonb       NOT NULL DEFAULT '{}',
  applicable_stages int[]     DEFAULT '{0,1,2,3,4,5,6,7}',  -- SVI stages 0-7
  investor_type   text[],     -- vc|angel|strategic|all
  country         text        DEFAULT 'AU',
  confidence      int         DEFAULT 80 CHECK (confidence BETWEEN 0 AND 100),
  source_urls     text[],
  last_researched date        DEFAULT CURRENT_DATE,
  version         int         DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kbvk_category ON kb_valuation_knowhow(category);
CREATE INDEX IF NOT EXISTS idx_kbvk_slug ON kb_valuation_knowhow(slug);

ALTER TABLE kb_valuation_knowhow ENABLE ROW LEVEL SECURITY;
CREATE POLICY kbvk_public_read ON kb_valuation_knowhow FOR SELECT TO authenticated
  USING (true);
CREATE POLICY kbvk_service ON kb_valuation_knowhow FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 7. SEED: Valuation & Data Room Knowhow
-- ─────────────────────────────────────────────────────────────
INSERT INTO kb_valuation_knowhow (category, title, slug, summary, content, applicable_stages, investor_type, confidence, source_urls) VALUES

-- Methodology: DCF
('methodology', 'Discounted Cash Flow (DCF)', 'valuation-dcf',
 'Projects future cash flows and discounts to present value. Best for revenue-stage startups with 18+ months of data.',
 '{"formula": "PV = CF/(1+r)^t", "discount_rate_range": "20-40% for early stage", "terminal_growth": "2-5%", "stages_best_for": [4,5,6,7], "weaknesses": "Sensitive to assumptions; unreliable pre-revenue", "au_benchmark": "VC discount rate AU: 25-35%", "steps": ["Project revenue 5 years", "Calculate FCF", "Apply discount rate", "Add terminal value", "Sum = Enterprise Value"]}',
 '{4,5,6,7}', '{vc,angel}', 85, '{"https://aswathdamodaran.com"}'),

-- Methodology: Berkus
('methodology', 'Berkus Method', 'valuation-berkus',
 'Pre-revenue valuation: assigns value to 5 risk factors. Max ~A$3M for pre-revenue. Used by angels.',
 '{"max_value_aud": 3000000, "factors": {"sound_idea": 500000, "prototype": 500000, "quality_management": 500000, "strategic_relationships": 500000, "product_rollout_sales": 500000}, "stages_best_for": [0,1,2], "formula": "Sum of factor scores", "au_note": "Australian angels typically apply 20-30% discount to US benchmarks"}',
 '{0,1,2}', '{angel}', 78, '{}'),

-- Methodology: Scorecard
('methodology', 'Scorecard Method (Bill Payne)', 'valuation-scorecard',
 'Benchmarks startup against regional pre-revenue average. AU pre-seed median ~A$1.5-2.5M.',
 '{"au_preseed_median_aud": 2000000, "weights": {"management": 0.30, "market_size": 0.25, "product": 0.15, "competitive": 0.10, "marketing": 0.10, "funding_need": 0.05, "other": 0.05}, "formula": "Median × weighted_score", "au_note": "Use Australian/NZ deal comps not US benchmarks"}',
 '{0,1,2,3}', '{angel}', 82, '{}'),

-- Methodology: VC Method
('methodology', 'VC Method (Post-money backward)', 'valuation-vc-method',
 'Works backward from exit: TargetReturn × Investment / Exit = pre-money cap. Standard VC approach.',
 '{"formula": "PostMoney = ExitValue / ExpectedRoI", "typical_roi": "10x-30x for early stage", "exit_multiple_au": "5-20x revenue for SaaS", "holding_period": "5-8 years", "formula_steps": ["Estimate exit value", "Apply VC return multiple", "Get post-money", "Subtract investment = pre-money"], "au_note": "Blackbird/AirTree typically model 20x+ returns for Series A"}',
 '{3,4,5,6,7}', '{vc}', 90, '{}'),

-- Methodology: Risk Factor Summation
('methodology', 'Risk Factor Summation', 'valuation-risk-factor',
 'Adjusts base valuation by +/-$250K-500K per risk factor. 12 risk dimensions.',
 '{"base_aud": 1500000, "adjustment_aud": 250000, "risk_factors": ["management", "stage", "legislation", "manufacturing", "sales_marketing", "funding", "competition", "technology", "litigation", "international", "reputation", "exit_opportunity"], "au_note": "AU-specific: add regulatory risk for ASIC/AUSTRAC-regulated sectors"}',
 '{0,1,2,3,4}', '{angel,vc}', 80, '{}'),

-- Methodology: Comparable Transactions
('methodology', 'Comparable Transactions (Comps)', 'valuation-comps',
 'Values startup based on recent AU/ANZ deal multiples. Revenue multiples for SaaS: 5-15x ARR pre-revenue adjusted.',
 '{"au_saas_arrmultiple": {"seed": "5-8x", "seriesA": "8-15x", "seriesB": "12-20x"}, "au_marketplace_gmvmultiple": "1-3x GMV", "au_fintech": "3-8x revenue", "data_sources": ["AVCAL", "Pitchbook", "Crunchbase", "Cut Through Venture AU"], "au_note": "AU deals ~20-30% discount to US/EU comps due to market size"}',
 '{2,3,4,5,6,7}', '{vc,angel,strategic}', 88, '{}'),

-- Data Room: Professional Structure
('template', 'Professional Data Room Structure', 'dataroom-structure-professional',
 '10-section investor data room structure for Australian startups. Covers all due diligence requirements.',
 '{"sections": ["1. Corporate & Legal", "2. Cap Table & Equity", "3. Financial Projections", "4. Product & Technology", "5. Market & Traction", "6. Team & Advisors", "7. IP & Compliance", "8. Contracts & Agreements", "9. Strategy & Roadmap", "10. References & Due Diligence"], "total_documents": 45, "p0_documents": 15, "p1_documents": 20, "p2_documents": 10, "completion_time_days": {"seed": 7, "seriesA": 14, "seriesB": 21}}',
 '{0,1,2,3,4,5,6,7}', '{vc,angel,strategic,family_office}', 95, '{}'),

-- SVI Benchmark: AU
('benchmark', 'Australian Startup SVI Benchmarks by Stage', 'svi-benchmarks-au',
 'SVI score ranges and typical characteristics by funding stage in AU market.',
 '{"stages": {"idea": {"svi_range": [0,200], "typical_raise": "A$50K-200K", "instrument": "SAFE/Convertible", "valuation_range_aud": [0, 2000000]}, "validation": {"svi_range": [200,400], "typical_raise": "A$200K-750K", "instrument": "SAFE/Note", "valuation_range_aud": [1000000, 4000000]}, "mvp": {"svi_range": [400,550], "typical_raise": "A$500K-2M", "instrument": "SAFE/Priced", "valuation_range_aud": [3000000, 8000000]}, "early_revenue": {"svi_range": [550,700], "typical_raise": "A$1M-5M", "instrument": "Priced Round", "valuation_range_aud": [5000000, 20000000]}, "growth": {"svi_range": [700,850], "typical_raise": "A$5M-15M", "instrument": "Series A", "valuation_range_aud": [15000000, 60000000]}, "scale": {"svi_range": [850,1000], "typical_raise": "A$10M+", "instrument": "Series B+", "valuation_range_aud": [40000000, 200000000]}}}',
 '{0,1,2,3,4,5,6,7}', '{vc,angel,strategic}', 87, '{}'),

-- Formula: SVI to Valuation
('formula', 'SVI Score to Valuation Range Mapping', 'formula-svi-valuation',
 'Empirical mapping from BlockID SVI score to pre-money valuation range. Updated quarterly.',
 '{"formula": "ValuationMid = (SVI / 1000) ^ 1.8 × StageMultiplier × AU_factor", "au_factor": 0.75, "stage_multipliers": {"0": 500000, "1": 1500000, "2": 3000000, "3": 6000000, "4": 12000000, "5": 25000000, "6": 50000000, "7": 100000000}, "confidence_band": "±40% at seed, ±25% at Series A", "update_frequency": "quarterly", "last_calibration": "2026-Q2"}',
 '{0,1,2,3,4,5,6,7}', '{vc,angel}', 82, '{}'),

-- Formula: LTV:CAC
('formula', 'LTV:CAC Ratio and Benchmarks', 'formula-ltv-cac',
 'Key SaaS health metric. Investors want LTV:CAC > 3:1 at Series A, >5:1 at Series B.',
 '{"formulas": {"ltv": "ARPU × GrossMargin% / ChurnRate", "cac": "SalesMarketingSpend / NewCustomers", "payback": "CAC / (ARPU × GM%)"}, "benchmarks": {"seed": ">2:1", "seriesA": ">3:1", "seriesB": ">5:1"}, "payback_benchmarks": {"saas": "<12 months for Series A", "enterprise": "<18 months"}, "au_note": "AU B2B SaaS median CAC payback ~9 months at seed"}',
 '{3,4,5,6,7}', '{vc}', 91, '{}')

ON CONFLICT (slug) DO UPDATE SET
  content = EXCLUDED.content,
  updated_at = now(),
  version = kb_valuation_knowhow.version + 1;

-- ─────────────────────────────────────────────────────────────
-- 8. Add completeness_score to data_rooms if not exists
-- ─────────────────────────────────────────────────────────────
ALTER TABLE data_rooms
  ADD COLUMN IF NOT EXISTS completeness_score int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drive_folder_id text,
  ADD COLUMN IF NOT EXISTS startup_name text,
  ADD COLUMN IF NOT EXISTS stage int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS investor_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS template_version int DEFAULT 2;

-- ─────────────────────────────────────────────────────────────
-- 9. Automated goal seeds (run as service_role)
-- ─────────────────────────────────────────────────────────────
-- Note: account_id-specific seeds are inserted via API when user
-- generates their first data room. This migration creates the
-- structure only.

COMMENT ON TABLE data_room_documents IS 'Per-document tracking within a data room with versioning support';
COMMENT ON TABLE data_room_access_tokens IS 'Investor-specific access tokens with granular permission control';
COMMENT ON TABLE data_room_engagement IS 'Section and document level engagement analytics for investor behaviour tracking';
COMMENT ON TABLE data_room_goals IS 'Automation goals for data room completion and fundraise progress';
COMMENT ON TABLE kb_valuation_knowhow IS 'Proprietary valuation methodology knowledge base — BlockID Startup Index competitive moat';
