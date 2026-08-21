# Revenue Forecast + Unit Economics Builder (T0121)
## P1 Feature Design | 2-week effort | Highest ROI

---

## Executive Summary

**Feature:** Interactive financial modeling tool for founders to build 36-month revenue + unit economics projections, linked to Series A readiness scoring and SVI dimensions.

**Positioning:** Proprietary BlockID Founder Edition — shows founders "path to profitability" + runway, feeds SVI financial dimension (FIN) with *real* founder input (not estimated), and unlocks investor pack sections with projection-backed claims.

**Integration Points:**
- Dashboard widget: "Cash runway: $500K → 18 months to Series A"
- Investor pack sections: Revenue projections, use-of-funds, Series A readiness gate
- SVI scoring: FIN dimension (financial strength) + TRE (traction) boosts on revenue traction
- Credit gate: 2 credits per projection generation/storage

**Success Metrics:**
- 60%+ premium founders adopt within 2 weeks of ship
- <5 minutes to generate first projection (happy path)
- 40%+ save projections for re-use (not one-shot computation)

---

## 1. Data Model & Database Schema

### 1.1 Table: `financial_models` (New)

**Purpose:** Store founder-created financial models with versioning and audit trail.

**SQL Migration:**

```sql
-- 20260817_financial_models.sql
-- Founder-created financial models with 36-month projections
-- Linked to projects for multi-startup support
-- Versioned for edit history; soft-delete support

CREATE TABLE IF NOT EXISTS financial_models (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL,  -- Audit trail (who created/edited)
  
  -- Model metadata
  name                    TEXT NOT NULL DEFAULT 'Financial Projection',  -- Founder-provided label
  model_type              TEXT NOT NULL CHECK (model_type IN ('saas', 'marketplace', 'agency', 'other')),
  description             TEXT,  -- Free-form notes
  
  -- Core financial inputs
  current_arr_aud         NUMERIC(14,2) NOT NULL CHECK (current_arr_aud >= 0),
  monthly_growth_pct      NUMERIC(5,2) NOT NULL CHECK (monthly_growth_pct >= -100 AND monthly_growth_pct <= 500),
  churn_pct               NUMERIC(5,2) NOT NULL CHECK (churn_pct >= 0 AND churn_pct <= 100),
  cogs_pct                NUMERIC(5,2) NOT NULL CHECK (cogs_pct >= 0 AND cogs_pct <= 100),
  opex_monthly_aud        NUMERIC(14,2) NOT NULL CHECK (opex_monthly_aud >= 0),
  fixed_costs_aud         NUMERIC(14,2) NOT NULL CHECK (fixed_costs_aud >= 0),
  
  -- Tax incentives (RDTI/ESIC) — auto-detect sector from project
  include_tax_incentives  BOOLEAN NOT NULL DEFAULT false,
  
  -- Derived snapshots (denormalized for dashboard performance)
  scenario                TEXT NOT NULL DEFAULT 'base' CHECK (scenario IN ('bear', 'base', 'bull')),
  
  -- Runway calculations (cached)
  month_breakeven         INTEGER,  -- Month where EBITDA first positive, null if none in 36mo
  months_to_seriesA       INTEGER,  -- Month where cumulative cash burn warrants Series A (gate check)
  peak_monthly_burn_aud   NUMERIC(14,2),  -- Used to highlight cash crisis months
  arr_month_12_aud        NUMERIC(14,2),  -- ARR projection at month 12
  arr_month_24_aud        NUMERIC(14,2),  -- ARR projection at month 24
  arr_month_36_aud        NUMERIC(14,2),  -- ARR projection at month 36
  runway_months           INTEGER,  -- Runway in months before cash runs out (null if never)
  
  -- Full projection payload (immutable snapshot for deterministic exports)
  projection_data         JSONB NOT NULL,  -- { months: [...], summary: {...}, sectorNormsUsed: {...} }
  
  -- Investor pack metadata
  use_for_investor_pack   BOOLEAN NOT NULL DEFAULT false,  -- Flag to include in pack export
  investor_pack_version   INTEGER DEFAULT 1,  -- Track which PDF version used this model
  
  -- Audit & versioning
  version                 INTEGER NOT NULL DEFAULT 1,
  is_deleted              BOOLEAN NOT NULL DEFAULT false,
  replaced_by_id          UUID,  -- Soft-delete chain (v1 → v2 → v3)
  
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at            TIMESTAMPTZ,  -- When shared to investor pack (first lock point)
  
  UNIQUE(project_id, name, version),
  CONSTRAINT fk_replaced_by FOREIGN KEY (replaced_by_id) REFERENCES financial_models(id)
);

CREATE INDEX IF NOT EXISTS idx_financial_models_project_id
  ON financial_models(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_models_user_id
  ON financial_models(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_models_project_active
  ON financial_models(project_id)
  WHERE is_deleted = false AND replaced_by_id IS NULL;  -- Active versions only
CREATE INDEX IF NOT EXISTS idx_financial_models_for_investor_pack
  ON financial_models(project_id, published_at DESC)
  WHERE use_for_investor_pack = true AND is_deleted = false;

-- RLS: Founders can only read/write their own projects' models
ALTER TABLE financial_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own project financial models"
  ON financial_models FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.created_by = auth.uid()
    )
  );

CREATE POLICY "Users insert own project financial models"
  ON financial_models FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (
      SELECT p.id FROM projects p
      WHERE p.created_by = auth.uid()
    )
  );

CREATE POLICY "Users update own project financial models"
  ON financial_models FOR UPDATE
  USING (
    user_id = auth.uid()
    AND project_id IN (
      SELECT p.id FROM projects p
      WHERE p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND project_id IN (
      SELECT p.id FROM projects p
      WHERE p.created_by = auth.uid()
    )
  );

CREATE POLICY "Service role full access to financial_models"
  ON financial_models FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

NOTIFY pgrst, 'reload schema';
```

