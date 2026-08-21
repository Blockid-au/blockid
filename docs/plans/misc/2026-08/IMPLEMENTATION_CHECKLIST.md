# Enhanced C-Level Prompts with DCF Integration — Implementation Checklist

**Project:** BlockID.au C-Level Advisory Enhancement (P2 Priority)  
**Timeline:** 30 days (engineering + QA)  
**Status:** Design Complete → Ready for Engineering Intake  
**Date:** 2026-08-16

---

## Phase 1: Prompt Expansion (Days 1–7)

### CFO Prompt Enhancement (1800 words)

- [ ] **Task 1a:** Expand `/web/scripts/lib/clevel-prompts/cfo.md` from 500 to 1800 words
  - [ ] Add "DCF Valuation Analysis" section (600 words)
    - [ ] WACC + terminal growth rate parameters
    - [ ] Revenue projection logic (pre-revenue vs revenue-generating)
    - [ ] EBIT margin assumptions table (Year 1–5)
    - [ ] Free Cash Flow calculation
    - [ ] Terminal Value formula
  - [ ] Add "3-Scenario Sensitivity Analysis" section (600 words)
    - [ ] Bear/base/bull scenario definitions
    - [ ] 5-driver sensitivity table template
    - [ ] Scenario-dependent assumptions
  - [ ] Add "AU Tax Incentive Modeling" section (400 words)
    - [ ] R&D Tax Incentive (43.5% offset) mechanics
    - [ ] ESIC eligibility tracking
    - [ ] Loss carryforward valuation
  - [ ] Add "Series A Readiness Gate" section (300 words)
    - [ ] Financial milestones checklist (runway, growth, CAC payback, LTV:CAC, margins)
    - [ ] Capital planning requirements
    - [ ] Investor readiness checklist
    - [ ] Scoring: Green/Amber/Red interpretation
  - [ ] Add "90-Day Financial Action Plan" section (300 words)
    - [ ] Prioritized action matrix (high/medium impact)
    - [ ] Owner assignments + timelines
    - [ ] Expected valuation/runway impact

- [ ] **Task 1b:** Test CFO prompt on 10+ founder accounts
  - [ ] Run mock analysis on seed-stage startup (A$10k MRR)
  - [ ] Run mock analysis on pre-revenue startup
  - [ ] Run mock analysis on hypergrowth startup (A$100k MRR)
  - [ ] QA: Verify no hallucinated figures, all cites valid
  - [ ] QA: Ensure AU tax context is accurate
  - [ ] Peer review with CFO advisor (1 hour)

### CEO Prompt Enhancement (2000 words)

- [ ] **Task 2a:** Expand `/web/scripts/lib/clevel-prompts/ceo.md` from 600 to 2000 words
  - [ ] Add "Competitive Moat & Strategic Advantage" section (700 words)
    - [ ] Network effects scoring (1–5 scale, AU benchmark)
    - [ ] Switching costs assessment
    - [ ] Data moat evaluation
    - [ ] Brand & regulatory barriers
    - [ ] 2D competitive positioning map template
    - [ ] Moat summary scorecard table
  - [ ] Add "CAPITAL Scorecard: Series A Readiness" section (400 words)
    - [ ] Customer Traction (C)
    - [ ] Addressable Market (A)
    - [ ] Product-Market Fit (P)
    - [ ] Investor & Founder Fit (I)
    - [ ] Trajectory & Unit Economics (T)
    - [ ] Advisor Board (A)
    - [ ] Legal & Compliance (L)
    - [ ] Overall score interpretation
  - [ ] Add "Go/No-Go Market-Fit Decision" section (400 words)
    - [ ] Quantitative signals table (NRR, churn, CAC payback, concentration, adoption)
    - [ ] Qualitative signals checklist (organic demand, virality, stickiness, founder conviction)
    - [ ] Go/no-go logic flowchart
    - [ ] Recommended next steps by verdict

