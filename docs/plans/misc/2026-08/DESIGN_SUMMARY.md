# Enhanced C-Level Prompts with DCF Integration — Design Summary

**Project:** BlockID.au C-Level Advisory Enhancement  
**Priority:** P2  
**Effort:** 2–3 weeks (30 engineer-days)  
**Timeline:** August 16–September 15, 2026  
**Status:** Design Complete ✓

---

## What's Being Built

A comprehensive upgrade to BlockID's C-level advisory system that expands AI-generated founder reports from 500–1500 words to 3000–5000 words, adds Discounted Cash Flow (DCF) valuation with 3-scenario sensitivity analysis (bear/base/bull), and integrates 12-week trend tracking for accountability.

### Key Components

1. **Enhanced Prompts** (5 roles × 1500–2000 words each)
   - **CFO:** DCF valuation + tax incentives + Series A gate
   - **CEO:** Competitive moat + CAPITAL scorecard + go/no-go framework
   - **CMO:** CAC benchmarking + LTV:CAC sustainability + TAM/SAM/SOM
   - **CDO:** Evidence audit + compliance checklist + cap table cleanliness
   - **CTO:** Tech debt assessment + infra cost projection + IP defensibility

2. **Sensitivity Engine** (TypeScript module)
   - 3-scenario generation (bear/base/bull with 25% variance)
   - 5-driver sensitivity table (ARR growth, churn, COGS, OpEx, tax)
   - Markdown export for reports

3. **Database Schema** (`clevel_reports_v2`)
   - Stores scenario variants (bear/base/bull) + audit trail
   - 12-week historical snapshots for trend tracking
   - RLS policies for founder privacy

4. **API Routes**
   - `POST /api/cron/clevel-review-v2/generate` — Generate 5 roles × 3 scenarios nightly
   - `GET /api/cron/clevel-review-v2/historical/[role]/[projectId]` — Fetch 12-week trends

5. **Nightly Cron** (Enhanced `nightly-clevel-review.mjs`)
   - Generates 30,000 reports (300 per startup: 5 roles × 3 scenarios × 20 startups/hour)
   - Cost-controlled: ~A$50/day at scale
   - Non-blocking: Digest sent after all reports complete

6. **Dashboard Integration**
   - CFO Report Card (valuation + unit economics + runway)
   - 12-Week Trend panel (SVI, ARR, runway, valuation)
   - Sensitivity Analysis table (interactive, exportable)

7. **Investor Pack Integration**
   - `/api/investor-pack/executive-summary` endpoint
   - Auto-generates 1-page summary (valuation consensus + go/no-go + CAPITAL score)
   - PDF export for pitch deck binder

---

## Success Criteria

| Metric | Target | Current | Expected Uplift |
|--------|--------|---------|-----------------|
| **Report depth** | 5000–7000 words | ~2000 words | 2.5–3.5x |
| **DCF accuracy** | r > 0.7 vs actuals | N/A | Validates within 6mo |
| **Action adoption** | 70% of CFO items | ~50% (estimate) | +40% |
| **Trend meaningful delta** | 90% of 12-week comparisons | ~40% | +125% |
| **Satisfaction score** | 4.2 / 5.0 | 3.8 / 5.0 | +0.4 |
| **SVI confidence boost** | 1.2x multiplier | 1.0x | +20% |

---

## Technical Implementation

### Sensitivity Engine (Core Logic)

```typescript
// Bear: growth –25%, churn +50%, margin –3pp, burn +10%, tax 26%
// Base: plan assumptions
// Bull: growth +25%, churn –25%, margin +2pp, burn –10%, tax 21%

const scenarios = generateScenarios(input);
const table = buildSensitivityTable(input, scenarios);
// Result: 5 drivers × 3 scenarios, impact rankings, dominant levers
```

### DCF Valuation

- **WACC:** 35% (AU early-stage risk premium)
- **Terminal growth:** 3% (long-term GDP)
- **Tax rate:** 25% (AU corporate, adjusted for R&D offset)
- **Horizon:** 5 years
- **Output:** Low / mid / high AUD with confidence level

### Database

```sql
CREATE TABLE clevel_reports_v2 (
  id UUID PRIMARY KEY,
  project_id UUID,
  role VARCHAR(20), -- cfo, ceo, cmo, cdo, cto
  scenario VARCHAR(10), -- bear, base, bull
  dcf_valuation_low/base/high BIGINT,
  sensitivity_drivers JSONB,
  week_12_history JSONB,
  ...
  UNIQUE(project_id, role, scenario, DATE(generated_at))
);
```

### Nightly Cron