### 1.2 Table: `financial_model_audit` (Optional, for heavy audit trails)

```sql
-- Lightweight audit log for compliance / founder dispute resolution
CREATE TABLE IF NOT EXISTS financial_model_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id          UUID NOT NULL REFERENCES financial_models(id) ON DELETE CASCADE,
  action            TEXT NOT NULL CHECK (action IN ('created', 'updated', 'published', 'deleted')),
  changed_fields    JSONB,  -- Only changed columns (diff)
  actor_id          UUID NOT NULL,
  actor_email       TEXT,  -- Denormalized for offline queries
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_model_created
  ON financial_model_audit(model_id, created_at DESC);
```

### 1.3 Integration with Existing `svi_snapshots`

Update the `svi_snapshots` table (already exists in 0048_svi_index_and_kpis.sql) to reference the financial model:

```sql
ALTER TABLE svi_snapshots ADD COLUMN IF NOT EXISTS financial_model_id UUID
  REFERENCES financial_models(id) ON DELETE SET NULL;
  
CREATE INDEX IF NOT EXISTS idx_svi_snapshots_financial_model
  ON svi_snapshots(financial_model_id);
```

**Rationale:** When an SVI snapshot is computed, link it to the financial model that informed the FIN dimension score. This creates audit trail: "SVI 142 included projection $50K ARR in 12mo".

---

## 2. Component Architecture

### 2.1 Multi-Step Wizard Flow

**Path:** `/dashboard/[startup_id]/financial-model` (new page) OR modal on dashboard

**Screens:**

1. **Screen 1: Model Type + Sector** (Auto-detect from project)
   - Radio: SaaS / Marketplace / Agency / Other
   - Display: Project sector (read-only, from `projects.sector`)
   - CTA: Next

2. **Screen 2: Current State**
   - Current ARR (AUD) — input `0..1e9`
   - Monthly growth (%) — input `-100..500` (allow negative for contraction)
   - Monthly churn (%) — input `0..100`
   - Validation: Warn if ARR=0 + growth=0 ("no revenue, no growth?")
   - CTA: Next

3. **Screen 3: Cost Structure**
   - COGS % of revenue — input `0..100` (sector default pre-filled)
   - Monthly OpEx (AUD) — input `0..1e9` (sector default pre-filled)
   - Fixed costs (AUD) — input `0..1e9` (e.g., rent, servers)
   - Validation: Warn if OpEx > Revenue (unsustainable burn)
   - CTA: Next

4. **Screen 4: Assumptions & Scenario**
   - Scenario selector: Bear / Base / Bull (radio)
   - Explanation per scenario:
     - **Bear:** Conservative growth decay, slow hiring
     - **Base:** Moderate growth with typical team ramp
     - **Bull:** Aggressive growth, fast hiring
   - Checkbox: "Include RDTI/ESIC tax incentives" (AU-specific)
   - Optional: Founder notes (free text, 500 chars)
   - CTA: Generate Projection

5. **Screen 5: Results & Export**
   - Chart: 36-month revenue, EBITDA, cumulative cash burn
   - Metrics card:
     - "ARR at 12mo: $50K"
     - "ARR at 24mo: $150K"
     - "Breakeven month: 18"
     - "Runway: 24 months" (or "Cash out in month 22")
     - "Series A readiness: Month 20" (if burn requires funding)
   - Table: Monthly breakdown (collapsible, 3-table toggle: revenue/ebitda/headcount)
   - CTA buttons:
     - Save to profile (costs 2 credits)
     - Download CSV
     - Use in investor pack
   - Disclaimer: AFSL, general info only

### 2.2 Component Tree

```
<FinancialModelWizard>
  │
  ├─ <WizardContainer> (state: currentStep, formData, isLoading)
  │
  ├─ Step 1: <ModelTypeForm>
  │   ├─ Radio (model_type)
  │   ├─ Display sector (read-only)
  │   └─ Navigation buttons
  │
  ├─ Step 2: <CurrentStateForm>
  │   ├─ Input (current_arr_aud)
  │   ├─ Input (monthly_growth_pct)
  │   ├─ Input (churn_pct)
  │   ├─ ValidationWarnings
  │   └─ Navigation buttons
  │
  ├─ Step 3: <CostStructureForm>
  │   ├─ Input (cogs_pct)
  │   ├─ Input (opex_monthly_aud)
  │   ├─ Input (fixed_costs_aud)
  │   ├─ SectorDefaults (collapsible reference)
  │   └─ Navigation buttons
  │
  ├─ Step 4: <AssumptionsForm>
  │   ├─ Radio (scenario: bear/base/bull)
  │   ├─ ScenarioExplainer (side-by-side comparison)
  │   ├─ Checkbox (include_tax_incentives)
  │   ├─ TextArea (notes)
  │   └─ GenerateButton (triggers POST /api/financial-model)
  │
  └─ Step 5: <ProjectionResults>
      ├─ <ProjectionChart> (Recharts: Revenue + EBITDA line chart)
      ├─ <MetricsCard> (Key numbers: ARR@12mo, breakeven, runway)
      ├─ <MonthlyTable> (collapsible, virtualized for 36 rows)
      ├─ <ExportOptions>
      │   ├─ Save button (POST /api/financial-model/save)
      │   ├─ CSV download (GET ?format=csv)
      │   └─ Investor pack toggle
      ├─ <AFSLDisclaimer>
      └─ Navigation (back or close)
```