- [ ] **Task 2b:** Test CEO prompt on 10+ founder accounts
  - [ ] QA: Verify moat assessment is nuanced, not binary
  - [ ] QA: CAPITAL score makes sense relative to startup stage
  - [ ] QA: Go/no-go verdict is defensible and cites evidence
  - [ ] Peer review with CEO coach (1 hour)

### CMO Prompt Enhancement (1500 words)

- [ ] **Task 3a:** Expand `/web/scripts/lib/clevel-prompts/cmo.md` from 500 to 1500 words
  - [ ] Add "CAC Analysis vs AU SaaS P25–P75 Benchmarks" section (400 words)
    - [ ] CAC by channel (Content/SEO, Paid, Sales, Referral)
    - [ ] Typical AU SaaS benchmarks for each channel
    - [ ] Startup's CAC vs benchmark comparison table
    - [ ] Volume ceiling per channel
    - [ ] Competitive positioning assessment
  - [ ] Add "LTV:CAC Sustainability Check" section (400 words)
    - [ ] LTV calculation with AU discount rate (15%)
    - [ ] LTV:CAC ratio assessment table
    - [ ] Churn sensitivity analysis (breakeven churn)
    - [ ] Gross margin sensitivity
    - [ ] Sustainability verdict
  - [ ] Add "Market Sizing Accuracy & Incumbent Capture" section (400 words)
    - [ ] TAM validation against IBIS/ABS/Crunchbase data
    - [ ] SAM calculation from TAM + segment
    - [ ] SOM Year 1 & Year 5 projections
    - [ ] Incumbent defense assessment
    - [ ] Acquisition vs independent growth path recommendation

- [ ] **Task 3b:** Test CMO prompt on 10+ founder accounts
  - [ ] QA: CAC benchmarks are current and AU-specific
  - [ ] QA: LTV:CAC sustainability verdict is actionable
  - [ ] QA: TAM/SAM/SOM sizing logic is transparent
  - [ ] Peer review with CMO advisor (1 hour)

### CDO Prompt Enhancement (1200 words)

- [ ] **Task 4a:** Expand `/web/scripts/lib/clevel-prompts/cdo.md` from 400 to 1200 words
  - [ ] Add "SVI Dimension Evidence Audit" section (300 words)
    - [ ] Completeness scoring framework (0%–100%)
    - [ ] Per-dimension audit template (FTV, MPC, PTD, TRE, CGH, IRI, LCO, SVM)
    - [ ] Completeness summary table
    - [ ] Collection timeline priorities
  - [ ] Add "Compliance & Data Protection Audit" section (300 words)
    - [ ] SOC 2 Type I/II readiness
    - [ ] GDPR compliance checklist (if EU customers)
    - [ ] ASIC compliance checklist (if fintech)
    - [ ] Risk levels + action timelines
  - [ ] Add "Cap Table & Legal Documentation Audit" section (300 words)
    - [ ] Cap table cleanliness checklist
    - [ ] Data room completeness checklist
    - [ ] Series A readiness indicators

- [ ] **Task 4b:** Test CDO prompt on 10+ founder accounts
  - [ ] QA: Evidence audit identifies real gaps (not false positives)
  - [ ] QA: Compliance checklist is current (ASIC/GDPR rules)
  - [ ] Peer review with CDO advisor (1 hour)

### CTO Prompt Enhancement (1500 words)

- [ ] **Task 5a:** Expand `/web/scripts/lib/clevel-prompts/cto.md` from 500 to 1500 words
  - [ ] Add "Tech Debt & Dependency Security Audit" section (500 words)
    - [ ] Tech debt scoring framework
    - [ ] Code quality debt checklist
    - [ ] Infrastructure debt checklist
    - [ ] Dependency security audit (npm audit, cargo audit)
    - [ ] Supply chain risk assessment
    - [ ] Debt paydown prioritization
  - [ ] Add "3-Scenario Infrastructure Cost Projection" section (500 words)
    - [ ] Current infrastructure breakdown (DB, compute, storage, analytics)
    - [ ] Scaling assumptions (3x, 5x, 10x customer growth)
    - [ ] Cost projection tables (Bear/Base/Bull)
    - [ ] Scaling strategies by scenario
    - [ ] Total capex estimate for scaling
  - [ ] Add "IP Defensibility & Patent Strategy" section (300 words)
    - [ ] Trade secret protection checklist
    - [ ] Patent opportunity assessment
    - [ ] Reverse engineering risk evaluation
    - [ ] Patent filing recommendation

