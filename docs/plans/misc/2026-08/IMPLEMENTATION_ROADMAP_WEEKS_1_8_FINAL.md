# BlockID.au Startup Quality Upgrade — Complete 8-Week Implementation Roadmap
**v3.6.9 → v3.8.0 Sequential Delivery Playbook**

**Project Status:** All agent designs completed and synthesized  
**Master Coordination:** Continuous sequential execution, Weeks 1–8 (Aug 18 – Oct 10, 2026)  
**Version:** Final synthesis of 5 feature designs + master plan  
**Date:** 2026-08-16

---

## ONE-PAGE EXECUTIVE SUMMARY

### The 5 Features Shipping Across 8 Weeks

| Week | Feature | Lead Agent | Effort | v-Tag | Key Metric |
|------|---------|-----------|--------|-------|-----------|
| **W1** (Aug 18–24) | Revenue Forecast Builder | Agent 7 | 5 pd | v3.6.9 | 40%+ founder adoption |
| **W2** (Aug 25–31) | Exit Strategy Roadmap | Agent 8 | 6 pd | v3.7.0 | 60%+ Series A-bound use |
| **W3** (Sep 1–7) | Competitive Positioning | Agent 9 | 5 pd | v3.7.1 | MPC dimension +24 pts |
| **W4–5** (Sep 8–21) | SVI Evidence Completeness | Agent 5 | 6 pd | v3.7.2 | LCO dimension visible |
| **W6–7** (Sep 22–Oct 5) | C-Level DCF Enhancement | Agent 6 | 8 pd | v3.8.0 | CFO reports +3000 words |

**Total:** 30 person-days (4–5 FTE weeks), 125+ files, 300+ tests, 5 production deployments

### Why This Sequence?

1. **Revenue Forecast (W1)** — Foundation for all downstream features (valuation, exit planning, funding readiness)
2. **Exit Strategy (W2)** — Depends on accurate revenue projections; enables founder payout modeling
3. **Competitive Positioning (W3)** — Independent, lightweight; quick shipping wins momentum
4. **SVI Evidence (W4–5)** — Depends on revenue + competitive data for quantitative evidence
5. **C-Level DCF (W6–7)** — Highest complexity; leverages all prior features (forecasts, exits, evidence)

### Compliance Guardrails (ALL FEATURES)

**CRITICAL:** Every feature must enforce the no-real-company-names compliance rule:
- ✅ AI prompts: Anonymize real startup/competitor names → "AU FinTech Competitor A", "AU SaaS Strategic Buyer (2022)"
- ✅ Output/Reports: No Atlassian, Canva, Afterpay, etc. in generated text
- ✅ PDF exports: Regex validation before export (catch any missed names)
- ✅ Database: Internal data can retain real names; API responses must strip them

Test: Every feature's test suite includes compliance checks (regex patterns confirming anonymization).

---

## WEEKLY BREAKDOWN: DAYS & DELIVERABLES

### **WEEK 1 (AUG 18–24): Revenue Forecast Builder — Full Frontend & API Integration**

**Goal:** Founders can model 3-year revenue growth with tax incentives, scenario branching, and investor pack export.

**Agent 7 Handoff Received:**
- ✅ Migration (financial_models table + audit)
- ✅ Types (6 interfaces)
- ✅ Core calc engine (S-curve growth + RDTI tax)
- ✅ Tests (48/48 passing)
- ✅ 5 API routes (generate, CRUD, save, fetch, export CSV)

**Days 1–2 (Mon–Tue): Frontend Wizard & Components**
1. Create `/web/src/app/(app)/(founder)/workspace/financial-forecast/page.tsx` (RSC, 80 lines)
   - List all forecasts for founder + "New forecast" CTA
2. Create wizard client component (200 lines) + 4 step components:
   - Step 1: Basic inputs (current ARR, monthly growth %, churn %)
   - Step 2: Cost structure (COGS %, fixed opex/mo, tax incentive flag)
   - Step 3: Scenario selection (Bear/Base/Bull multipliers)
   - Step 4: Review & save
3. Add real-time preview: Call `computeProjection()` client-side, show 36-month table as user types