### 2.3 Styling & UX Decisions

- **Color scheme:** Use dashboard brand colors (green for profitability, orange for burn, red for negative cash)
- **Charts:** Recharts ComposedChart (bars for monthly, line for cumulative)
- **Mobile:** Stack wizard vertically, full-width inputs, chart responsive
- **Accessibility:** All inputs have labels, descriptions, aria-invalid on validation errors
- **Live preview:** NO (avoid computation spam) — submit once, view results once
- **Errors:** Inline field validation + toast on API failure

---

## 3. Calculation Engine

### 3.1 Core Logic: `generateFinancialModel()`

**Input:**
```typescript
interface FinancialModelInput {
  projectId: string;
  modelType: 'saas' | 'marketplace' | 'agency' | 'other';
  currentArrAud: number;
  monthlyGrowthPct: number;
  churnPct: number;
  cogsPercent: number;
  opexMonthlyAud: number;
  fixedCostsAud: number;
  scenario: 'bear' | 'base' | 'bull';
  includeTaxIncentives: boolean;
  sector: string;  // From project
}
```

**Output:**
```typescript
interface FinancialModelResult {
  months: FinancialMonth[];
  summary: {
    revenueYear1: number;
    revenueYear2: number;
    revenueYear3: number;
    burnYear1: number;
    ebitdaYear3: number;
    monthBreakeven: number | null;
    monthsToSeriesA: number | null;
    peakBurnAud: number;
    runwayMonths: number | null;
  };
  assumptions: {
    baseGrowth: number;
    scenarioMultiplier: number;
    taxIncentive: boolean;
  };
  generatedAt: string;
  disclaimer: string;
}

interface FinancialMonth {
  month: number;  // 1..36
  date: string;   // YYYY-MM-01
  revenueAud: number;
  cogsAud: number;
  grossMarginAud: number;
  opexAud: number;
  ebitdaAud: number;
  cashOutflowAud: number;
  cumCashAud: number;  // Cumulative burn
  headcount: number;   // Estimated team size
  taxOffsetAud: number;  // RDTI monthly
}
```

### 3.2 Deterministic Calculation (No Randomness)

**Growth Decay S-Curve:**
- Base sector growth (from VC_BENCHMARKS, e.g., SaaS = 8%)
- Apply scenario multiplier:
  - Bear: ×0.7
  - Base: ×1.0
  - Bull: ×1.4
- Decay over 36 months: -1% per 6-month block, floor at 2%
- Formula: `growthMonth[t] = max(2, baseGrowthPct - (t/6) * 1.0)`

**Churn Model (Optional Enhancement):**
- If churn_pct provided: each month net_customers = prev_customers × (1 + growth - churn)
- If not: use ARR growth directly (simpler, assumes blended MRR/churn)

**Cost Ramp (Scenario-Dependent):**
- OpEx escalates monthly by scenario:
  - Bear: +1% month-over-month
  - Base: +2% month-over-month
  - Bull: +3.5% month-over-month
- Fixed costs add monthly
- COGS is % of revenue (scaled with growth)

**Tax Incentives (RDTI, AU-Specific):**
- If R&D spend ≥ A$20k/year:
  - Calculate monthly R&D spend (OpEx × sector R&D intensity)
  - Apply RDTI premium (43.5% on eligible spend, capped by R&D intensity)
  - Monthly offset = monthly R&D × RDTI_REFUNDABLE_PREMIUM
- (Reuse existing `cfo-au-tax-incentives.ts` logic)

**Series A Gate (Binary Decision):**
- Calculate cumulative cash burn from month 1
- If runway < 18 months: flag month where cash < 6 months
- OR if EBITDA stays negative beyond month 24: flag month 20+
- Return: `monthsToSeriesA = first month where founder should seek Series A`

**Runway (Simple):**
- If cash flow stays positive: `runwayMonths = null` (indefinite)
- If cash flow goes negative: find month where cumulative cash = starting balance (infinite burn scenario → month 24 placeholder)
- Actually: track when cumulative cash surplus/deficit flips at burn peak

### 3.3 Pseudocode: Core Loop

