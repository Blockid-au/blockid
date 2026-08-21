# BlockID.au Startup Quality Upgrade — Master Implementation Plan

**Version:** 1.0  
**Status:** Ready for Execution  
**Start Date:** 2026-08-16 (Week 1)  
**Target Completion:** Week 8 (2026-10-04)

---

## EXECUTIVE SUMMARY

**Goal:** Deliver 5 startup quality features across 8 weeks to improve founder experience and investor confidence in startup valuation/funding readiness.

**Features (Phased):**
1. ✅ **Revenue Forecast + Unit Economics** (v3.6.9, Week 2) — 36-mo projection, cash runway, breakeven
2. ✅ **Exit Strategy + Cap Table Dilution** (v3.7.0, Week 4) — exit scenarios, acquirer matching, founder payouts
3. ✅ **Competitive Positioning Scaffolding** (v3.7.0, Week 4) — feature matrix, positioning generator, GTM context
4. 🔄 **SVI Evidence Completeness %** (v3.7.1, Week 5) — dimension transparency, fix roadmap, heatmap
5. 🔄 **Enhanced C-Level Prompts (DCF)** (v3.8.0, Week 8) — 3-scenario valuation, sensitivity tables, 12-week trends

**Timeline:** 8 weeks | **Effort:** 67.5 person-days | **Team:** 2 FTE | **Parallel Workstreams:** 3

**ROI Estimate:** 
- 15% founder engagement lift (forecast adoption)
- 25% investor pack quality improvement (exit clarity + competitive positioning)
- 40% SVI accuracy improvement (evidence completeness)
- 15.5x ROI (exit strategy feature alone: $240K annual revenue upsell vs $15.5K cost)

---

## 📋 WEEK 1 SPRINT: Revenue Forecast Builder (Execution Starts Now)

### Objective
Ship backend + frontend for Revenue Forecast Builder. Founder can input historical metrics + assumptions → get 36-month projection with cash runway, breakeven, Series A readiness check.

### Timeline
- **Day 1-2 (Mon-Tue):** Backend foundation (DB, API, calc engine, 20 tests)
- **Day 3-4 (Wed-Thu):** Frontend + integration (wizard, results panel, PDF, 15 tests)
- **Day 5 (Fri):** Testing + deployment prep (CI gates, docs, ready for v3.6.9 staging)

### Day-by-Day Checklist

#### Day 1: Database & Core Engine
**Morning:**
- [ ] Create migration `20260824_financial_forecasts.sql`
  - Table: `financial_models` (22 fields: project_id, model_type, current_arr, monthly_growth_pct, churn_pct, cogs_pct, opex_monthly, tax_scenario, scenario_name, created_by_user_id, updated_at, + 10 cached metrics as JSONB)
  - Table: `forecast_scenarios` (forecast_id, scenario_name, bear/base/bull variants, cached_projection_json)
  - RLS: Only project owner can read/write their forecasts
  - Indices: (project_id, created_at), (project_id, scenario_name)

- [ ] Add RLS policies to `financial_models` and `forecast_scenarios` tables
  - `INSERT/UPDATE/DELETE/SELECT` require `auth.uid() = created_by_user_id` (via projects table)

**Afternoon:**
- [ ] Create `src/lib/forecast-builder.ts` — Core calculation engine
  - Export `computeProjection(input: ForecastBuilderInput): ProjectionOutput`
  - Input: { modelType, currentArr, growthRate%, churnRate%, cogsRate%, opexMonthly, taxScenario, scenarioName }
  - Output: { months: [{month, arr, cashFlow, runway, breakeven}], finalMetrics: {totalRaised, runway, breakeven_month} }
  - Logic: Deterministic (no randomness), S-curve growth decay, OpEx escalation, RDTI tax offsets
  - Tests: 20 unit tests (growth curves, tax offsets, runway calc, edge cases)

**Evening:**
- [ ] Run local tests: `npx vitest run src/lib/forecast-builder.test.ts`
- [ ] Verify migration runs locally: `npx supabase migration up`