**Days 3–4 (Wed–Thu): Results Dashboard & Export**
1. Create results page with tabs:
   - **Projection Table:** 36-month revenue, COGS, gross margin, OpEx, EBITDA, cumulative cash, runway to breakeven
   - **Metrics Panel:** Key numbers (Year 1–3 ARR, breakeven month, Series A runway, tax offset total)
   - **Scenario Comparison:** Bear/Base/Bull side-by-side tables
   - **Export:** CSV button (calls `/api/financial/forecast/[modelId]/export`)
2. Add SVI scoring hook (placeholder for W4 integration):
   - If FIN dimension calculation exists, show "Financial modeling score: 68/100"

**Day 5 (Fri): Integration Testing & Ship**
1. Run full E2E test suite (3 scenarios: bootstrap pre-revenue, $50K MRR seed, Series A revenue acceleration)
2. Verify dashboard tiles + nav updates
3. Stage smoke test → Production deployment (v3.6.9 ships)

**Success Metrics:**
- ✓ Wizard completion rate >40%
- ✓ Forecast generation <2 sec
- ✓ CSV export works, 36 rows + summary
- ✓ SVI score hook ready (will auto-enable in W5)

**Handoff to W2:**
- Revenue forecasts stored in DB for all founders
- Projection data ready for investor pack (W4 assembly)
- API endpoints proven stable (5 days production monitoring)

---

### **WEEK 2 (AUG 25–31): Exit Strategy Roadmap — Database + Wizard + Dashboard**

**Goal:** Founders can model Series A/B funding rounds, visualize dilution progression, estimate founder exit payouts, and see acquirer comparables.

**Agent 8 Design Received:**
- Week 2 (backend): Migrations, helpers library, API routes
- Week 3 (frontend): Wizard + results components
- Week 4 (integration): Investor pack + SVI scoring

**Days 1–2 (Mon–Tue): Backend Foundation**
1. Run migrations:
   - `20260823_exit_scenarios.sql` (scenarios table: name, exit_type, timeline, Series A/B flags, valuation)
   - `20260823_cap_table_projections.sql` (projections table: round-by-round cap table snapshots)
   - `20260823_exit_readiness_assessments.sql` (readiness scores: product, revenue, team, market fit)
2. Verify RLS policies + indexes
3. Generate TypeScript types from Supabase schema
4. Test locally: `npx supabase migration up`

**Days 2–3 (Tue–Wed): Core Calculation Library**
1. Implement `/web/src/lib/exit-strategy.helpers.ts` (5 functions):
   - `computeDilutionProgression()` — Round-by-round cap table evolution (seed → A → B → exit)
   - `estimateFounderExitPayout()` — Gross/CGT/net payouts per founder
   - `suggestAcquirers()` — Filter AU_EXITS fixture, anonymize labels, suggest buyer types
   - `computeExitReadiness()` — 4-checkpoint scoring (product, revenue, team, market)
   - `formatExitScenarioForInvestorPack()` — Markdown export for PDF
2. Implement full test suite (25+ unit tests, 70%+ coverage)
3. Test dilution accuracy vs manual cap-table calculations (±0.5% tolerance)

**Days 3–4 (Wed–Thu): API Routes**
1. Create 4 API routes:
   - `POST /api/exit-strategy/create-scenario` — Wizard submit (validates, computes, saves)
   - `GET /api/exit-strategy/scenarios` — List all scenarios
   - `GET/PUT/DELETE /api/exit-strategy/scenarios/[id]` — CRUD + recalc on update
2. Add structured errors (400 validation, 401 auth, 500 server)
3. Integration tests for all routes (10+ tests)

**Day 5 (Fri): Ship Backend**
1. Run full test suite: `npm test -- exit-strategy* --coverage`
2. Stage deployment + smoke test
3. Merge to main + tag v3.7.0-rc (backend ready)

**Handoff to W3:**
- All exit scenarios stored, queryable via API
- Cap table dilution calculations verified against manual audit
- Frontend team can build wizard on Monday W3

---

### **WEEK 3 (SEP 1–7): Exit Strategy Frontend + Competitive Positioning**

**Note:** Exit Strategy frontend (Days 1–4) happens in parallel with Competitive Positioning sprint (Days 3–5).

#### **Part A: Exit Strategy Frontend (Agent 8, W3 portion)**