- [ ] **Task 5b:** Test CTO prompt on 10+ founder accounts
  - [ ] QA: Tech debt assessment is prioritized, not overwhelming
  - [ ] QA: Infra cost projections are realistic (AWS/Vercel pricing)
  - [ ] QA: IP strategy recommendation is practical
  - [ ] Peer review with CTO advisor (1 hour)

### Phase 1 Completion Criteria

- [ ] All 5 prompts expanded to target word counts (±10%)
- [ ] All 50 test runs completed (10 per role)
- [ ] Peer reviews signed off
- [ ] Prompts committed to git with version tags

---

## Phase 2: DCF Engine & Sensitivity (Days 8–14)

### Sensitivity Engine Implementation

- [ ] **Task 6:** Build `clevel-sensitivity-engine.ts` TypeScript module (500 lines)
  - [ ] `generateScenarios()` function
    - [ ] Bear case: growth –25%, churn +50%, margin –3pp
    - [ ] Base case: plan assumptions
    - [ ] Bull case: growth +25%, churn –25%, margin +2pp
  - [ ] `generateScenarioValuation()` function
    - [ ] Modify input assumptions per scenario
    - [ ] Compute blended valuation
    - [ ] Project Year 5 metrics (ARR, EBIT)
  - [ ] `buildSensitivityTable()` function
    - [ ] Compute 5-driver sensitivity (ARR growth, churn, COGS, OpEx, tax)
    - [ ] Calculate bear/bull impact % for each driver
    - [ ] Identify dominant levers
  - [ ] `findBreakevenChurn()` function
    - [ ] Solve for max churn @ target LTV:CAC ratio
  - [ ] `exportSensitivityAsMarkdown()` function
    - [ ] Generate scenario table (markdown)
    - [ ] Generate driver sensitivity table
    - [ ] Generate insights bullets

- [ ] **Task 7:** Integrate with existing `clevel-valuation.ts`
  - [ ] Ensure DCF valuation is called from sensitivity engine
  - [ ] Verify scenario inputs properly override base assumptions
  - [ ] Test DCF accuracy against hand-calced examples

### Testing

- [ ] **Task 8:** Write 40+ test scenarios in `clevel-sensitivity-engine.test.ts`
  - [ ] DCF Accuracy (10 tests)
    - [ ] Deterministic output
    - [ ] Pre-revenue handling
    - [ ] High-growth compounding
    - [ ] Negative growth
    - [ ] VC Method correlation
    - [ ] Bear/base/bull monotonicity
  - [ ] Sensitivity Analysis (10 tests)
    - [ ] 3-scenario generation
    - [ ] Reasonable bounds
    - [ ] ARR growth = highest impact
    - [ ] Churn = second-highest impact
    - [ ] Tax rate = lowest impact
    - [ ] Markdown export
  - [ ] Trend Tracking (5 tests)
    - [ ] 12-week history structure
    - [ ] Runway depletion
    - [ ] Funding event detection
    - [ ] SVI progression
    - [ ] ARR growth tracking
  - [ ] Edge Cases (10 tests)
    - [ ] Pre-revenue
    - [ ] Missing data
    - [ ] Extreme growth
    - [ ] Zero churn
    - [ ] High concentration
    - [ ] Early/late stage
  - [ ] Regression & Scale (5+ tests)
    - [ ] 100 startups in <30 sec
    - [ ] Concurrent scenarios
    - [ ] Idempotency
    - [ ] No NaN/Infinity
    - [ ] Structure consistency