#### Day 2: API Routes
**Morning:**
- [ ] Create `src/app/api/financial/forecast/generate/route.ts` (POST)
  - Accepts: `{ projectId, modelType, currentArr, growthRate, churnRate, cogsRate, opexMonthly, taxScenario }`
  - Returns: `{ ok: boolean, projection: ProjectionOutput, id: forecast_id }`
  - Auth: `getCurrentUser()` required; check project ownership
  - Stores result in DB for reuse

- [ ] Create `src/app/api/financial/forecast/[projectId]/route.ts` (GET/PUT/DELETE)
  - GET: Returns list of forecasts for project + latest snapshot
  - PUT: Update forecast scenario name or assumptions
  - DELETE: Archive forecast (soft-delete for audit trail)

**Afternoon:**
- [ ] Create response type stubs: `src/types/financial.ts`
  - Export types: `ForecastBuilderInput`, `ProjectionOutput`, `ProjectionMonth`, `ForecastScenario`

- [ ] Write API tests: 15 unit tests
  - Happy path: create forecast, fetch, update, delete
  - Auth: verify unauthenticated requests fail
  - Validation: verify invalid growth rates rejected

**Evening:**
- [ ] Run API tests locally: `npx vitest run src/app/api/financial/forecast/**/*.test.ts`

#### Day 3: Frontend Components
**Morning:**
- [ ] Create `src/components/financial/revenue-forecast-builder.tsx` — 4-step wizard
  - Step 1: Model type selector (SaaS/Marketplace/Agency/Hardware)
  - Step 2: Historical data (Current ARR, Monthly Growth %, Churn %)
  - Step 3: Cost structure (COGS %, Monthly OpEx, Fixed Costs)
  - Step 4: Scenario name + submit
  - UI: Progress bar, auto-save after each step, clear validation

- [ ] Create `src/components/financial/forecast-results-panel.tsx` — Results dashboard
  - Table: 36-month projection (month, ARR, cash flow, runway days)
  - Cards: 3 KPIs (Breakeven month, Cash runway, Series A readiness)
  - Chart: ARR growth curve (Chart.js)
  - Actions: Save forecast, export CSV, share link

**Afternoon:**
- [ ] Create `src/app/(app)/(founder)/workspace/financial-forecasts/page.tsx` — Workspace page
  - List: All forecasts for project (created date, scenario name, latest metrics)
  - Actions: New forecast, rename, delete, download CSV
  - Tile integration: Link to latest forecast from dashboard

- [ ] Wire SVI scoring: Update SVI report to reflect FIN dimension
  - FIN dimension: +15–30 points if forecast completed (based on profitability evidence)
  - TRE dimension: +20 points if revenue assumptions substantiated

**Evening:**
- [ ] Integration test: Form → API call → DB save → Results display
  - Verify form data flows through to calculation
  - Verify results render with data

#### Day 4: Investor Pack Integration & Polish
**Morning:**
- [ ] Extend investor pack PDF: Add "Revenue Forecast" section
  - Call: `buildFinancialForecastSection(projectId)` → generates summary table + 3 scenarios
  - PDF template: 1-page summary (36-mo table condensed + 3 KPI callouts)
  - Integration: Auto-include in investor pack if forecast exists

- [ ] Component polish: error handling, loading states, accessibility
  - Wizard: disable submit until all required fields complete
  - Results: show "Loading..." while calculation in progress
  - Fallback: if API errors, show clear message + retry button

**Afternoon:**
- [ ] Write integration tests (15 tests)
  - Full flow: form input → calculation → PDF render
  - Edge cases: zero growth, 100% churn, negative burn
  - Regression: existing investor pack PDFs still work

- [ ] Playwright smoke test setup: `/tests/e2e/smoke/financial-forecast.spec.ts`
  - Test: load workspace → create forecast → verify table renders → export CSV
  - Target: <8 seconds end-to-end

**Evening:**
- [ ] Run full test suite locally: `npx vitest run` (27,533+ tests must pass)