**Days 1–2 (Mon–Tue): Wizard UI**
1. Create wizard page + 5 step components:
   - Step 1: Timeline (2–20 years, S-curve input)
   - Step 2: Series A (if planning: raise amt, pre-money, year relative)
   - Step 3: Series B (if planning: raise amt, pre-money, year relative)
   - Step 4: Exit scenario (type: acquisition/IPO, target valuation, target revenue)
   - Step 5: Review (calls API to compute, shows preview)
2. Add progress bar, form validation, error handling
3. Mobile-responsive design + accessibility (ARIA labels)

**Days 2–3 (Tue–Wed): Results Dashboard**
1. Create results page with 5 tabs:
   - **Dilution Table:** Round | Year | Pre-Money | Raise | Founder% | Investor% | ESOP%
   - **Founder Payouts:** Name | Stake% | Gross | CGT (est.) | Net | Tax Disclaimer
   - **Acquirer Landscape:** Anonymized buyer types + valuation ranges (AU SaaS Strategic 2016–2024, etc.)
   - **Exit Readiness:** Score, band, 4 checkpoints with gaps
   - **Narrative:** Editable text for founder to share vision
2. Add action buttons: Edit, Delete, Set Primary, Export to Pack

**Day 3 (Wed): Ship Exit Strategy Frontend**
1. E2E test all 3 scenarios
2. Integration tests (15+ tests)
3. Mobile testing + accessibility audit
4. Merge to release branch

#### **Part B: Competitive Positioning (Agent 9 — Parallel)**

**Days 3–5 (Wed–Fri): Full Feature (Lightweight, Single-Week Build)**

**Day 3 (Wed): Database + API**
1. Run migration: `competitive_features` table (competitor_id, feature_list, strength_pct, etc.)
2. Create 4 API routes:
   - `POST /api/founder/competitive/extract-features` — LLM-powered feature extraction
   - `PUT /api/founder/competitive/update-features` — Save extracted features
   - `GET /api/founder/competitive/positioning` — Generate positioning summary
   - `GET /api/founder/competitive/internal-context` — Fetch audit trail
3. Add tests (60 lib + 80 API integration tests)

**Day 4 (Thu): React Components**
1. Create 5 components:
   - `FeatureExtractionPanel` — Show extracted features, allow edits
   - `CompetitiveMatrix` — 2x2 matrix (price vs differentiation)
   - `PositioningBuilder` — Drag-and-drop positioning statement
   - `SummaryCard` — Quick snapshot (3 competitors, 3 key differentiators)
   - `FeaturesTab` — Integration into founder workspace
2. Add 24 component tests (vitest)

**Day 5 (Fri): Integration + Ship**
1. Wire into SVI scoring:
   - MPC dimension: +0–24 pts (competitor parity scoring)
   - SVM dimension: +0–14 pts (strategic differentiation)
2. Verify anonymization (no real competitor names in PDF/output)
3. Run 300+ total tests (lib + API + component + E2E)
4. Merge + deploy to production (v3.7.1 ships)

**Week 3 Summary:**
- ✅ Exit Strategy wizard + results dashboard live
- ✅ Competitive Positioning feature (5 components, full UI) live
- ✅ SVI scoring integration started (MPC/SVM hooks in place)
- ✅ v3.7.1 shipped with both features

---

### **WEEK 4 (SEP 8–14): Exit Strategy Investor Pack + SVI Scoring Integration**

**Goal:** Exit strategy visible in investor packs; SVI scoring boosted by exit + competitive data.

**Days 1–2 (Mon–Tue): Investor Pack Integration**
1. Create `exit-strategy-chapter.ts` (~150 lines):
   - Build Chapter 11 "Exit Strategy & Cap Table Roadmap"
   - Render dilution table, founder payouts, acquirer landscape, readiness, narrative
   - Include tax disclaimer in all payout estimates
2. Modify `investor-pack-assembler.ts`:
   - Fetch primary exit scenario for account
   - If exists: call `buildExitStrategyChapter()`, add to pack
   - If not: skip section gracefully
3. Test: verify Chapter 11 in PDF, all tables render correctly (100 lines tests)

**Days 2–3 (Tue–Wed): SVI Scoring Integration**
1. Implement `exit-strategy-svi-boost.ts` (~80 lines):
   - Function: `computeExitStrategyBonusPoints(scenarios, svi)`
   - +5 IRI: If ≥1 scenario exists
   - +3 IRI: If Series A + B both planned
   - +2 IRI: If readiness score >70
   - +3 SVM: If scenario marked primary + exported to pack
   - Max: +10 IRI, +3 SVM
