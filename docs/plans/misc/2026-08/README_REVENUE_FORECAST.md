# Revenue Forecast + Unit Economics Builder (T0121)
## Complete Design Package — Production Ready

Welcome! This folder contains a complete, production-ready design for BlockID's Revenue Forecast + Unit Economics Builder feature (T0121). Everything you need to build, test, and ship this P1 feature in 2 weeks is here.

---

## What's Included

### 5 Core Design Documents (104 KB total)

1. **REVENUE_FORECAST_DESIGN.md** (40 KB) — **Read First**
   - Complete feature specification
   - Data model & SQL migration
   - Component wireframes & architecture
   - Calculation engine & formulas (pseudocode)
   - API route signatures (all 7 endpoints)
   - Dashboard & investor pack integration
   - SVI scoring impact
   - Validation rules & error handling
   - Test scenarios (9 edge cases)
   - Compliance & disclaimers
   - **Best for:** Technical leads, architects, backend engineers

2. **REVENUE_FORECAST_IMPLEMENTATION.md** (20 KB)
   - File structure & code organization
   - 7 key implementation files with complete code examples
   - Database migration script
   - Testing strategy (unit + E2E)
   - Performance checklist
   - Feature flag rollout plan
   - **Best for:** Frontend & backend engineers, QA

3. **REVENUE_FORECAST_QUICK_REFERENCE.md** (9.7 KB)
   - Feature overview (3-minute read)
   - User journey & happy path
   - Input/output fields
   - Scenario explanations (bear/base/bull)
   - Sector defaults (pre-filled values)
   - Integrations summary
   - FAQ (15 common questions)
   - Rollout checklist
   - **Best for:** Product managers, designers, non-technical stakeholders

4. **REVENUE_FORECAST_API_EXAMPLES.md** (20 KB)
   - All 7 API endpoints with real request/response examples
   - Error handling (400, 402, 429)
   - Complete Jest test suite
   - cURL testing cheatsheet
   - Postman collection (JSON)
   - **Best for:** API developers, QA engineers, integration testing

5. **REVENUE_FORECAST_SUMMARY.txt** (15 KB) — Navigation Guide
   - Executive overview
   - File index & quick lookup
   - Dependencies & tech stack
   - Success metrics
   - Rollout phases
   - **Best for:** Project managers, executives, quick reference

---

## Quick Navigation

| Role | Start Here | Then Read |
|------|-----------|-----------|
| **Backend Engineer** | DESIGN §1 (schema) | IMPLEMENTATION §1-3 |
| **Frontend Engineer** | DESIGN §2 (components) | IMPLEMENTATION §4-6 |
| **Full Stack** | DESIGN §1-7 | IMPLEMENTATION all |
| **Product Manager** | QUICK_REFERENCE | DESIGN §2, §4, §7 |
| **Designer/UX** | DESIGN §10 (wireframes) | QUICK_REFERENCE |
| **QA/Testing** | API_EXAMPLES | DESIGN §9 (test scenarios) |
| **DevOps/Ops** | SUMMARY (rollout plan) | IMPLEMENTATION §Rollout |

---

## The Feature (90-Second Overview)

**What:** Founders input current ARR, growth %, churn %, costs → tool generates 36-month projection showing cash runway, Series A gate, and profitability path.

**Why:** Highest ROI feature — drives adoption (60%+ target), feeds investor pack with founder input (not estimates), boosts SVI scoring (FIN + TRE dimensions).

**How:**
1. 5-step wizard (model type → financials → scenario → results)
2. Deterministic calculation (no randomness = auditable)
3. Save to DB (2 credits) or export CSV (free)
4. Auto-includes in investor pack with use-of-funds
5. Unlocks SVI scoring bonuses

**Timeline:** 2 weeks (14 days), 2 engineers

---

## Key Stats