#### Day 5: Testing, Docs, Deployment Prep
**Morning:**
- [ ] Full Playwright smoke test suite
  - `npx playwright test tests/e2e/smoke/financial-forecast.spec.ts`
  - Verify: load workspace → create forecast → results display → export CSV
  - Verify: results visible in investor pack

- [ ] TypeScript check: `npx tsc --noEmit`
  - Zero errors required

- [ ] ESLint: `npx eslint src/components/financial src/lib/forecast-builder.ts src/app/api/financial`
  - Zero warnings required

**Afternoon:**
- [ ] Update version: `web/content/reports/version.json`
  - version: "v3.6.9"
  - shipped_summary: Add "Revenue Forecast Builder (36-mo projection, cash runway, Series A readiness)"

- [ ] Write CHANGELOG: Add feature description + user instructions
- [ ] Create feature flag (optional): `FEATURE_FORECAST_BUILDER=true` for gradual rollout

- [ ] Staging deployment checkpoint
  - All 11 CI gates passing on staging
  - Smoke test passes on staging.blockid.au
  - Ready for v3.6.9 prod deploy

**Evening:**
- [ ] PR ready for merge to main
  - Title: `feat(financial): Revenue Forecast Builder + unit economics (v3.6.9)`
  - Description: Links to all design docs, migration guide, test results
  - Branch: `feature/revenue-forecast-builder`

---

## 🏗️ COMPLETE FEATURE BREAKDOWN

### Feature 1: Revenue Forecast Builder (Weeks 1-2, P1)
**Files to Create/Modify:**
```
NEW:
  src/lib/forecast-builder.ts (250 lines, pseudocode + calc logic)
  src/lib/forecast-builder.test.ts (20 tests)
  src/app/api/financial/forecast/generate/route.ts (API endpoint)
  src/app/api/financial/forecast/[projectId]/route.ts (CRUD)
  src/components/financial/revenue-forecast-builder.tsx (4-step wizard)
  src/components/financial/forecast-results-panel.tsx (results dashboard)
  src/app/(app)/(founder)/workspace/financial-forecasts/page.tsx (workspace page)
  src/types/financial.ts (TypeScript types)
  tests/e2e/smoke/financial-forecast.spec.ts (Playwright)
  supabase/migrations/20260824_financial_forecasts.sql (DB schema)

MODIFY:
  src/lib/investor-pack-assembler.ts (add forecast section)
  src/lib/svi-analysis.ts (FIN dimension scoring)
  src/app/(app)/(founder)/dashboard/page.tsx (add forecast tile)
```

**Design Docs Reference:** `REVENUE_FORECAST_*.md` (6 files, 119 KB)
**API Specs:** `REVENUE_FORECAST_API_EXAMPLES.md`
**Test Scenarios:** 9 scenarios in design doc

**Success Metrics:**
- 15% founder adoption (forecast creation) within 2w of launch
- 40% of investor packs include forecast section
- <5 min to generate forecast
- Accuracy: founder assumptions within p25–p75 of AU cohort data

---

### Feature 2 & 3: Exit Strategy + Competitive Positioning (Weeks 2-4, P1)
**Combined Delivery:** v3.7.0 (Week 4)

**Exit Strategy** — Cap table dilution scenarios, acquirer matching, founder payouts
- Files: 15+ (DB, 4 APIs, 5 components, 3 migrations, tests)
- Effort: 14 person-days
- Design: `EXIT_STRATEGY_*.md` (9 files, 134 KB)

**Competitive Positioning** — Feature matrix, positioning generator, GTM context
- Files: 10+ (DB, 4 APIs, 5 components, 1 migration, tests)
- Effort: 6 person-days
- Design: `COMPETITIVE_POSITIONING_*.md` (6 files, 120 KB)

**Combined Success Metrics:**
- 25% exit planning adoption
- 30% competitive analysis adoption
- Exit scenarios accurately model dilution (compare vs Carta)
- Positioning statements 60%+ adopted without edit

---