2. Wire into SVI pipeline:
   - In `updateSVISnapshot()`, add bonus points to IRI/SVM dimensions
   - Test: create scenario, verify SVI IRI increased by correct amount
3. Create tests for bonus calculation (60 lines, 10 tests)

**Days 3–4 (Wed–Thu): Dashboard + Integration Testing**
1. Add exit strategy tiles to workspace dashboard
2. Run full E2E test suite:
   - Create scenario → View results → Export investor pack → Verify Chapter 11
   - Check SVI report: verify IRI/SVM increased
3. Performance tests:
   - Wizard load: <500ms
   - Scenario computation: <100ms
   - API latency: <200ms
   - PDF export: <3sec

**Day 5 (Fri): Ship v3.7.0 (Minor Release)**
1. Final QA on staging: E2E flow, performance, compliance (no real names in PDF)
2. Deploy to production (low-traffic window)
3. Monitor first 24 hours: error rate <0.1%, wizard completion >40%

**Week 4 Summary:**
- ✅ Exit Strategy Chapter 11 in investor pack (tested)
- ✅ SVI IRI/SVM bonuses awarded automatically
- ✅ v3.7.0 live + stable (zero regressions)

---

### **WEEKS 5–6 (SEP 15–28): SVI Evidence Completeness — Quantitative Dimension Visible**

**Goal:** Founders see evidence quality dashboard; LCO dimension quantified with completeness %.

**Agent 5 Design Received:**
- Evidence categories: 5 dimensions (financial, product, team, market, legal)
- Scoring: Calculate % completeness per dimension + overall
- UI: Evidence dashboard showing gaps + "Boost evidence" CTAs
- SVI integration: LCO dimension shows completeness % + improvements suggest which evidence to gather

**Days 1–2 (Mon–Tue): Database + Schema**
1. Create `svi_evidence_artifacts` table:
   - Fields: startup_id, dimension (FIN/PTD/TRE/etc.), evidence_type, file_path, timestamp, verified_by
   - Track revenue receipts, cap table docs, tech audits, customer contracts, legal docs
   - RLS: founder ownership
2. Create `svi_evidence_assessment` table:
   - Fields: startup_id, dimension, completeness_pct, last_updated
   - Cached calculation for dashboard performance
3. Indexes on (startup_id, dimension), (startup_id, updated_at)
4. Generate TypeScript types

**Days 2–3 (Tue–Wed): Calculation Engine**
1. Implement `computeEvidenceCompleteness.ts`:
   - Function: `assessEvidenceQuality(startup, dimension): CompletionAssessment`
   - Per-dimension rubric:
     - **FIN:** Revenue receipts + tax returns + cap table + financial model = 100%
     - **TRE:** Customer contracts + testimonials + churn data + CAC analysis = 100%
     - **PTD:** Source code repository + tech audit + security assessment = 100%
     - **Team:** Founder CVs + hiring plan + equity vesting doc + key person insurance = 100%
     - **Legal:** Articles of assoc + SHA + IP assignment + compliance checklist = 100%
   - Calculate: gathered_count / required_count × 100 = completeness_%
   - Output: CompletionAssessment (dimension, completeness_%, gathered[], missing[], priority)
2. Create tests (15+ tests covering all dimensions + edge cases)

**Days 3–4 (Wed–Thu): UI Dashboard**
1. Create `/web/src/app/(app)/(founder)/workspace/evidence/page.tsx` (Evidence Dashboard):
   - 5-row table: Dimension | Completeness % | Evidence Count | Status | CTA
   - Overall progress bar: "You're 72% complete"
   - Per-dimension modals: Show what's gathered + what's missing
   - CTAs: "Upload Financial Docs", "Link GitHub Repo", "Schedule Tech Audit"
2. Create upload components for each dimension:
   - Drag-and-drop file upload (PDFs, spreadsheets, links)
   - Virus scan + file validation
   - Auto-populate evidence_artifacts table
3. Add real-time recalculation: After upload, refresh completeness % immediately
4. Tests: 24 component tests + upload flow E2E tests