```pseudo
function generateFinancialModel(input) {
  sector = normalizeSector(input.sector)
  benchmarks = VC_BENCHMARKS[sector]
  
  baseGrowth = SECTOR_BASE_GROWTH_PCT[sector] * SCENARIO_MULTIPLIER[input.scenario]
  
  months = []
  arr = input.currentArrAud
  opex = input.opexMonthlyAud
  cumCash = 0
  peakBurn = 0
  
  for t in 0..35:
    # Revenue growth
    if t > 0:
      growthRate = max(2, baseGrowth - (t/6) * 1.0) / 100
      arr = arr * (1 + growthRate)
      if input.churnPct:
        arr = arr * (1 - input.churnPct / 100)
    
    # Cost ramp
    if t > 0:
      opexGrowth = SCENARIO_OPEX_GROWTH[input.scenario] / 100
      opex = opex * (1 + opexGrowth)
    
    # Calculate P&L
    revenue = arr / 12  # Monthly revenue from ARR
    cogs = revenue * (input.cogsPercent / 100)
    grossMargin = revenue - cogs
    
    totalOpex = opex + input.fixedCostsAud
    ebitda = grossMargin - totalOpex
    
    # Tax offset (RDTI)
    taxOffset = 0
    if input.includeTaxIncentives:
      rdSpend = totalOpex * (SECTOR_RD_INTENSITY[sector] / 100)
      if rdSpend * 12 >= RDTI_MIN_SPEND:
        taxOffset = rdSpend * RDTI_REFUNDABLE_PREMIUM
    
    # Cash flow
    cashOutflow = max(0, totalOpex - grossMargin - taxOffset)
    cumCash += cashOutflow
    peakBurn = max(peakBurn, cashOutflow)
    
    # Track breakeven & Series A gate
    if ebitda >= 0 and monthBreakeven == null:
      monthBreakeven = t + 1
    
    if monthsToSeriesA == null and t > 20 and ebitda < 0:
      monthsToSeriesA = t + 1
    
    months.push({
      month: t + 1,
      date: addMonths(startDate, t),
      revenueAud: round(revenue),
      grossMarginAud: round(grossMargin),
      opexAud: round(totalOpex),
      ebitdaAud: round(ebitda),
      cashOutflowAud: round(cashOutflow),
      cumCashAud: round(cumCash),
      headcount: founderCount + floor(t / HIRES_PER_SCENARIO[scenario]),
      taxOffsetAud: round(taxOffset)
    })
  
  return {
    months,
    summary: { ... },
    assumptions: { ... },
    generatedAt: now(),
    disclaimer: AFSL_DISCLAIMER
  }
}
```

---

## 4. API Routes

### 4.1 POST `/api/financial-model/generate`

**Purpose:** Compute projection without saving (instant preview).

**Request Body:**
```json
{
  "projectId": "uuid",
  "currentArrAud": 15000,
  "monthlyGrowthPct": 8,
  "churnPct": 5,
  "cogsPercent": 25,
  "opexMonthlyAud": 35000,
  "fixedCostsAud": 8000,
  "scenario": "base",
  "includeTaxIncentives": true
}
```

**Response (200):**
```json
{
  "ok": true,
  "projection": {
    "months": [...],
    "summary": {...},
    "assumptions": {...},
    "generatedAt": "2026-08-17T12:34:56Z",
    "disclaimer": "..."
  },
  "creditsCharged": 0,
  "creditsRemaining": null
}
```

**Error Responses:**
- `400`: Validation error (missing field, out of range)
- `402`: Insufficient credits (if logged in)
- `429`: Rate limit exceeded

---

### 4.2 POST `/api/financial-model/save`

**Purpose:** Persist projection to DB (2 credits).

**Request Body:**
```json
{
  "projectId": "uuid",
  "name": "Conservative projection - Q3 2026",
  "projection": { /* full projection object from /generate */ },
  "useForInvestorPack": false,
  "notes": "Assumes flat growth after month 18 due to seasonal factors"
}
```

**Response (201):**
```json
{
  "ok": true,
  "model": {
    "id": "uuid",
    "projectId": "uuid",
    "name": "Conservative projection - Q3 2026",
    "createdAt": "2026-08-17T12:34:56Z",
    "version": 1
  },
  "creditsCharged": 2,
  "creditsRemaining": 45
}
```

**RLS:** Only project owner can save.

---

### 4.3 GET `/api/financial-model/[id]`

**Purpose:** Fetch saved projection.

**Response (200):**
```json
{
  "ok": true,
  "model": {
    "id": "uuid",
    "projectId": "uuid",
    "name": "...",
    "modelType": "saas",
    "scenario": "base",
    "monthBreakeven": 18,
    "monthsToSeriesA": 20,
    "arrMonth12Aud": 180000,
    "arrMonth24Aud": 450000,
    "projectionData": { /* full months array + summary */ },
    "useForInvestorPack": true,
    "publishedAt": "2026-08-17T14:00:00Z",
    "createdAt": "2026-08-17T12:34:56Z",
    "updatedAt": "2026-08-17T12:34:56Z",
    "version": 1
  }
}
```

---

### 4.4 GET `/api/financial-model/[id]/projection?format=csv`

**Purpose:** Export projection as CSV for founder download or investor pack.

**Response (200, text/csv):**
```
Date,Revenue AUD,COGS AUD,Gross Margin AUD,OpEx AUD,EBITDA AUD,Cash Outflow AUD,Cum Cash AUD,Headcount,Tax Offset AUD
2026-09-01,1250,313,937,35000,-34063,34063,34063,2,0
2026-10-01,1350,338,1012,35700,-34688,34688,68751,2,0
...
```

---

### 4.5 GET `/api/financial-model?projectId=[id]`

**Purpose:** List all saved models for a project.

**Query params:**
- `projectId` (required)
- `includeDeleted=false` (optional)