| Metric | Value |
|--------|-------|
| Effort | 14 days (2 engineers) |
| ROI | Highest (adoption + pack + SVI) |
| Credit Cost | 2 per saved model |
| Success Target | 60%+ adoption (2 weeks) |
| Time-to-Complete | <5 minutes (happy path) |
| Projection Horizon | 36 months |
| API Endpoints | 7 (generate, save, list, fetch, export, update, delete) |
| Data Model | 1 table (`financial_models`, 22 fields) |
| Components | 12 (wizard + chart + table + cards) |
| Test Scenarios | 9 (happy path + 8 edge cases) |

---

## Data Model at a Glance

**Table:** `financial_models`

```sql
financial_models {
  id UUID PRIMARY KEY
  project_id UUID (FK → projects)
  user_id UUID (audit trail)
  name TEXT (founder label)
  model_type ENUM (saas/marketplace/agency/other)
  current_arr_aud NUMERIC
  monthly_growth_pct NUMERIC
  churn_pct NUMERIC
  cogs_pct NUMERIC
  opex_monthly_aud NUMERIC
  fixed_costs_aud NUMERIC
  include_tax_incentives BOOLEAN
  scenario ENUM (bear/base/bull)
  [12 computed/cached columns]
  projection_data JSONB (36-month snapshot)
  use_for_investor_pack BOOLEAN
  version INTEGER
  is_deleted BOOLEAN
  [timestamps & audit]
}
```

**RLS:** Founder-only access (project_id scope).

---

## API Endpoints Summary

```
POST   /api/financial-model                Generate (free preview)
POST   /api/financial-model/save           Save to DB (2 credits)
GET    /api/financial-model?projectId=...  List all models
GET    /api/financial-model/[id]           Fetch full model
GET    /api/financial-model/[id]/projection?format=csv  CSV export
PUT    /api/financial-model/[id]           Update metadata
DELETE /api/financial-model/[id]           Soft-delete
```

See **API_EXAMPLES.md** for real request/response payloads.

---

## Dashboard Integration

**Widget 1: Financial Forecast Card**
```
Financial Forecast (Base Case)
Cash Runway: $500K → 18 months
Series A Gate: Month 20
ARR@12mo: $180K | ARR@24mo: $450K
[View Details] [Download] [Edit]
```

**Widget 2: Series A Readiness**
```
Projected funding needed by: Month 20
Current runway: 18 months | Target: 24 months
[Update Projection]
```

---

## Investor Pack Integration

**New Section:** "Revenue Projections" (Page 3, after Team)

Includes:
- Model metadata (ARR, growth %, scenario)
- 12/24/36-month milestones
- Breakeven & Series A timeline
- Key assumptions
- Use-of-Funds subsection (auto-calculated)
- Compliance disclaimers

---

## SVI Scoring Impact

**FIN Dimension (Financial Strength):** +15 to +30 points
- Planning ahead (Series A gate < 24mo)
- Path to profitability (breakeven < 24mo)
- Projection accuracy validation

**TRE Dimension (Traction & Revenue):** +20 points
- Model confirms actual revenue growth trajectory

---

## Calculation Engine

**Inputs:** ARR, growth %, churn %, COGS %, OpEx, fixed costs, scenario, tax incentives

**Outputs:** 36-month projection with:
- Revenue, COGS, gross margin, OpEx, EBITDA (monthly)
- Cash burn & cumulative cash (monthly)
- Headcount ramp (scenario-dependent)
- Tax offsets (RDTI, AU-specific)
- Summary metrics (breakeven, Series A gate, runway)

**Key Logic:**
- Deterministic (no randomness)
- Growth decay S-curve (realistic)
- OpEx escalation by scenario
- RDTI tax incentive (43.5% premium on R&D spend)

---

## Validation Rules

**Hard Constraints:**
- ARR: 0 ≤ x ≤ 1 billion
- Growth: -100% ≤ x ≤ 500%
- Churn: 0% ≤ x ≤ 100%
- COGS: 0% ≤ x ≤ 100%
- OpEx: 0 ≤ x ≤ 1 billion