**Days 4–5 (Thu–Fri): SVI Integration**
1. Wire into SVI pipeline:
   - LCO (Legal Compliance Observability) dimension now shows completeness_%
   - If FIN completeness <50%: LCO deduction –10 pts
   - If all evidence >75% complete: LCO bonus +5 pts
   - Add narrative: "Evidence quality: 72% complete; focus on [missing category]"
2. Update SVI report to show evidence dashboard link
3. Add "evidence readiness" check to investor pack (Chapter X: Evidence & Audit Trail)
4. Compliance: Verify all uploaded files remain private (RLS, no data leakage)
5. Tests: 20+ integration tests (upload → SVI update → dashboard refresh)

**Handoff:**
- Founders see evidence gaps with actionable CTAs
- SVI LCO dimension now quantified + improvable
- v3.7.2 ready to ship

---

### **WEEKS 7–8 (SEP 29–OCT 12): C-Level DCF Enhancement — Advanced Financial Advisory**

**Goal:** CFO, CEO, CTO, CMO, CDO agents generate 3000–5000 word reports with DCF valuations, sensitivity analysis, trend tracking, and 12-week comparisons.

**Agent 6 Design Received:**
- CFO: DCF valuation, sensitivity analysis, tax optimization
- CEO: 5-year strategic plan, funding roadmap, KPI tracking
- CTO: Tech debt vs innovation trade-off, infrastructure roadmap
- CMO: GTM optimization, CAC/LTV trends, market expansion
- CDO: Data strategy, privacy compliance, analytics roadmap

**Days 1–3 (Mon–Wed): Enhanced Prompts + Computation**
1. Expand CFO prompt (currently ~500 words → 2000 words):
   - Add DCF valuation section (formulas, parameters, WACC, terminal value)
   - Add sensitivity analysis (3-scenario table, 5 key drivers)
   - Add tax incentive modeling (RDTI 43.5% refund, ESIC qualification)
   - Add AU precedent comps (anonymized exits by sector)
2. Expand CEO prompt (currently ~400 words → 1500 words):
   - Add 5-year strategic roadmap with milestones
   - Add funding timeline (seed → A → B → exit, dates + amounts)
   - Add team scaling plan (current → Series A team size)
3. Expand CTO, CMO, CDO similarly (200–300 words each → 800–1200 words each)
4. Create `computeC-LevelDCF.ts`:
   - Function: `buildCFODCFValuation(financialModel, sviAnalysis, exitStrategy): CFOValuationReport`
   - Compute 5-year DCF with AU benchmarks (35–40% WACC for early stage)
   - Generate sensitivity table (5 × 3)
   - Create bear/base/bull scenario valuations
   - Estimate founder exit payouts (with tax implications)
   - Test: verify DCF vs manual calculations (r > 0.7 correlation with actual raises)
5. Tests: 30+ tests covering DCF accuracy, sensitivity, tax calcs, edge cases

**Days 3–5 (Wed–Fri): Trend Tracking + Cron Integration**
1. Create `c_level_reports_history` table:
   - Fields: startup_id, role (CFO/CEO/CTO/CMO/CDO), report_content (JSONB), valuation_estimate_aud, metrics_snapshot (ARR, runway, team_size), created_at
   - Store weekly reports for trend analysis
2. Implement trend calculation:
   - Function: `compareTrendAcross12Weeks(startup, role)`: Returns % change in ARR, runway, valuation estimate
   - Visual: "CFO valuation trending +12% over 12 weeks" + sparkline chart
3. Modify nightly cron (`/scripts/run-c-level-agents.sh`):
   - Run all 5 agents in parallel (non-blocking, 2–3 min execution)
   - Store results in c_level_reports_history table
   - Alert if trend is negative (e.g., valuation down >15% week-over-week)
4. Tests: 15+ tests for trend logic + cron integrity

**Days 5–6 (Thu–Fri): Dashboard + Report Cards**
1. Create `/web/src/app/(app)/(founder)/dashboard/c-level-reports/page.tsx` (C-Level Report Hub):
   - 5 cards (one per role) showing:
     - Report title + date
     - Key numbers: CFO valuation, CEO runway, CTO tech debt %, CMO CAC payback (months), CDO GDPR compliance %
     - Trend: ↑ Green / ↓ Red / — Flat (vs previous week)
     - Links: View full report, Trend chart, Download PDF