- [ ] **Task 9:** Run full test suite
  - [ ] All tests pass
  - [ ] Coverage >90%
  - [ ] Performance <1ms per startup

### Phase 2 Completion Criteria

- [ ] `clevel-sensitivity-engine.ts` complete & tested
- [ ] All 40+ test scenarios pass
- [ ] DCF validated against hand-calced examples (r > 0.9)
- [ ] Sensitivity analysis shows correct impact rankings

---

## Phase 3: Database & API (Days 15–18)

### Database Migration

- [ ] **Task 10:** Create `20260816_clevel_reports_v2.sql` migration
  - [ ] `clevel_reports_v2` table (with all columns from design doc)
  - [ ] Indexes (project_id + role + scenario, generated_at, startup_id)
  - [ ] `clevel_report_history` audit table
  - [ ] `clevel_trend_snapshots` table (for 12-week tracking)
  - [ ] RLS policies (founders read own, admins read all)
  - [ ] Helper functions
    - [ ] `get_latest_clevel_report_by_role()`
    - [ ] `get_12_week_trend()`
    - [ ] `calculate_trend_delta()`

- [ ] **Task 11:** Test migration on staging database
  - [ ] Migration applies cleanly (no errors)
  - [ ] Tables created with correct schema
  - [ ] Indexes are functional
  - [ ] RLS policies work correctly

### API Routes

- [ ] **Task 12:** Build `POST /api/cron/clevel-review-v2/generate` endpoint
  - [ ] Request validation (startup_ids, roles, scenarios)
  - [ ] Loop: for each (startup, role, scenario)
    - [ ] Fetch financial data from Supabase
    - [ ] Load role-specific prompt
    - [ ] Load scenario modifiers
    - [ ] Call Claude API
    - [ ] Parse response into structured sections
    - [ ] Compute DCF + sensitivity
    - [ ] Store in `clevel_reports_v2`
  - [ ] Response: { success, generated, total_cost_usd, duration_ms, errors }
  - [ ] Error handling: graceful fallback if LLM fails
  - [ ] Rate limiting: max 50 startups/request

- [ ] **Task 13:** Build `GET /api/cron/clevel-review-v2/historical/[role]/[projectId]` endpoint
  - [ ] Query params: weeks (default 12), scenario (default base), format (json/markdown)
  - [ ] Fetch last N weeks of reports for role + scenario
  - [ ] Calculate trend deltas (SVI, ARR, runway, valuation)
  - [ ] Return structured response (TrendResponse type)
  - [ ] Support export to CSV

- [ ] **Task 14:** Test API routes (postman or automated tests)
  - [ ] Happy path: generate + fetch reports
  - [ ] Error handling: missing startup_id, invalid role
  - [ ] Performance: 100 reports generated <30 sec
  - [ ] Database integrity: unique constraint enforced

### Phase 3 Completion Criteria

- [ ] Migration deployed to staging
- [ ] Both API routes tested and working
- [ ] Request/response types match OpenAPI spec
- [ ] Error messages are informative

---

## Phase 4: Nightly Cron (Days 19–21)

### Cron Integration

- [ ] **Task 15:** Update `web/scripts/nightly-clevel-review.mjs`
  - [ ] Add scenario loop (bear, base, bull)
  - [ ] For each scenario:
    - [ ] Modify prompt context with scenario assumptions
    - [ ] Call Claude API
    - [ ] Store in `clevel_reports_v2` with scenario=bear/base/bull
  - [ ] Generate 12-week trend snapshots (append to `clevel_trend_snapshots`)
  - [ ] Update SVI index confidence multiplier (based on DCF credibility)
  - [ ] Send Telegram digest (aggregate all 5 roles × 3 scenarios)