### Feature 4: SVI Evidence Completeness (Week 4-5, P2)
**Status:** Design in progress (Agent 5)
**Expected:** 2 design docs + schema + tests (by EOD)
**Effort:** 9 person-days
**Delivery:** v3.7.1 (Week 5)

---

### Feature 5: Enhanced C-Level Prompts (Weeks 5-7, P2)
**Status:** Design in progress (Agent 6)
**Expected:** 2 design docs + prompt skeleton + sensitivity engine (by EOD)
**Effort:** 15 person-days
**Delivery:** v3.8.0 (Week 8)

---

## 🔗 INTEGRATION ARCHITECTURE

### Data Flow
```
Founder Input (Forecast)
  ↓
API /financial/forecast/generate
  ↓
forecast-builder.ts (deterministic calc)
  ↓
DB: financial_models, forecast_scenarios
  ↓
Workspace tile displays latest forecast
  ↓
SVI FIN dimension +15–30 pts
  ↓
Investor pack auto-includes "Revenue Forecast" section
  ↓
Founder pasts to investors → improved confidence
```

### Database Relationships
```
projects
  ├─ financial_models (1:N, project can have multiple forecasts)
  │   └─ forecast_scenarios (1:N, forecast can have bear/base/bull variants)
  ├─ exit_plans (1:1, one exit strategy per project)
  │   └─ dilution_scenarios (1:N, series A/B/C projections)
  └─ competitors (1:N, multiple competitors tracked)
      └─ competitor_features (1:N, feature-by-feature matrix)
```

### Investor Pack PDF Flow
```
investor-pack-assembler.ts calls:
  ├─ buildSviSection()
  ├─ buildValuationSection()
  ├─ buildFinancialForecastSection() ← NEW (Week 2)
  ├─ buildExitStrategySection() ← NEW (Week 4)
  ├─ buildCompetitivePositioningSection() ← NEW (Week 4)
  ├─ buildEvidenceCompletenessSection() ← NEW (Week 5)
  └─ buildCLevelInsightsSection() ← NEW (Week 8)

Result: 20+ page investor pack with all startup quality signals
```

---

## 📊 8-WEEK DEPLOYMENT SCHEDULE

### Week 1 (Aug 16-22): Revenue Forecast Backend
- Mon-Fri: Forecast builder implementation (backend + API)
- Status: CI gates, 27,533 tests pass
- Deliverable: Ready for Week 2 frontend merge

### Week 2 (Aug 23-29): Revenue Forecast v3.6.9 SHIP
- Mon-Thu: Frontend + investor pack integration
- Fri: v3.6.9 ships to production (11/11 gates ✅)
- Parallel: Exit Strategy implementation begins

### Week 3 (Aug 30-Sep 5): Exit + Competitive
- Mon-Fri: Exit dilution calc + competitor matrix build
- Status: 110+ new tests passing
- Deliverable: Ready for Week 4 UI merge

### Week 4 (Sep 6-12): Exit + Competitive v3.7.0 SHIP
- Mon-Thu: Exit wizard UI + competitive positioning gen
- Fri: v3.7.0 ships to production (11/11 gates ✅)
- Parallel: SVI Evidence implementation + P2 agents deliver designs

### Week 5 (Sep 13-19): SVI Evidence v3.7.1 SHIP
- Mon-Thu: Evidence completeness heatmap + fix roadmap
- Fri: v3.7.1 ships to production (11/11 gates ✅)
- Parallel: C-Level prompt enhancement begins

### Weeks 6-7 (Sep 20-Oct 3): C-Level Enhancement
- Mon-Fri (both weeks): DCF calc + 5 prompts + sensitivity tables + trend API
- Status: 160+ new tests passing
- Deliverable: Ready for Week 8 polish

### Week 8 (Oct 4-10): C-Level v3.8.0 SHIP
- Mon-Wed: Final integration + trend dashboard
- Thu: v3.8.0 ships to production (11/11 gates ✅)
- Fri: All 5 features fully shipped + documented

---

## 🎯 SUCCESS METRICS (Per Feature)

