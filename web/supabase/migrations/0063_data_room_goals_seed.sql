-- ============================================================
-- 0063: Data Room Automation Goals — Standard Goal Templates
-- ============================================================
-- Seeds data_room_goal_templates with 30 standard goals
-- covering all 10 data room sections. Actual per-user goals
-- are instantiated via API when a user generates their data room.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. GOAL TEMPLATES TABLE (global, not per-user)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_room_goal_templates (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_type                 text        NOT NULL
                            CHECK (goal_type IN ('document_upload','template_fill','ai_generate','connect_integration')),
  section                   text        NOT NULL,
  title                     text        NOT NULL,
  description               text        NOT NULL,
  priority                  text        NOT NULL DEFAULT 'P1'
                            CHECK (priority IN ('P0','P1','P2')),
  target_completion_days    int         NOT NULL DEFAULT 30,
  credits_reward            numeric(5,2) NOT NULL DEFAULT 0.10,
  automation_trigger        jsonb       DEFAULT '{}',
  template_slug             text,       -- references data_room_document_templates
  is_active                 boolean     DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drgt_section ON data_room_goal_templates(section);
CREATE INDEX IF NOT EXISTS idx_drgt_priority ON data_room_goal_templates(priority);
CREATE INDEX IF NOT EXISTS idx_drgt_goal_type ON data_room_goal_templates(goal_type);

ALTER TABLE data_room_goal_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY drgt_public_read ON data_room_goal_templates FOR SELECT TO authenticated
  USING (true);
CREATE POLICY drgt_service ON data_room_goal_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 2. PER-USER GOAL PROGRESS TABLE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_room_goal_progress (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid        NOT NULL,
  data_room_id    uuid        REFERENCES data_rooms(id) ON DELETE CASCADE,
  template_id     uuid        REFERENCES data_room_goal_templates(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','complete','skipped')),
  evidence        jsonb       DEFAULT '{}',   -- {document_id, file_url, note}
  credits_awarded numeric(5,2) DEFAULT 0,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, data_room_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_drgp_account ON data_room_goal_progress(account_id);
CREATE INDEX IF NOT EXISTS idx_drgp_room ON data_room_goal_progress(data_room_id);
CREATE INDEX IF NOT EXISTS idx_drgp_status ON data_room_goal_progress(status);

ALTER TABLE data_room_goal_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY drgp_service ON data_room_goal_progress FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY drgp_owner ON data_room_goal_progress FOR ALL TO authenticated
  USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 3. SEED: 30 Standard Automation Goals (3 per section)
-- ─────────────────────────────────────────────────────────────
INSERT INTO data_room_goal_templates (goal_type, section, title, description, priority, target_completion_days, credits_reward, automation_trigger, template_slug) VALUES

-- ── Section 1: Corporate & Legal ──────────────────────────────────────────
('document_upload', '1. Corporate & Legal',
 'Upload Certificate of Incorporation / ASIC Extract',
 'Upload your ASIC company extract or Certificate of Incorporation. This is P0 for any investor due diligence.',
 'P0', 7, 0.25,
 '{"trigger": "file_upload", "accepted_types": ["pdf"], "keywords": ["asic","incorporation","acn"]}',
 NULL),

('template_fill', '1. Corporate & Legal',
 'Complete Company Overview Template',
 'Fill in company name, ABN, ACN, incorporation date, registered address, and director details using the BlockID template.',
 'P0', 5, 0.25,
 '{"trigger": "template_filled", "required_fields": ["company_name","abn","acn","incorporation_date"]}',
 'company-overview'),

('document_upload', '1. Corporate & Legal',
 'Upload Constitution / Shareholders Agreement',
 'Upload your company constitution or shareholders agreement. Critical for VC/angel due diligence.',
 'P1', 14, 0.20,
 '{"trigger": "file_upload", "accepted_types": ["pdf","docx"], "keywords": ["constitution","shareholders","agreement"]}',
 NULL),

-- ── Section 2: Cap Table & Equity ─────────────────────────────────────────
('connect_integration', '2. Cap Table & Equity',
 'Connect BlockID Cap Table',
 'Link your BlockID cap table module to auto-populate ownership percentages, share classes, and option pool data.',
 'P0', 3, 0.30,
 '{"trigger": "integration_connected", "integration": "blockid-captable", "auto_pull": true}',
 NULL),

('ai_generate', '2. Cap Table & Equity',
 'Generate Cap Table Summary',
 'Use AI to generate an investor-ready cap table summary document from your BlockID equity data.',
 'P0', 7, 0.25,
 '{"trigger": "ai_generated", "source": "equity_plans", "output": "cap_table_summary"}',
 'cap-table-summary'),

('document_upload', '2. Cap Table & Equity',
 'Upload ESOP / Option Plan Documents',
 'Upload your ESOP scheme rules or option plan documentation. Required for investors evaluating dilution risk.',
 'P1', 21, 0.20,
 '{"trigger": "file_upload", "accepted_types": ["pdf","docx"], "keywords": ["esop","option","scheme","ess"]}',
 NULL),

-- ── Section 3: Financial Projections ──────────────────────────────────────
('ai_generate', '3. Financial Projections',
 'Generate 3-Year Financial Model',
 'Auto-generate a 3-year P&L and cash flow projection using your SVI metrics and stage data.',
 'P0', 10, 0.50,
 '{"trigger": "ai_generated", "source": "startup_metrics", "output": "financial_model", "years": 3}',
 'financial-model'),

('document_upload', '3. Financial Projections',
 'Upload P&L / Management Accounts',
 'Upload your latest profit & loss statement or management accounts (if revenue-stage).',
 'P1', 14, 0.20,
 '{"trigger": "file_upload", "accepted_types": ["pdf","xlsx","csv"], "keywords": ["profit","loss","p&l","income","accounts"]}',
 NULL),

('template_fill', '3. Financial Projections',
 'Complete Unit Economics Template',
 'Document your LTV, CAC, gross margin, and payback period using the BlockID unit economics template.',
 'P1', 21, 0.15,
 '{"trigger": "template_filled", "required_fields": ["ltv","cac","gross_margin","payback_months"]}',
 'unit-economics'),

-- ── Section 4: Product & Technology ───────────────────────────────────────
('document_upload', '4. Product & Technology',
 'Upload Product Roadmap',
 'Upload a 12-18 month product roadmap in PDF or presentation format.',
 'P0', 14, 0.20,
 '{"trigger": "file_upload", "accepted_types": ["pdf","pptx"], "keywords": ["roadmap","product","feature","milestone"]}',
 NULL),

('ai_generate', '4. Product & Technology',
 'Generate Tech Stack Documentation',
 'Auto-generate a technology architecture summary from your SVI evidence and product data.',
 'P1', 21, 0.25,
 '{"trigger": "ai_generated", "source": "svi_evidence", "dimension": "ptd", "output": "tech_stack_doc"}',
 'tech-stack'),

('document_upload', '4. Product & Technology',
 'Upload Product Demo / Screenshots',
 'Upload product screenshots, demo video link, or pitch demo recording.',
 'P1', 14, 0.15,
 '{"trigger": "file_upload", "accepted_types": ["pdf","png","jpg","mp4"], "keywords": ["demo","screenshot","product","ui"]}',
 NULL),

-- ── Section 5: Market & Traction ──────────────────────────────────────────
('ai_generate', '5. Market & Traction',
 'Generate Market Analysis from SVI Data',
 'AI generates a TAM/SAM/SOM market sizing document using your SVI market positioning score and evidence.',
 'P0', 7, 0.50,
 '{"trigger": "ai_generated", "source": "svi_analyses", "dimension": "mpc", "output": "market_analysis"}',
 'market-analysis'),

('connect_integration', '5. Market & Traction',
 'Connect Revenue / Metrics Dashboard',
 'Connect Stripe, Xero, or your analytics platform to auto-pull MRR, ARR, and growth metrics.',
 'P0', 7, 0.30,
 '{"trigger": "integration_connected", "integration": "revenue_metrics", "auto_pull": true}',
 NULL),

('document_upload', '5. Market & Traction',
 'Upload Customer Testimonials / Case Studies',
 'Upload 2-3 customer testimonials or case studies showing real-world traction.',
 'P1', 21, 0.15,
 '{"trigger": "file_upload", "accepted_types": ["pdf","png"], "keywords": ["testimonial","customer","case_study","review"]}',
 NULL),

-- ── Section 6: Team & Advisors ────────────────────────────────────────────
('template_fill', '6. Team & Advisors',
 'Complete Founder Bios Template',
 'Fill in founder backgrounds, relevant experience, LinkedIn profiles, and domain expertise.',
 'P0', 7, 0.25,
 '{"trigger": "template_filled", "required_fields": ["founder_name","founder_role","founder_linkedin","founder_bio"]}',
 'founder-bios'),

('document_upload', '6. Team & Advisors',
 'Upload Advisor Agreements',
 'Upload signed advisor agreements with equity/SAFEs or advisory retainer terms.',
 'P1', 30, 0.15,
 '{"trigger": "file_upload", "accepted_types": ["pdf"], "keywords": ["advisor","advisory","agreement","SAFE"]}',
 NULL),

('document_upload', '6. Team & Advisors',
 'Upload Team CVs / LinkedIn Exports',
 'Upload CVs for all key team members. LinkedIn PDF exports are acceptable.',
 'P1', 14, 0.10,
 '{"trigger": "file_upload", "accepted_types": ["pdf"], "keywords": ["cv","resume","linkedin","profile"]}',
 NULL),

-- ── Section 7: IP & Compliance ────────────────────────────────────────────
('document_upload', '7. IP & Compliance',
 'Upload IP Assignment Agreements',
 'Upload IP assignment agreements signed by all founders (critical for VC due diligence).',
 'P0', 14, 0.25,
 '{"trigger": "file_upload", "accepted_types": ["pdf"], "keywords": ["ip","intellectual","property","assignment"]}',
 NULL),

('document_upload', '7. IP & Compliance',
 'Upload Privacy Policy & Terms of Service',
 'Upload your current Privacy Policy and Terms of Service (or links to published versions).',
 'P1', 14, 0.15,
 '{"trigger": "file_upload", "accepted_types": ["pdf","txt"], "keywords": ["privacy","policy","terms","service"]}',
 NULL),

('ai_generate', '7. IP & Compliance',
 'Generate Regulatory Compliance Checklist',
 'AI generates an AU regulatory compliance checklist based on your industry and product type.',
 'P2', 30, 0.20,
 '{"trigger": "ai_generated", "source": "svi_analyses", "dimension": "lco", "output": "compliance_checklist"}',
 'compliance-checklist'),

-- ── Section 8: Contracts & Agreements ────────────────────────────────────
('document_upload', '8. Contracts & Agreements',
 'Upload Key Customer Contracts',
 'Upload LOIs, pilot agreements, or signed contracts with key customers (redacted if needed).',
 'P0', 21, 0.25,
 '{"trigger": "file_upload", "accepted_types": ["pdf"], "keywords": ["contract","agreement","customer","loi","pilot"]}',
 NULL),

('document_upload', '8. Contracts & Agreements',
 'Upload Partnership / Reseller Agreements',
 'Upload key partnership, reseller, or distribution agreements.',
 'P1', 30, 0.15,
 '{"trigger": "file_upload", "accepted_types": ["pdf"], "keywords": ["partnership","reseller","distribution","agreement"]}',
 NULL),

('document_upload', '8. Contracts & Agreements',
 'Upload Employment / Contractor Agreements',
 'Upload standard employment agreements and IP assignment clauses for key hires.',
 'P2', 30, 0.10,
 '{"trigger": "file_upload", "accepted_types": ["pdf"], "keywords": ["employment","contractor","agreement","hire"]}',
 NULL),

-- ── Section 9: Strategy & Roadmap ─────────────────────────────────────────
('template_fill', '9. Strategy & Roadmap',
 'Complete Fundraise Strategy Template',
 'Document raise amount, instrument (SAFE/priced), use of funds, target close date, and target investors.',
 'P0', 7, 0.25,
 '{"trigger": "template_filled", "required_fields": ["raise_amount","instrument","use_of_funds","target_close"]}',
 'fundraise-strategy'),

('ai_generate', '9. Strategy & Roadmap',
 'Generate Go-to-Market Strategy',
 'AI compiles your GTM strategy from SVI traction evidence, market positioning, and growth metrics.',
 'P1', 21, 0.35,
 '{"trigger": "ai_generated", "source": "svi_analyses", "dimensions": ["mpc","cgh","tre"], "output": "gtm_strategy"}',
 'gtm-strategy'),

('document_upload', '9. Strategy & Roadmap',
 'Upload Pitch Deck',
 'Upload your current investor pitch deck (PDF or PowerPoint).',
 'P0', 5, 0.20,
 '{"trigger": "file_upload", "accepted_types": ["pdf","pptx"], "keywords": ["pitch","deck","investor","presentation"]}',
 NULL),

-- ── Section 10: References & Due Diligence ────────────────────────────────
('document_upload', '10. References & Due Diligence',
 'Upload Reference Letters from Customers',
 'Upload 2-3 reference letters from customers or pilot users.',
 'P1', 30, 0.15,
 '{"trigger": "file_upload", "accepted_types": ["pdf"], "keywords": ["reference","letter","customer","testimonial"]}',
 NULL),

('ai_generate', '10. References & Due Diligence',
 'Generate Investor FAQ / Q&A Document',
 'AI pre-generates answers to the 20 most common investor due diligence questions for your startup.',
 'P1', 14, 0.35,
 '{"trigger": "ai_generated", "source": "svi_analyses", "output": "investor_faq"}',
 'investor-faq'),

('document_upload', '10. References & Due Diligence',
 'Upload Press / Media Coverage',
 'Upload or link to press articles, podcast appearances, or media coverage.',
 'P2', 45, 0.10,
 '{"trigger": "file_upload", "accepted_types": ["pdf","png","url"], "keywords": ["press","media","article","coverage","podcast"]}',
 NULL)

ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 4. COMMENTS
-- ─────────────────────────────────────────────────────────────
COMMENT ON TABLE data_room_goal_templates IS '30 standard automation goals covering all 10 data room sections — BlockID proprietary';
COMMENT ON TABLE data_room_goal_progress IS 'Per-user per-data-room goal completion tracking with credit rewards';