- [ ] **Task 16:** Test cron on 100 projects (dry-run)
  - [ ] Dry-run: nightly-clevel-review.mjs --dry-run
  - [ ] Verify: all 300 reports would be generated (5 roles × 3 scenarios × 100 projects)
  - [ ] Verify: cost estimation is accurate
  - [ ] Verify: no failures

- [ ] **Task 17:** Deploy cron to production
  - [ ] Schedule: 2 AM Sydney time (UTC+10)
  - [ ] Monitor first run: check logs, verify report generation
  - [ ] Cost tracking: log API spend per startup
  - [ ] Alert setup: if any role fails on >10% of startups

### Phase 4 Completion Criteria

- [ ] Nightly cron runs successfully on production
- [ ] 30,000 reports generated (300 per hour, 5 roles × 3 scenarios)
- [ ] Cost <A$50/day (or budget approved)
- [ ] No regressions (existing reports still generate)

---

## Phase 5: Dashboard Integration (Days 22–25)

### Component Development

- [ ] **Task 18:** Build CFO Report Card component
  - [ ] Valuation breakdown (bear/base/bull with confidence)
  - [ ] Unit economics panel (LTV:CAC, CAC payback, margins, churn)
  - [ ] Runway & cash burn tracker
  - [ ] Top 3 actions (priority badges, owner, deadline)
  - [ ] Styling: Match BlockID design system (colors, fonts, spacing)

- [ ] **Task 19:** Build 12-Week Trend panel
  - [ ] Line charts: SVI score, ARR, Runway, Valuation
  - [ ] Data source: `GET /api/cron/clevel-review-v2/historical/[role]/[projectId]`
  - [ ] Interactivity: hover to see exact values, filter by scenario
  - [ ] Export: CSV button

- [ ] **Task 20:** Build Sensitivity Analysis table
  - [ ] 5 drivers × 3 scenarios = 15 data points
  - [ ] Color-coded by impact (red=high, yellow=medium, green=low)
  - [ ] Tooltip: explain each driver's business impact
  - [ ] Export: Excel / CSV button

- [ ] **Task 21:** Integration into dashboard
  - [ ] Add report card to `/dashboard/cfo` page
  - [ ] Add report card to `/dashboard/ceo` page
  - [ ] Add report card to `/dashboard/cmo` page
  - [ ] Add report card to `/dashboard/cdo` page
  - [ ] Add report card to `/dashboard/cto` page
  - [ ] Wire all cards to API routes
  - [ ] Test loading states + empty states

### Testing

- [ ] **Task 22:** UAT on staging with 50+ reports
  - [ ] Load test with 50 concurrent users
  - [ ] Responsive design (mobile, tablet, desktop)
  - [ ] Accessibility: keyboard nav, screen reader support
  - [ ] Cross-browser: Chrome, Firefox, Safari, Edge

### Phase 5 Completion Criteria

- [ ] All 5 report cards visible on dashboards
- [ ] 12-week trend panel updates weekly
- [ ] Sensitivity table exports correctly
- [ ] UAT pass rate >95%

---

## Phase 6: Investor Pack Integration (Days 26–28)

### Executive Summary Generation

- [ ] **Task 23:** Build `/api/investor-pack/executive-summary` endpoint
  - [ ] Request: project_id, format (json/pdf/markdown)
  - [ ] Pull latest reports (CFO base + CEO base)
  - [ ] Extract valuation consensus (median of bear/base/bull)
  - [ ] Extract go/no-go recommendation from CEO framework
  - [ ] Compute CAPITAL score from CEO report
  - [ ] Format as 1-page executive summary
  - [ ] Return structured JSON + markdown

- [ ] **Task 24:** PDF generation
  - [ ] Use puppeteer or similar to generate PDF
  - [ ] Include: valuation table, risks, next steps, metrics
  - [ ] Branding: BlockID header/footer
  - [ ] Add disclaimer: "Illustrative only, not financial advice"

- [ ] **Task 25:** Wire to investor pack UI
  - [ ] `/investor-pack/[projectId]/download` endpoint
  - [ ] Button: "Download Executive Summary (PDF)"
  - [ ] Generated on-demand (not pre-cached)