2. Create report detail page:
   - Full report text (3000–5000 words, Markdown)
   - DCF table (CFO), funding roadmap (CEO), tech roadmap (CTO), GTM plan (CMO), compliance checklist (CDO)
   - Trend chart: 12-week valuation/runway/KPI evolution
   - "Export to investor pack" button
3. Add to investor pack:
   - Pull latest CFO report as Chapter X "C-Level Financial Advisory"
   - Include DCF valuation + sensitivity table + tax analysis
   - Include CEO funding roadmap + 5-year milestones
   - Add CDO compliance & governance section
4. Tests: 20+ component tests + E2E tests for report generation + export

**Days 6–7 (Fri–Sat): Performance + Compliance**
1. Profile c-level agent execution:
   - Target: <3 min total (5 agents × 30–40 sec each)
   - Add caching: Skip re-generation if report <12 hours old
   - Lazy-load full reports (load summary + "expand" on demand)
2. Compliance sweep:
   - Verify all DCF assumptions documented (no magic numbers)
   - Verify acquirer comps anonymized in CFO report ("AU SaaS Strategic Buyer 2022", not "Atlassian")
   - Verify no real startup names in CEO strategic plan or CMO GTM analysis
   - Regex check: scan all reports before storing in DB (catch accidentally-leaked names)
3. Accessibility: Ensure tables render correctly on mobile, ARIA labels on charts

**Day 7 (Sat): Ship v3.8.0 (Major Release)**
1. Final staging test: Full E2E (create project → wait for nightly cron → view C-level report hub → export to investor pack)
2. Production deployment (weekend window to avoid peak load)
3. Monitor first 48 hours: error logs, agent execution time, report satisfaction scores
4. Post-launch: Collect founder feedback on report usefulness + actionability

**Week 7–8 Summary:**
- ✅ 5 C-level roles generating 3000–5000 word reports nightly
- ✅ Trend tracking visible (12-week comparison charts)
- ✅ DCF valuations in reports with sensitivity analysis
- ✅ Full reports + summaries in investor pack
- ✅ v3.8.0 shipped (all 5 features live)

---

## CRITICAL PATH DEPENDENCIES

```
Week 1: Revenue Forecast (Backend + Frontend)
   ↓
Week 2: Exit Strategy (Backend) + Week 3 (Frontend)
   ↓
Week 3: Competitive Positioning (Parallel to Exit Frontend)
   ↓
Week 4: Exit Investor Pack + SVI Scoring Boost
   ↓
Weeks 5–6: SVI Evidence (depends on evidence gathering)
   ↓
Weeks 7–8: C-Level DCF (depends on revenue forecast + exit strategy + competitive data)
```

**Cannot parallelize:**
- C-Level DCF cannot start until Revenue Forecast API proven stable (uses forecast data)
- Exit Strategy frontend cannot ship before backend API routes tested
- SVI Evidence completeness depends on Evidence artifacts collected (Week 5)

**Can parallelize:**
- Exit Strategy backend (Week 2) + Competitive Positioning (Week 3)
- Exit Strategy frontend (Week 3) + Competitive Positioning full feature (Week 3)
- C-Level dashboard design (Week 6) + implementation (Week 7)

---

## TESTING STRATEGY

### Unit Tests (Per Feature)
- Revenue Forecast: 48 tests (growth, tax, costs, runway)
- Exit Strategy: 25 tests (dilution, payouts, readiness)
- Competitive Positioning: 60 lib + 80 API tests
- SVI Evidence: 15 calculation + 24 component tests
- C-Level DCF: 30 DCF + 15 trend + 20 report tests

**Total: 315+ unit tests, target 70%+ coverage**

### Integration Tests (Per Feature)
- API routes: 40+ tests (auth, validation, error handling)
- Database: RLS policies verified, migrations tested locally
- SVI scoring: verify bonus points awarded correctly + no double-counting

**Total: 100+ integration tests**

### E2E Tests (User Workflows)
- **Scenario 1:** Bootstrap pre-revenue → Revenue Forecast → Exit strategy → Investor pack
- **Scenario 2:** Series A-funded $50K MRR → Competitive positioning → SVI evidence → C-level reports
- **Scenario 3:** Series B $2M ARR → Exit modeling (Series B → IPO, 10 years) → DCF valuation