**Warnings (non-blocking):**
- ARR=0 and growth=0: "No revenue and no growth?"
- OpEx > Revenue: "Unsustainable burn"
- Churn > Growth: "Negative unit economics?"

---

## Testing Scenarios

**9 test cases provided:**
1. Happy path (SaaS, $50K ARR, 8% growth)
2. Zero revenue (pre-launch startup)
3. Hypergrowth (VC-backed, 25% growth)
4. Negative growth (contraction scenario)
5. 100% churn (edge case)
6. RDTI tax incentive (AU-specific)
7. Multi-founder team scaling
8. Determinism check (consistency)
9. (Integration test provided in API_EXAMPLES.md)

See **DESIGN.md §9** for detailed assertions.

---

## Implementation Timeline (14 Days)

**Phase 1: Backend (Days 1-4)**
- [ ] SQL migration + RLS policies
- [ ] Core calculation engine
- [ ] API routes (all 7 endpoints)
- [ ] Unit tests
- [ ] Rate limiting + credit system

**Phase 2: Frontend (Days 5-7)**
- [ ] 5-step wizard component
- [ ] Charts (Recharts) & table (virtualized)
- [ ] Form validation + error messages
- [ ] CSV export

**Phase 3: Integration (Days 8-10)**
- [ ] Dashboard widgets (2 cards)
- [ ] Series A readiness gate
- [ ] Investor pack section assembly
- [ ] SVI scoring updates (FIN + TRE)
- [ ] E2E tests

**Phase 4: Polish (Days 11-14)**
- [ ] Mobile responsiveness
- [ ] Performance optimization
- [ ] Help documentation
- [ ] Feature flag setup
- [ ] Gradual rollout (10% → 50% → 100%)

---

## Success Metrics (Measured at 2 Weeks)

| Metric | Target | Status |
|--------|--------|--------|
| Premium founder adoption | 60%+ | — |
| Average completion time (p50) | <5 min | — |
| Save rate (% who complete) | 40%+ | — |
| Investor pack integration | 35%+ | — |
| Support ticket reduction | -30% | — |
| Credit revenue (2-credit saves) | TBD | — |

---

## Compliance Notes

**AFSL Disclaimer:** Every response includes: *"General information only. Not financial advice. Projections are illustrative estimates based on AU sector benchmarks..."*

**No Named Benchmarks:**
- ✗ "vs Stripe's growth rate"
- ✗ "vs Canva's burn efficiency"
- ✓ "vs AU SaaS median (8% monthly growth)"
- ✓ "vs fintech baseline COGS (30%)"

**Data Retention:**
- Snapshots stored indefinitely
- Soft-delete only (never purged)
- Audit trail via user_id + timestamps
- Founder can export anytime

---

## File Structure (in this repo)

```
/home/dovanlong/blockid.au/
├─ REVENUE_FORECAST_DESIGN.md              (40 KB) ⭐ Read First
├─ REVENUE_FORECAST_IMPLEMENTATION.md      (20 KB) For developers
├─ REVENUE_FORECAST_QUICK_REFERENCE.md     (9.7 KB) For product/design
├─ REVENUE_FORECAST_API_EXAMPLES.md        (20 KB) For QA/testing
├─ REVENUE_FORECAST_SUMMARY.txt            (15 KB) Navigation guide
├─ README_REVENUE_FORECAST.md              (this file)
│
├─ web/src/
│  ├─ app/api/financial-model/             (routes to build)
│  ├─ components/financial-model/          (components to build)
│  ├─ lib/financial-model/                 (engine to build)
│  └─ lib/svi-analysis/                    (scoring to update)
│
├─ web/supabase/migrations/
│  └─ 20260817_financial_models.sql        (to deploy)
│
└─ web/test/
   ├─ financial-model.test.ts              (unit tests)
   ├─ financial-model.e2e.test.ts          (E2E tests)
   └─ financial-model-api.test.ts          (API tests)
```