### Revenue Forecast (v3.6.9)
- [ ] 15% active founder adoption (forecast creation) within 2w
- [ ] 40% of generated investor packs include forecast section
- [ ] Avg founder assumptions within p25–p75 of AU cohort data
- [ ] <5 min to generate forecast
- [ ] 4.0+ star rating from founders who use it

### Exit Strategy (v3.7.0)
- [ ] 25% founder adoption (exit planning form)
- [ ] Acquirer suggestions match real AU M&A targets (verified vs PitchBook)
- [ ] 100% of scenarios include shareholder/preference data
- [ ] Dilution calculations accurate within ±0.5% (vs manual audit)
- [ ] 85% of founders complete roadmap after exit planning

### Competitive Positioning (v3.7.0)
- [ ] 30% founder adoption (add ≥3 competitors)
- [ ] 85% feature extraction accuracy (confidence scores >0.75)
- [ ] 60% of positioning statements adopted without edit
- [ ] <8 min to complete competitive analysis
- [ ] 4.2+ star rating for positioning quality

### SVI Evidence Completeness (v3.7.1)
- [ ] Evidence % accurate within ±5 points (vs manual audit)
- [ ] 40% of founders implement ≥1 roadmap item within 4w
- [ ] Startups following roadmap see +25 SVI points in 12w
- [ ] Completeness % shown to 85%+ of founders
- [ ] Roadmap adoption rate >60%

### C-Level Prompts v2 (v3.8.0)
- [ ] Report depth: 5000–7000 words (vs current ~2000)
- [ ] DCF accuracy: r > 0.7 correlation with actual AU raises
- [ ] 70% of CFO action items adopted by founders
- [ ] 12-week trend tracking with <1s API latency
- [ ] Satisfaction: 4.2+ (vs current 3.8)

---

## 🚀 IMMEDIATE ACTION ITEMS

### For Engineering Team
1. **Assign Week 1 sprint owner** (2 FTE, Mon-Fri)
2. **Create feature branch:** `feature/revenue-forecast-builder`
3. **Review design docs:** `REVENUE_FORECAST_*.md` (read first)
4. **Start Day 1:** Database migration + calc engine
5. **Daily standup:** Report progress on sprint checklist above

### For Product Team
1. **Review all 4 feature designs** (Revenue, Exit, Competitive, Evidence)
2. **Validate founder user journeys** (wizard flows, results layouts)
3. **Plan GTM:** Feature announcement, in-app education, email sequence
4. **Collect founder feedback:** Closed beta (Week 3) before v3.7.0 launch

### For QA Team
1. **Prepare test scenarios:** Copy from design docs (9 + 3 + 50+ + 20+ test cases per feature)
2. **Set up Playwright:** Smoke tests for each new page/workflow
3. **Regression plan:** Ensure existing investor pack PDF still works
4. **Performance**: Ensure new components load <2s

### For Design/UX Team
1. **Review wireframes** in design docs (ASCII mockups provided)
2. **Polish UI:** Component polish, accessibility (WCAG A), mobile responsiveness
3. **Gather feedback:** Founder usability testing Week 3 (before v3.7.0)

---

## 📚 DESIGN DOCUMENTATION INDEX

**All design docs available in:** `/home/dovanlong/blockid.au/`

### Revenue Forecast (Complete)
- `REVENUE_FORECAST_DESIGN.md` — Full spec
- `REVENUE_FORECAST_IMPLEMENTATION.md` — Engineering guide
- `REVENUE_FORECAST_QUICK_REFERENCE.md` — Product overview
- `REVENUE_FORECAST_API_EXAMPLES.md` — API + test suite
- `REVENUE_FORECAST_SUMMARY.txt` — Navigation guide

### Exit Strategy (Complete)
- `EXIT_STRATEGY_README.md` — Index
- `EXIT_STRATEGY_EXECUTIVE_SUMMARY.md` — Business case
- `EXIT_STRATEGY_DESIGN.md` — Full spec (973 lines)
- `EXIT_STRATEGY_IMPLEMENTATION_CHECKLIST.md` — 21-day plan
- `EXIT_STRATEGY_TEST_SCENARIOS.md` — 3 concrete test cases
- `exit-strategy.helpers.SKELETON.ts` — TypeScript skeleton