**Response (200):**
```json
{
  "ok": true,
  "models": [
    {
      "id": "uuid",
      "name": "Bull case - new marketing",
      "scenario": "bull",
      "monthBreakeven": 14,
      "arrMonth12Aud": 250000,
      "useForInvestorPack": true,
      "publishedAt": "2026-08-17T14:00:00Z",
      "version": 2,
      "createdAt": "2026-08-17T12:34:56Z"
    },
    {
      "id": "uuid",
      "name": "Conservative - base case",
      "scenario": "base",
      "monthBreakeven": 18,
      "arrMonth12Aud": 180000,
      "useForInvestorPack": false,
      "version": 1,
      "createdAt": "2026-08-16T10:00:00Z"
    }
  ]
}
```

---

### 4.6 PUT `/api/financial-model/[id]`

**Purpose:** Update model (e.g., rename, toggle investor pack flag).

**Request Body:**
```json
{
  "name": "Updated name",
  "useForInvestorPack": true,
  "notes": "Updated assumptions..."
}
```

**Response (200):**
- Updates `updated_at`, increments `version`
- Does NOT charge credits (editing is free)
- Returns updated model object

---

### 4.7 DELETE `/api/financial-model/[id]`

**Purpose:** Soft-delete model (marks `is_deleted=true`, can be restored).

**Response (204):** No content

---

## 5. Dashboard Integration

### 5.1 Widget: Financial Forecast Card

**Location:** Dashboard main grid (above or alongside cap-table, below SVI score)

**Content (when model exists):**
```
┌─────────────────────────────────────────┐
│  Financial Forecast (Base Case)         │
├─────────────────────────────────────────┤
│  Cash Runway: $500K → 18 months         │
│  Series A Gate: Month 20                │
│  ARR@12mo: $180K | ARR@24mo: $450K      │
│                                         │
│  [View Details] [Download] [Edit]       │
└─────────────────────────────────────────┘
```

**Behavior:**
- Click "View Details" → expand to full chart + table
- Fetch latest active model for project via `GET /api/financial-model?projectId=...`
- If no model: show empty state + "Create your first projection" button

### 5.2 Widget: Series A Readiness Gate

**Location:** Investor readiness section

**Content (when model exists + Series A gate triggered):**
```
⚠️ Series A Timeline
Projected funding needed by: Month 20 (Apr 2027)
Current runway: 18 months | Target: 24 months

Based on your base case projection.
[Update Projection] [View Full Model]
```

**Logic:**
- Pull `monthsToSeriesA` from active model
- If null: show "Indefinite runway (cash-positive by month X)"
- If value: show month countdown + estimated date

---

## 6. Investor Pack Integration

### 6.1 New Section: Revenue Projections

**Section placement:** P3 (after Team)

**Content (pulled from saved model):**

```markdown
## Revenue Projections (Base Case, 36-month)

**Founder's Projection Model:**
- Current ARR: $15,000
- Monthly Growth: 8%
- Scenario: Base case

**Key Milestones:**
- ARR@12mo: $180,000
- ARR@24mo: $450,000
- ARR@36mo: $875,000

**Profitability Path:**
- Breakeven Month: 18
- Series A needed by: Month 20

**Assumptions:**
- COGS: 25% of revenue
- OpEx: $35K/month base, +2% monthly escalation
- Tax incentives (RDTI): Included

**Note:** Projections are founder-provided estimates based on AU sector benchmarks. Not financial advice.
```

### 6.2 Use-of-Funds Template

**Auto-populated from model's `use_for_investor_pack` flag:**

```markdown
## Use of Funds (18-month runway gap)

Estimated funding requirement: $500K (to reach month 24)

**Allocation:**
- Team Expansion: 45% ($225K)
- Marketing & Sales: 30% ($150K)
- Infrastructure & Operations: 15% ($75K)
- Buffer & Contingency: 10% ($50K)
```

**Note:** If founder hasn't filled in allocation detail, pack renders:
"*Founder has not yet detailed use of funds. Contact for discussion.*"

### 6.3 Compliance Flag: No Named Benchmarks

**Enforcement (in Pack Assembler):**
```typescript
// financial-model output must NOT include:
// - "vs Stripe's growth"
// - "vs Canva's burn rate"
// - specific named company comparisons

// Instead, use:
// - "vs AU SaaS median growth (8%)"
// - "vs fintech baseline burn"
```

---

## 7. SVI Scoring Integration

### 7.1 FIN (Financial Strength) Dimension

**Current Logic:** Estimated from sector norms + founder self-report.