---

## Getting Started

### For Developers

1. **Read Overview (10 min)**
   - QUICK_REFERENCE.md or this README

2. **Read Full Design (45 min)**
   - DESIGN.md (all sections)

3. **Read Implementation Guide (30 min)**
   - IMPLEMENTATION.md (all sections)

4. **Start Coding**
   - Backend first: `lib/financial-model/engine.ts`
   - Then API routes: `app/api/financial-model/route.ts`
   - Then frontend: `components/financial-model/financial-model-wizard.tsx`

5. **Run Tests**
   ```bash
   npm run test -- financial-model
   npm run test -- financial-model-api
   ```

### For Product/Design

1. **Read Quick Reference (5 min)**
   - QUICK_REFERENCE.md

2. **Review Wireframes (10 min)**
   - DESIGN.md §10 (wireframes & visual hierarchy)

3. **Review Requirements (20 min)**
   - DESIGN.md §2 (component architecture)
   - DESIGN.md §4 (calculation engine)

4. **Discuss UX**
   - Mobile responsiveness
   - Chart visualization (Recharts options)
   - Error messaging strategy

### For QA/Testing

1. **Read Test Scenarios (10 min)**
   - DESIGN.md §9 (9 test cases)

2. **Read API Examples (20 min)**
   - API_EXAMPLES.md (all endpoints)

3. **Set Up Testing**
   - Use cURL cheatsheet or Postman collection (in API_EXAMPLES.md)
   - Run Jest test suite
   - Test happy path + edge cases

4. **Verify**
   - RLS (can only access own projects)
   - Credit charging (2 credits per save)
   - Rate limiting (prevents abuse)

---

## Common Questions

**Q: Can I start coding before reading everything?**
A: Yes. Read DESIGN.md §1 (schema) + §2 (components), then start with backend. Full read takes 1 hour but sections can be read in order.

**Q: What's the main calculation formula?**
A: See DESIGN.md §3.2 (Calculation Engine). Pseudocode provided. No complex math, just S-curve growth decay + OpEx escalation + tax offsets.

**Q: Is there existing code to reuse?**
A: Yes. See MEMORY.md — there's already a `financial_projections` table (0048_svi_index_and_kpis.sql) and a `generateProjection()` function (src/lib/financial-projections.ts). This design extends it with founder input UI + versioning + investor pack.

**Q: How do I integrate with the investor pack?**
A: See DESIGN.md §6 + IMPLEMENTATION.md "investor-pack-assembler.ts". Auto-include when `use_for_investor_pack=true`.

**Q: What if founder has multiple projects?**
A: Models are scoped by `project_id` (multi-startup architecture). Each project gets its own list.

**Q: Can I see real API examples?**
A: Yes, all in API_EXAMPLES.md. Includes cURL, Postman collection, Jest tests.

---

## Contact & Support

**Technical Questions?**
- See IMPLEMENTATION.md (code organization, file structure)
- See API_EXAMPLES.md (endpoint details, testing)

**Product Questions?**
- See QUICK_REFERENCE.md (FAQ, feature overview)
- See DESIGN.md §2 (component architecture)

**Design Questions?**
- See DESIGN.md §10 (wireframes)
- See QUICK_REFERENCE.md (user journey)

**Operational Questions?**
- See DESIGN.md §Rollout Plan
- See IMPLEMENTATION.md §Rollout Plan

---

## Document Versions

- **Version:** 1.0
- **Generated:** 2026-08-17
- **Status:** Production Ready
- **Total Pages:** 104 KB (5 documents)
- **Effort Estimate:** 14 days (2 engineers)
- **ROI:** Highest (adoption, investor pack, SVI scoring)

---

**Ready to build? Start with REVENUE_FORECAST_DESIGN.md. Good luck!**