### Testing

- [ ] **Task 26:** Test investor pack generation on 10 projects
  - [ ] Verify: valuation summary is accurate
  - [ ] Verify: go/no-go recommendation makes sense
  - [ ] Verify: PDF renders correctly (no layout breaks)
  - [ ] Verify: no real startup names appear (compliance check)

### Phase 6 Completion Criteria

- [ ] Executive summary API endpoint working
- [ ] PDF generation working
- [ ] Investor pack integration complete
- [ ] Compliance review passed (no real company names)

---

## Phase 7: Testing & QA (Days 29–30)

### Comprehensive Testing

- [ ] **Task 27:** Full regression test suite
  - [ ] Run all 40+ sensitivity engine tests
  - [ ] Run all API endpoint tests (happy path + edge cases)
  - [ ] Run nightly cron on 100 projects
  - [ ] Verify historical trend tracking works (12 weeks)

- [ ] **Task 28:** Performance testing
  - [ ] Single report generation: <10 sec (Claude API latency)
  - [ ] Batch 100 reports: <15 min total
  - [ ] Dashboard load: <2 sec (with 50 historical weeks)
  - [ ] API response time: <500ms

- [ ] **Task 29:** UAT with 5 founder accounts
  - [ ] Run nightly reports on their live startups
  - [ ] Collect feedback on report quality, actionability
  - [ ] Verify no PII leaks
  - [ ] Compliance: all real company names anonymized

- [ ] **Task 30:** Security review
  - [ ] RLS policies enforce (founders can't see others' reports)
  - [ ] API auth: user must own project to view reports
  - [ ] No SQL injection vulnerabilities
  - [ ] No XSS in markdown rendering

### Phase 7 Completion Criteria

- [ ] All tests pass (0 critical bugs)
- [ ] Performance benchmarks met
- [ ] UAT feedback incorporated
- [ ] Security audit clean

---

## Success Metrics (Acceptance Criteria)

### Launch Readiness

- [ ] **DCF Accuracy:** Valuation r > 0.7 with actual raises (within 6 months post-launch)
- [ ] **Report Depth:** 5000–7000 words (vs current ~2000)
- [ ] **Actionability:** 70% of CFO action items adopted by founders (survey at 30 days post-launch)
- [ ] **Trend Tracking:** 90% of 12-week comparisons show meaningful deltas (SVI/runway/ARR/valuation)
- [ ] **Advisory Quality:** Report satisfaction score 4.2+ (vs current 3.8, 5-point scale)
- [ ] **Nightly Cron:** 99.5% success rate, <60 min to run all startups
- [ ] **Cost Control:** <A$50/day API costs (averaged over first 30 days)

### Business Metrics

- [ ] **SVI Confidence Boost:** Reports with DCF get 1.2x confidence multiplier (vs reports without)
- [ ] **Investor Pack Adoption:** 50%+ of founders download executive summary
- [ ] **Dashboard Engagement:** 70%+ of users view report cards weekly
- [ ] **Support Tickets:** Decrease in "what's my valuation?" questions by 40%

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Claude API rate limit exceeded | Medium | High | Queue jobs, implement backoff retry, add cache layer |
| DCF accuracy concerns from founders | Medium | High | Publish validation doc (r > 0.7), add disclaimer, 3-scenario range not point estimate |
| Database schema migration fails | Low | Critical | Test on staging first, have rollback plan, backup before apply |
| Nightly cron takes >1 hour | Medium | Medium | Parallelize by role, add progress logging, alert if >45 min |
| Dashboard performance degrades | Medium | Medium | Pre-compute trend snapshots, cache API responses (1 hour TTL) |
| Compliance issue: real company names in benchmarks | Low | Critical | Mandatory anonymization check in code review, automated linter rule |

---

## Deliverables Checklist