**Total: 6+ E2E tests (Playwright), 30+ minutes execution**

### Compliance Tests (All Features)
- Regex scan: No real company names in AI output
- No unencrypted PII in CSV exports
- RLS policies enforced (founder cannot see other founder's data)

**Total: 15+ compliance tests**

### Production Monitoring (First 24 Hours)
- Error rate: <0.1% acceptable threshold
- Wizard completion rate: >40% expected
- API latency: <500ms p95
- SVI scoring: Bonus points awarded to 100% of scenario creators

---

## CRITICAL FILES BY FEATURE

### Revenue Forecast
- `/web/src/lib/forecast-builder.ts` (438 lines, core calc engine)
- `/web/src/lib/forecast-builder.test.ts` (48 tests)
- `/web/supabase/migrations/20260824_financial_forecasts.sql`
- `/web/src/app/api/financial/forecast/[projectId]/route.ts`
- `/web/src/app/(app)/(founder)/workspace/financial-forecast/page.tsx`

### Exit Strategy
- `/web/src/lib/exit-strategy.helpers.ts` (500 lines, 5 functions)
- `/web/src/lib/exit-strategy.helpers.test.ts` (25+ tests)
- `/web/supabase/migrations/20260823_exit_scenarios.sql`
- `/web/src/app/api/exit-strategy/create-scenario/route.ts`
- `/web/src/app/(app)/(founder)/workspace/exit-strategy/exit-strategy-wizard-client.tsx`

### Competitive Positioning
- `/web/supabase/migrations/competitive_features.sql`
- `/web/src/app/api/founder/competitive/extract-features/route.ts`
- `/web/src/app/(app)/(founder)/workspace/competitive/features-extraction-panel.tsx` (5 components)

### SVI Evidence
- `/web/src/lib/evidence-completeness.ts` (calc engine)
- `/web/supabase/migrations/svi_evidence_artifacts.sql`
- `/web/src/app/(app)/(founder)/workspace/evidence/page.tsx` (Evidence Dashboard)

### C-Level DCF
- `/web/src/lib/c-level-dcf.ts` (prompt expansions, DCF calc)
- `/web/src/lib/c-level-trend-tracking.ts` (12-week analysis)
- `/web/scripts/run-c-level-agents.sh` (nightly cron)
- `/web/src/app/(app)/(founder)/dashboard/c-level-reports/page.tsx`

---

## DEPLOYMENT CHECKLIST (Per Release)

### Pre-Deployment (Staging)
- [ ] All tests passing: `npm test -- --coverage`
- [ ] Zero TypeScript errors: `npx tsc --noEmit`
- [ ] ESLint zero warnings: `npx eslint src/`
- [ ] Migrations tested locally: `npx supabase migration up`
- [ ] E2E flows verified: `npx playwright test`
- [ ] Feature flags configured (soft-launch if needed)
- [ ] Compliance sweep: No real company names in output
- [ ] Performance profiling: Latency <500ms, CPU <50%

### Deployment (Production)
- [ ] CI/CD gates passing (11/11)
- [ ] Migrations run: `./scripts/deploy-migrations-prod.sh`
- [ ] App build deployed: `git push deploy production`
- [ ] Smoke test: Create artifact → view in dashboard → export to pack
- [ ] Error logs monitored (first 24 hours)
- [ ] Success metrics tracked (adoption %, completion rates)

### Post-Deployment (48 Hours)
- [ ] Error rate remains <0.1%
- [ ] Feature adoption meets targets (40%+ for forecast, 60%+ for exit)
- [ ] No regressions in existing features
- [ ] SVI scoring updates visible to users
- [ ] Investor pack exports working (no PDF breaks)

---

## SUCCESS METRICS BY FEATURE (Week 4 Post-Launch)

| Feature | Launch Target | 4-Week Target | 12-Week Target |
|---------|---|---|---|
| **Revenue Forecast** | 40% founder adoption | 60% adoption | 75%+ founder plan with forecast |
| **Exit Strategy** | 60% Series A-bound use | 80% create ≥1 scenario | 50% export to investor pack |
| **Competitive Positioning** | 5 components live | 40% founder adoption | MPC dimension avg +20 pts |
| **SVI Evidence** | 50% awareness | 35% gather ≥1 artifact | LCO dimension visible + improvable |
| **C-Level DCF** | Reports generating nightly | 70% report views | CFO reports satisfaction >4.2/5 |

---

## TEAM COORDINATION & STANDUP

**Daily Standup (9 AM AU time):**
- Feature leads report blockers + day's plan
- SVI scoring lead monitors dimension drift
- DevOps monitors deployment stability

**Weekly Sync (Mon 4 PM AU):**
- Week review: Did we hit test targets? Performance targets?
- Week planning: Next week's blockers + dependencies
- Release decision: Ship on Fri or hold for patch?

**Release Gate (Every Friday 2 PM AU):**
- All tests passing?
- Zero production regressions?
- Compliance sweep complete?
- → **SHIP to production** (or hold for next week)

**Retrospective (Every 2 Weeks, Fri 5 PM AU):**
- What worked? What didn't?
- Process improvements
- Customer feedback summary

---

## CONTINGENCY PLANS

### If Test Coverage Falls Below 70%
- Halt merge until coverage restored
- Prioritize high-risk functions (dilution calc, DCF valuation, SVI scoring)

### If API Latency >500ms (Staging)
- Profile slow queries + optimize indexes
- Consider caching strategy (cache SVI calculations for 1 hour)
- If unfixable: defer feature to next sprint

### If Revenue Forecast Adoption <30% After 2 Weeks
- Investigate: Is wizard too complex? Are results unclear?
- Rapid UX iteration (simplify form, add tooltips)
- Deploy UX patch within 48 hours

### If Dilution Calculations Diverge >1% from Manual Audit
- Halt Exit Strategy deployment
- Debug with cap-table team, verify formulas
- Re-run audit with corrected logic
- Ship when audit-confirmed accurate

### If C-Level Agent Execution Exceeds 3 Minutes
- Reduce agent prompt length (cut to top 1500 words if needed)
- Cache results more aggressively (24-hour TTL if not critical)
- Split agents into 2 batches (run 2–3 agents in parallel cron job)

---

## COMMUNICATION & HANDOFF

### To Founders
- In-app onboarding: 3-step tutorial for each feature
- Email launch announcement (with use-case examples)
- Help docs + video walkthroughs
- Founder feedback form (in-app CTA at feature completion)

### To Investors (Investor Relations)
- v3.6.9–v3.8.0 release notes (blog post + deck)
- Feature showcase: "5 new capabilities for founder financial planning"
- DCF valuations in investor pack (highlight competitive advantage)

### To Team (GitHub)
- Detailed PR descriptions (link to design docs + deployment checklist)
- Code review checklist (compliance + performance + test coverage)
- Runbook for debugging common issues

---

## FINAL NOTES

This roadmap is **ready to execute sequentially** starting Monday, August 18. Each feature builds on the prior, with clear handoff points and success criteria.

**Key Success Factors:**
1. **Disciplined sequencing** — Do not skip ahead; Revenue Forecast must ship before Exit Strategy frontend
2. **Daily monitoring** — Catch regressions early (first 24 hours post-deployment)
3. **Compliance rigor** — Every AI output scanned for real company names before shipping
4. **Performance awareness** — Monitor latency + CPU; optimize caching before adding features
5. **Team communication** — Daily standups, weekly syncs, clear blockers escalated

**Estimated Timeline:**
- Week 1 (W1): Mon Aug 18 → Fri Aug 24 (Revenue Forecast ships v3.6.9 Friday)
- Week 2 (W2): Mon Aug 25 → Fri Aug 31 (Exit Strategy backend + frontend start)
- Week 3 (W3): Mon Sep 1 → Fri Sep 7 (Exit + Competitive ship together v3.7.1 Friday)
- Week 4 (W4): Mon Sep 8 → Fri Sep 14 (Investor pack + SVI integration ship v3.7.0 Friday)
- Weeks 5–6 (W5–W6): Sep 15–28 (SVI Evidence ships v3.7.2 mid-week)
- Weeks 7–8 (W7–W8): Sep 29–Oct 12 (C-Level DCF ships v3.8.0 early October)

**Total:** 30 person-days, 125+ files, 5 production deployments, 315+ tests passing, 0 compliance violations.

---

**Ready to begin Week 1 on Monday, August 18, 2026.**