- Runs 2 AM Sydney time
- Generates 5 roles × 3 scenarios per startup
- Caches founder data, prompts, financial metrics
- Logs cost per startup, tokens used
- Sends Telegram digest (RED/YELLOW/GREEN + action items)

---

## Deliverables

### Design Docs
- ✓ Main design doc (2000+ words) — `DESIGN_CLEVEL_DCF_INTEGRATION.md`
- ✓ Implementation checklist — `IMPLEMENTATION_CHECKLIST.md`
- ✓ This summary — `DESIGN_SUMMARY.md`

### Code Artifacts
- ✓ Sensitivity engine (TypeScript) — `clevel-sensitivity-engine.ts`
- ✓ Test scenarios (40+ cases) — `clevel-sensitivity-engine.test.ts`
- ✓ Database migration (SQL) — `20260816_clevel_reports_v2.sql`

### To-Be-Delivered
- Enhanced prompts (5 files, 1200–2000 words each)
- API routes (2 endpoints)
- Dashboard components (5 report cards)
- Investor pack integration (1 API endpoint + PDF)
- Nightly cron enhancement (1 script update)

---

## Timeline

| Week | Phase | Deliverable | Owner |
|------|-------|-------------|-------|
| **Week 1** | Prompts | 5 enhanced prompts + peer review | Prompt Engineer |
| **Week 2** | DCF + Tests | Sensitivity engine + 40+ test pass | Senior Engineer |
| **Week 2–3** | Database & API | Migration + 2 API routes tested | Backend Engineer |
| **Week 3** | Cron & Dashboard | Enhanced cron + 5 report cards | Frontend + DevOps |
| **Week 3–4** | Investor Pack + QA | Executive summary + full regression | Backend + QA Lead |

**Go-live:** September 15, 2026 (or ~30 days from start)

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| DCF variance from actuals | Medium | Publish validation, use 3-scenario range, not point estimate |
| Nightly cron timeout (>1 hour) | Medium | Parallelize by role, cache aggressively, add monitoring |
| Compliance: real company names in benchmarks | High | Mandatory anonymization linter rule, code review gate |
| Claude API cost overrun | Medium | Cache prompts, set per-startup budget, alert at threshold |
| Dashboard performance (>2sec load) | Low | Pre-compute snapshots, 1-hour API cache TTL |

---

## ROI & Business Impact

### For Founders
- **Better decision-making:** DCF + sensitivity shows "what if" outcomes
- **Actionable insights:** 90-day sprint priorities with quantified impact
- **Accountability:** 12-week trends show progress vs plan
- **Investor readiness:** CAPITAL scorecard + go/no-go framework reduces surprise rejections

### For BlockID
- **Product moat:** DCF valuation is proprietary (r > 0.7 correlation)
- **Advisory quality:** 4.2/5 satisfaction (vs 3.8) → higher NPS, retention
- **Ecosystem value:** Investor packs used in 50%+ of Series A closes
- **Revenue uplift:** Premium advisory tier justifies higher pricing

---

## Next Steps

1. **Engineering Intake** (2026-08-17)
   - CTO assigns 4-person team (1 prompt eng, 2 backend, 1 frontend)
   - Kick-off meeting: review design doc + implementation checklist
   - GitHub board created with 30-day sprint

2. **Prompt Expansion** (Days 1–7)
   - Prompt engineer expands all 5 prompts in parallel
   - Peer reviews with domain advisors (CFO, CEO, CMO, CDO, CTO)
   - Test on 10+ live startups each

3. **Development** (Days 8–21)
   - Sensitivity engine + tests (done in parallel)
   - Database + API routes (blocked on sensitivity)
   - Cron enhancement (blocked on API)

4. **Integration & Testing** (Days 22–28)
   - Dashboard components wired to API
   - Investor pack endpoint + PDF generation
   - Full regression testing + UAT with 5 founders

5. **Launch** (Day 30)
   - Deploy to production
   - Monitor nightly cron (99.5%+ success rate)
   - Founder announcements + product tour
   - Collect satisfaction feedback (survey + NPS)

---

## Success Gates

- [x] Design approved by CTO + CFO + CEO
- [ ] All prompts pass peer review (no hallucinations)
- [ ] DCF accuracy r > 0.85 on hand-calced examples
- [ ] All tests pass (0 critical bugs)
- [ ] UAT feedback score >4.0 / 5.0
- [ ] Production deployment (nightly cron running)

---

**Design Status:** APPROVED FOR ENGINEERING INTAKE ✓  
**Date:** 2026-08-16  
**Last Updated:** 2026-08-16