### Competitive Positioning (Complete)
- `COMPETITIVE_POSITIONING_DESIGN.md` — Full spec (1251 lines)
- `COMPETITIVE_POSITIONING_IMPLEMENTATION_CHECKLIST.md` — 5-phase plan
- `COMPETITIVE_POSITIONING_TEST_SCENARIOS.md` — 300+ test cases
- `competitive-positioning-feature.sql` — Production migration
- `competitive-positioning.ts` — TypeScript library

### SVI Evidence Completeness (In Progress)
- Agent 5 completing design (ETA: EOD 2026-08-16)
- Deliverables: Data model, heatmap component, fix roadmap logic

### C-Level Prompts v2 (In Progress)
- Agent 6 completing design (ETA: EOD 2026-08-16)
- Deliverables: DCF engine, 5 prompt enhancements, sensitivity table, trend API

---

## 🛡️ RISK MITIGATION

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Forecast calc accuracy variance | Medium | High | Use existing `financial-projections.ts` as reference; unit test against 50 hand-calced examples |
| Dilution calc errors | Medium | High | Deterministic tests + manual verification of 10 cap tables vs Carta |
| Founder UX friction (form abandonment) | Medium | Medium | 4-step wizard with progress bar, auto-save, fallback CSV import |
| PDF export breaks existing packs | Low | Medium | Component composition approach (no structural HTML changes) |
| DCF prompt hallucination | Medium | Medium | Deterministic inputs (financials, comps) constrain outputs; rule-based checks |
| CI gate failures (Gate 5 vitest) | Medium | Low | Run full test suite locally before pushes; revert if >5 gates fail |
| Deployment sequencing errors | Low | Medium | Deploy only when 11/11 gates pass; feature flags for gradual rollout |

---

## ✅ SIGN-OFF CHECKLIST

**Before v3.6.9 ships:**
- [ ] All 27,533+ tests pass
- [ ] TypeScript zero errors
- [ ] ESLint zero warnings
- [ ] Playwright smoke: load workspace → create forecast → export CSV
- [ ] Investor pack PDF includes forecast section
- [ ] SVI scoring wired (FIN +15–30, TRE +20)
- [ ] Docs updated
- [ ] Feature flag ready (if gradual rollout desired)

**Before v3.7.0 ships:**
- [ ] Exit strategy dilution calc verified (manual audit)
- [ ] Competitive positioning AI generates 3 options
- [ ] Founder payouts calculated with CGT hint
- [ ] Investor pack includes 2 new sections
- [ ] Dashboard tiles updated
- [ ] All 11 CI gates passing

**Before v3.7.1 ships:**
- [ ] Evidence completeness % accurate within ±5 points
- [ ] Fix roadmap prioritized by SVI impact
- [ ] Heatmap + roadmap components render
- [ ] SVI report includes evidence roadmap tab

**Before v3.8.0 ships:**
- [ ] DCF sensitivity analysis complete (3 scenarios × 5 drivers)
- [ ] All 5 C-level prompts expanded 8–10x
- [ ] 12-week trend API working
- [ ] Nightly cron generates reports without errors
- [ ] Investor pack includes C-level DCF summary

---

## 📞 SUPPORT & ESCALATION

**Questions on design?** Reference the design docs (read first; they answer 90% of questions)  
**Implementation blocker?** Create issue in GitHub with tag `startup-quality-upgrade`  
**Design dispute?** Schedule sync with product + architecture (decision within 24h)  
**Deployment issue?** Check 11-gate CI logs; revert if unsure

---

**End of Master Plan. Ready to execute Week 1 Revenue Forecast sprint.**

**Next milestone:** Wait for P2 agents (SVI Evidence, C-Level Prompts) to complete designs, then synthesize full 5-feature roadmap.