**New Logic (Post T0121):**
- If founder has saved model with series A gate < 24mo: **score +15 points** (evidence of forward planning)
- If founder has saved model with breakeven < 24mo: **score +10 points** (path to sustainability)
- If model ARR@12mo matches or exceeds stated revenue: **score +5 points** (confidence alignment)
- Max: No penalty if no model (founders aren't required to use tool)

**Implementation:**
```typescript
// In lib/svi-analysis.ts or lib/svi-scoring.ts

async function computeFinDimension(projectId: string, analysis: SVIAnalysis): number {
  let score = baseScore;  // Start with existing estimation logic
  
  const model = await getLatestFinancialModel(projectId);
  if (!model) return score;  // No model → no bonus
  
  if (model.monthsToSeriesA && model.monthsToSeriesA < 24) {
    score += 15;  // Planning ahead
  }
  if (model.monthBreakeven && model.monthBreakeven < 24) {
    score += 10;  // Path to profitability
  }
  if (model.arrMonth12Aud && analysis.revenueAnnual >= model.arrMonth12Aud * 0.9) {
    score += 5;   // Projection conservatism or tracking
  }
  
  return Math.min(score, 50);  // Dimension max
}
```

### 7.2 TRE (Traction & Revenue) Dimension

**Enhancement:** Boost TRE confidence if model supports claimed revenue.

```typescript
async function computeTreDimension(projectId: string, analysis: SVIAnalysis): number {
  let score = baseScore;
  
  const model = await getLatestFinancialModel(projectId);
  if (!model) return score;
  
  // If founder claims $100K revenue and model shows $100K at month X:
  // Increase confidence by 20 points (evidence-backed claim)
  const month12Revenue = model.arrMonth12Aud / 12;
  if (analysis.monthlyRecurringRevenue >= month12Revenue * 0.8) {
    score += 20;
  }
  
  return Math.min(score, 50);
}
```

---

## 8. Validation & Error Handling

### 8.1 Input Validation (Client + Server)

| Field | Client Validation | Server Validation | Error Message |
|-------|-------------------|-------------------|---------------|
| `currentArrAud` | `0 <= x <= 1e9` | ✓ | "ARR must be between 0 and 1 billion" |
| `monthlyGrowthPct` | `-100 <= x <= 500` | ✓ | "Growth rate must be between -100% and 500%" |
| `churnPct` | `0 <= x <= 100` | ✓ | "Churn must be 0–100%" |
| `cogsPercent` | `0 <= x <= 100` | ✓ | "COGS must be 0–100% of revenue" |
| `opexMonthlyAud` | `0 <= x <= 1e9` | ✓ | "OpEx must be a positive number up to 1 billion" |
| `fixedCostsAud` | `0 <= x <= 1e9` | ✓ | "Fixed costs must be 0 or positive" |
| `scenario` | One of: bear/base/bull | ✓ | "Scenario must be bear, base, or bull" |
| `name` (optional) | `1 <= len <= 255` | ✓ | "Model name too long" |

### 8.2 Business Logic Validation (Warnings, not Errors)

| Scenario | Warning | Severity |
|----------|---------|----------|
| ARR=0 AND growth=0 | "No revenue and no growth. Viable business?" | Info |
| OpEx > Revenue (monthly) | "Monthly burn exceeds revenue. Runway is X months." | Warning |
| churn > growth | "Churn exceeds growth. Negative cohort economics?" | Warning |
| ARR > 10M (unrealistic) | "ARR projection very high. Double-check assumptions." | Info |
| growth > 50% monthly | "Hypergrowth assumption. Validate market size." | Warning |

**UX:** Show inline under field on step 3–4, don't block submission (founder can override).

### 8.3 Error Recovery

**API Failures:**
```typescript
// If /generate fails:
// - Show: "Could not compute projection. Check inputs and retry."
// - Allow: Download CSV of partial computation (if available)
// - Log: Error with timestamp for support

// If /save fails:
// - Show: "Could not save model. You can download CSV to keep locally."
// - Retry: Auto-retry after 3 seconds
```

---

## 9. Test Scenarios

### 9.1 Happy Path
- **Input:** ARR=$50K, growth=10%, churn=3%, COGS=20%, OpEx=$30K/mo, scenario=base
- **Expected:** Breakeven month 12, Series A gate month 18
- **Assertion:** ARR@12mo ≈ $150K, ARR@24mo ≈ $350K

### 9.2 Zero Revenue (Pre-Launch)
- **Input:** ARR=$0, growth=15%, churn=0%, COGS=25%, OpEx=$20K/mo, scenario=bull
- **Expected:** First revenue month 1, breakeven month ~20
- **Assertion:** Cumulative cash burn reaches -$360K by month 12

### 9.3 Hypergrowth (VC-Backed)
- **Input:** ARR=$500K, growth=25%, churn=2%, COGS=30%, OpEx=$80K/mo, scenario=bull
- **Expected:** Breakeven month 2, Series A gate = never (cash-positive)
- **Assertion:** ARR@12mo ≈ $5M

### 9.4 Negative Growth (Contraction)
- **Input:** ARR=$100K, growth=-5%, churn=10%, COGS=40%, OpEx=$50K/mo, scenario=bear
- **Expected:** Negative EBITDA all 36 months, runway < 12 months
- **Assertion:** cumCash[month 6] > initial burn budget

### 9.5 100% Churn
- **Input:** ARR=$50K, growth=20%, churn=100%, COGS=20%, OpEx=$25K/mo, scenario=base
- **Expected:** ARR collapses by month 2, Series A gate month 3
- **Assertion:** Validation warning at input: "100% churn is unsustainable"

### 9.6 RDTI Tax Incentive
- **Input:** (SaaS params) + `includeTaxIncentives=true`, OpEx=$50K/mo
- **Expected:** Tax offset ~$500/mo (R&D intensity 20% × RDTI 43.5% premium)
- **Assertion:** Cash outflow reduced by tax offset amount each month

### 9.7 Multi-Founder Team Scaling
- **Input:** founderCount=3, scenario=bull
- **Expected:** Headcount scales 3 → 4 → 5 → ... (hire every 2 months in bull scenario)
- **Assertion:** OpEx escalates with headcount ramp

### 9.8 Determinism Check
- **Input:** Same params as 9.1, run twice
- **Expected:** Identical projection output
- **Assertion:** No random fields; 36-month table matches byte-for-byte

---

## 10. Wireframes

### 10.1 Wizard Step 2: Current State

```
┌────────────────────────────────────────────┐
│  Financial Model - Step 2 of 5             │
├────────────────────────────────────────────┤
│                                            │
│  Current Traction                         │
│  ─────────────────────────────────────     │
│                                            │
│  Current Annual Recurring Revenue (ARR)   │
│  [______________________] AUD              │
│  Tip: Enter your current monthly recurring│
│  revenue × 12, or annual total.           │
│                                            │
│  Monthly Growth Rate                       │
│  [______________________] %                │
│  ⚠️ Warning: No growth expected?          │
│                                            │
│  Monthly Churn Rate                        │
│  [______________________] %                │
│  Tip: % of customers lost per month.      │
│                                            │
│ [◀ Back] ────────────────────── [Next ▶]  │
└────────────────────────────────────────────┘
```

### 10.2 Results Chart (Recharts)

```
Revenue + EBITDA (36-month projection)

$2.5M ╭─────────────────────────────────────────
$2.0M │    ╭─────────────────────────
$1.5M │   ╱│ Revenue (ARR)
$1.0M │  ╱ │
$500K │ ╱  │ EBITDA (crossing 0 at month 18)
  $0K ├────┼─────────────────────────────────
 -$500K │   │ ╰─EBITDA (operational burn)
 -$1.0M │   │
 -$1.5M ╰───╯ Peak burn: month 6
      0   12   24   36
```

### 10.3 Metrics Card

```
┌──────────────────────────────────────────┐
│  Projection Summary (Base Case)          │
├──────────────────────────────────────────┤
│                                          │
│  Year 1 Revenue         $180,000         │
│  Year 2 Revenue         $600,000         │
│  Year 3 Revenue       $1,500,000         │
│                                          │
│  Breakeven Month              18 (Jun)   │
│  Series A Readiness          Month 20    │
│  Cash Runway                 18 months   │
│  Peak Monthly Burn            $35,000    │
│                                          │
│ [View Table] [Download CSV] [Investor]  │
└──────────────────────────────────────────┘
```

---

## 11. Implementation Roadmap

### Phase 1: Backend (Days 1–4)
- [ ] Create migration: `financial_models` table + RLS
- [ ] Implement `POST /api/financial-model/generate` (no save, instant compute)
- [ ] Implement calculation engine in `lib/financial-models.ts`
- [ ] Unit tests: 9 test scenarios + determinism check
- [ ] Rate limiting + credit system integration

### Phase 2: Frontend Wizard (Days 5–7)
- [ ] Build 5-step wizard component
- [ ] Integrate with dashboard layout
- [ ] Chart rendering (Recharts)
- [ ] CSV export logic
- [ ] Client-side validation + error messages

### Phase 3: Persistence & Integration (Days 8–10)
- [ ] Implement `POST /api/financial-model/save` (costs 2 credits)
- [ ] Implement `GET /api/financial-model/[id]`, `PUT`, `DELETE`
- [ ] Dashboard widget (latest model display)
- [ ] Series A readiness gate

### Phase 4: SVI & Pack Integration (Days 11–13)
- [ ] Link `svi_snapshots` to `financial_models`
- [ ] Update SVI scoring: FIN + TRE dimensions
- [ ] Investor pack: Revenue Projections section
- [ ] Use-of-funds auto-population
- [ ] Compliance scrubber: no named benchmarks

### Phase 5: Polish & Ship (Days 14)
- [ ] E2E tests (wizard flow → save → investor pack)
- [ ] Mobile responsiveness audit
- [ ] Performance: lazy-load charts, virtualize table
- [ ] Help tooltips + AFSL disclaimer
- [ ] Feature flag (gradual rollout)

---

## 12. Success Metrics & Analytics

### 12.1 Adoption Tracking

**Events to log:**

```typescript
// In relevant route handlers:

// Wizard start
analytics.track('financial_model.wizard_start', {
  projectId,
  userId,
  timestamp
});

// Step completion
analytics.track('financial_model.step_complete', {
  projectId,
  step: 1..5,
  durationSeconds: elapsed
});

// Projection generated
analytics.track('financial_model.generated', {
  projectId,
  modelType,
  scenario,
  computeTimeMs,
  creditsSpent: 0  // Free preview
});

// Model saved
analytics.track('financial_model.saved', {
  projectId,
  name,
  version: 1,
  creditsSpent: 2,
  useForInvestorPack: bool
});

// Investor pack export
analytics.track('investor_pack.revenue_section_used', {
  projectId,
  financialModelId,
  scenarioUsed: 'base'
});
```

### 12.2 Success Criteria (2-week post-ship)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Adoption (premium users) | 60%+ | Count `financial_model_saved` events / premium user count |
| Time-to-completion (p50) | <5 min | Median of `wizard_start` → `step_complete(step=5)` delta |
| Save rate (% who complete wizard) | 40%+ | `financial_model.saved` / `financial_model.generated` |
| Investor pack integration | 35%+ | Count `use_for_investor_pack=true` / total saved models |
| Support ticket reduction | -30% | Tickets mentioning "cash runway" or "runway calculation" |

---

## 13. Future Enhancements (Post T0121)

1. **Monte Carlo Scenarios** (v2): Replace bear/base/bull with probabilistic distribution (±20% stdev on each input)
2. **Sensitivity Analysis** (v2): "What if growth drops 5%?" → recalculate interactively
3. **Comparable-Company Benchmarking** (v3): "vs AU SaaS median growth" inline in projection
4. **Financing Scenarios** (v3): "With $500K seed, runway extends to month 28"
5. **AI Assumptions Assistant** (v4): "Based on your sector + stage, we suggest: growth 12%, COGS 25%, OpEx escalation +2%"
6. **Equity Dilution Modeling** (v4): "How many shares for Series A?" linked to cap-table
7. **Founder Collaboration** (v4): Share read-only link, comments on assumptions
8. **Audit Trail** (v4): Detailed change history for compliance + investor due diligence

---

## 14. Compliance & Disclaimers

### 14.1 AFSL (Australian Financial Services Licence)

**Every response includes:**

```
General information only. Not financial advice. Projections are 
illustrative estimates based on AU sector benchmarks and may differ 
materially from actual outcomes. Do not rely solely on this tool for 
investment decisions. Consult a qualified financial advisor.
```

### 14.2 No Named Benchmarks

**Prohibited in output:**
- "vs Stripe's growth rate"
- "Canva's burn efficiency"
- "Specific competitor data"

**Allowed:**
- "vs AU SaaS median (8% monthly growth)"
- "vs fintech baseline COGS (30%)"
- "vs AU startup average runway (16 months)"

### 14.3 Data Retention

- Projection snapshots (JSONB) stored indefinitely (immutable for audit)
- Soft-delete only (is_deleted flag, never purge)
- User can export/download at any time before deletion

---

## 15. Example: End-to-End Flow

### Founder: Sarah (Wellness SaaS)

**Current State:**
- ARR: $30K
- MRR: $2.5K
- Team: 2 co-founders
- Sector: SaaS (auto-detected)
- Runway: 8 months (current burn rate)

**Step 1: Model Type**
- Selects: **SaaS**
- Sector auto-filled: **SaaS / Software**
- Clicks: Next

**Step 2: Current State**
- Enters: ARR = $30K, monthly growth = 12%, churn = 5%
- No warnings (reasonable params)
- Clicks: Next

**Step 3: Cost Structure**
- COGS pre-filled: 20% (SaaS default)
- OpEx pre-filled: $25K/mo (sector default)
- Enters: Fixed costs = $5K/mo
- Validation: "OpEx $25K + fixed $5K = $30K/mo vs revenue $2.5K/mo → unsustainable"
- Sarah notes warning but proceeds
- Clicks: Next

**Step 4: Assumptions**
- Selects: **Base case** scenario
- Checks: "Include RDTI tax incentives" ✓
- Notes: "Assuming 2 new hires by month 12, marketing ramp in Q1"
- Clicks: Generate Projection

**Step 5: Results**
- Chart renders: Revenue growing exponentially, EBITDA crosses $0 at month 18
- Metrics show:
  - ARR@12mo: $180K
  - ARR@24mo: $520K
  - Breakeven: Month 18
  - Series A gate: Month 22
  - Runway: 18 months (until cash burn catches up)
- Sarah clicks: **[Save to Profile]**
  - Cost: 2 credits
  - Saved as: "Base case - Q3 2026"
  - Checkbox: "Use in investor pack" ✓

**Next Actions:**
- Sarah's dashboard now shows: "Cash runway: $180K → 18 months to Series A"
- SVI FIN dimension increases by +15 points (gate < 24mo)
- SVI TRE dimension increases by +5 points (projection shows $180K@12mo, which is realistic)
- Investor pack auto-includes revenue projections section (uses saved model)
- Sarah can now download investor pack with projections already baked in

---

## 16. Appendix: Field Descriptions

| Field | Type | Description | Default | Example |
|-------|------|-------------|---------|---------|
| `model_type` | enum | SaaS, Marketplace, Agency, Other | "saas" | "saas" |
| `current_arr_aud` | numeric | Annual revenue in AUD, already annualized | — | 50000 |
| `monthly_growth_pct` | numeric | Net monthly growth rate (includes churn) | — | 8.5 |
| `churn_pct` | numeric | % of customers lost per month | — | 3.2 |
| `cogs_pct` | numeric | Cost of goods sold as % of revenue | sector default | 25 |
| `opex_monthly_aud` | numeric | Operating expenses per month | sector default | 35000 |
| `fixed_costs_aud` | numeric | Fixed costs (rent, servers, etc.) | 0 | 8000 |
| `include_tax_incentives` | boolean | Apply RDTI premium (AU tax incentive) | false | true |
| `scenario` | enum | bear (conservative) / base / bull (aggressive) | "base" | "base" |
| `month_breakeven` | integer | 1-indexed month where EBITDA >= 0 | null | 18 |
| `months_to_seriesA` | integer | 1-indexed month where Series A is needed | null | 22 |
| `runway_months` | integer | Total months of cash before depletion | null | 18 |
| `arr_month_12_aud` | numeric | Annualized revenue at month 12 | — | 180000 |

---

**End of Design Document**

This design provides a complete, production-ready specification for the Revenue Forecast + Unit Economics Builder. All components, APIs, calculations, and integrations are detailed. Implementation can proceed immediately with 2-week execution target.