- [x] **Design Doc** (2000+ words) — `/DESIGN_CLEVEL_DCF_INTEGRATION.md`
- [x] **Database Schema** (SQL) — `/web/supabase/migrations/20260816_clevel_reports_v2.sql`
- [x] **TypeScript Skeleton** (sensitivity engine) — `/web/src/lib/agents/clevel-sensitivity-engine.ts`
- [x] **Test Scenarios** (40+ cases) — `/web/src/lib/agents/clevel-sensitivity-engine.test.ts`
- [ ] **Enhanced Prompts** (5 roles, 3000–5000 words each)
  - [ ] CFO prompt — `/web/scripts/lib/clevel-prompts/cfo.md`
  - [ ] CEO prompt — `/web/scripts/lib/clevel-prompts/ceo.md`
  - [ ] CMO prompt — `/web/scripts/lib/clevel-prompts/cmo.md`
  - [ ] CDO prompt — `/web/scripts/lib/clevel-prompts/cdo.md`
  - [ ] CTO prompt — `/web/scripts/lib/clevel-prompts/cto.md`
- [ ] **API Routes** (2 endpoints)
  - [ ] `POST /api/cron/clevel-review-v2/generate`
  - [ ] `GET /api/cron/clevel-review-v2/historical/[role]/[projectId]`
- [ ] **Dashboard Components** (5 report cards + trend panels)
- [ ] **Investor Pack Integration** (executive summary + PDF)
- [ ] **Nightly Cron Update** — Enhanced `nightly-clevel-review.mjs`

---

## Timeline Summary

| Phase | Days | Deliverables | Owner |
|-------|------|--------------|-------|
| **1: Prompts** | 1–7 | 5 expanded prompts (1200–2000 words each) | Prompt Engineer |
| **2: DCF + Sensitivity** | 8–14 | TS module + 40+ tests, validated | Senior Engineer |
| **3: Database & API** | 15–18 | Migration + 2 API routes, tested | Backend Engineer |
| **4: Nightly Cron** | 19–21 | Enhanced cron script, monitored | DevOps/Backend |
| **5: Dashboard** | 22–25 | 5 report cards + trend panels | Frontend Engineer |
| **6: Investor Pack** | 26–28 | Executive summary + PDF generation | Backend/Frontend |
| **7: Testing & QA** | 29–30 | Full regression + UAT + security review | QA Lead |

**Total Effort:** 30 engineer-days (4 FTE weeks, or 1 FTE month)  
**Team:** 1 Prompt Engineer + 2 Backend Engineers + 1 Frontend Engineer + 1 QA Lead

---

## Go/No-Go Decision Criteria

### Go if:
- [ ] All prompts pass peer review (no hallucinations)
- [ ] DCF accuracy r > 0.85 on hand-calced examples
- [ ] All 40+ tests pass
- [ ] API response time <500ms
- [ ] UAT feedback score >4.0/5.0

### No-Go if:
- [ ] DCF accuracy <0.7 (too much variance)
- [ ] Nightly cron fails on >5% of startups
- [ ] Dashboard performance <1 FPS (janky)
- [ ] Compliance audit finds real company names in reports

---

## Post-Launch Monitoring

### Week 1
- [ ] Monitor nightly cron: 99.5%+ success rate
- [ ] Track API costs: budget <A$50/day
- [ ] Check logs for LLM failures, timeout patterns
- [ ] Early founder feedback (survey 5 users)

### Week 2–4
- [ ] Collect 50+ founder feedback responses
- [ ] Analyze report satisfaction score (target 4.2+)
- [ ] Track % of action items adopted
- [ ] Measure SVI confidence multiplier effect

### Month 2
- [ ] Validate DCF accuracy (correlate midpoint vs actual raises)
- [ ] Optimize prompt based on feedback
- [ ] Add to product tour for new founders
- [ ] Plan Phase 2 features (e.g., sensitivity wizard)

---

**Sign-off:** Ready for Engineering Intake (Design approved on 2026-08-16)

