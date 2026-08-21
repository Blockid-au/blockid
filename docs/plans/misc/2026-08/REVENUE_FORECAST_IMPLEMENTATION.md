# Revenue Forecast Implementation Guide
## Technical Stack & Code Organization

---

## File Structure

```
web/src/
├── app/api/
│   ├── financial-model/
│   │   ├── route.ts                    # POST /api/financial-model (new)
│   │   ├── [id]/
│   │   │   ├── route.ts                # GET/PUT/DELETE /api/financial-model/[id]
│   │   │   └── projection/
│   │   │       └── route.ts            # GET /api/financial-model/[id]/projection
│   │   └── list/
│   │       └── route.ts                # GET /api/financial-model?projectId=...
│   │
│   └── financial-model-audit/
│       └── route.ts                    # GET (admin only) for audit logs
│
├── components/
│   └── financial-model/
│       ├── financial-model-wizard.tsx  # Main 5-step wizard component
│       ├── wizard-step-1.tsx           # Model type selector
│       ├── wizard-step-2.tsx           # Current state (ARR, growth, churn)
│       ├── wizard-step-3.tsx           # Cost structure (COGS, OpEx)
│       ├── wizard-step-4.tsx           # Scenario + assumptions
│       ├── wizard-step-5.tsx           # Results display
│       ├── projection-chart.tsx        # Recharts visualization
│       ├── projection-table.tsx        # Monthly breakdown table
│       ├── metrics-card.tsx            # Summary metrics display
│       ├── scenario-explainer.tsx      # Bear/base/bull comparison
│       ├── sector-defaults.tsx         # Collapsible reference defaults
│       └── input-validators.ts         # Validation logic (shared)
│
├── components/dashboard/
│   ├── financial-forecast-card.tsx     # Widget: latest model summary
│   └── seriesA-readiness-card.tsx      # Widget: funding timeline
│
├── lib/
│   ├── financial-model/
│   │   ├── engine.ts                   # Core calculation logic (generateFinancialModel)
│   │   ├── validations.ts              # Input validation rules
│   │   ├── csv-export.ts               # projectionToCsv() function
│   │   ├── sector-defaults.ts          # SECTOR_BASE_GROWTH_PCT, SECTOR_RD_INTENSITY_PCT
│   │   └── tax-incentives.ts           # RDTI/ESIC calculation (wrapper)
│   │
│   ├── investor-pack/
│   │   └── financial-model-section.ts  # Assemble revenue projections section
│   │
│   └── svi-analysis/
│       └── financial-dimension.ts      # FIN & TRE dimension updates
│
├── db/
│   └── migrations/
│       └── 20260817_financial_models.sql  # Schema + RLS
│
└── test/
    ├── financial-model.test.ts         # Unit tests for calculation engine
    ├── financial-model.e2e.test.ts     # E2E: wizard → save → pack
    └── scenarios/
        ├── scenario-happy-path.test.ts
        ├── scenario-zero-revenue.test.ts
        ├── scenario-hypergrowth.test.ts
        └── scenario-churn.test.ts
```

---

## Key Implementation Files

### 1. `src/lib/financial-model/engine.ts`

**Purpose:** Core deterministic calculation engine. No randomness, no Date.now() calls.

**Exports:**

```typescript
// Main generator
export function generateFinancialModel(
  input: FinancialModelInput
): FinancialModelResult;

// Helpers
export function normalizeGrowthRate(pct: number, scenario: Scenario): number;
export function calculateOpexRamp(baseOpex: number, scenario: Scenario, month: number): number;
export function calculateHeadcount(founderCount: number, scenario: Scenario, month: number): number;
export function applyTaxIncentive(monthlyRdSpend: number, includeTaxIncentives: boolean): number;
export function csvExport(projection: FinancialModelResult): string;
```

**Implementation Notes:**
- Use `addMonths()` (deterministic) instead of new Date()
- No Math.random() anywhere
- Test: Run same inputs 1000x, assert output === each time
- Benchmark: Should compute 36-month projection in <100ms

---

### 2. `src/app/api/financial-model/route.ts`

**Purpose:** POST endpoint to generate + save projections.

**Flow:**
```typescript
export async function POST(request: Request) {
  // 1. Parse + validate JSON
  const input = await validateFinancialModelInput(request.body);
  if (!input.ok) return error400(input.error);

  // 2. Auth check
  const user = await getCurrentUser();
  const identity = user?.id ?? ipFromRequest(request);

  // 3. Rate limit
  const rl = await checkRateLimit("default", ["financial-model", identity]);
  if (!rl.allowed) return error429(rl.resetAt);

  // 4. Credit gate (if logged in + saving)
  if (user && request.query.save === "true") {
    const afford = await canAfford(user.id, "financial_model");
    if (!afford.allowed) return error402(afford.balance);
    
    await spendCredits(user.id, "financial_model", { ...metadata });
  }

  // 5. Compute projection (deterministic)
  const projection = generateFinancialModel(input.data);

  // 6. Optionally save to DB
  if (user && request.query.save === "true") {
    const model = await db
      .insert(financial_models)
      .values({
        project_id: input.data.projectId,
        user_id: user.id,
        projection_data: projection,
        // ... other fields
      })
      .returning("*");
    
    return json200({ ok: true, model, projection, creditsSpent: 2 });
  }

  // 7. Return preview (no save, no credits)
  return json200({ ok: true, projection, creditsSpent: 0 });
}
```

---

### 3. `src/components/financial-model/financial-model-wizard.tsx`

**Structure:**

```typescript
interface WizardState {
  currentStep: 1 | 2 | 3 | 4 | 5;
  formData: Partial<FinancialModelInput>;
  projection: FinancialModelResult | null;
  isLoading: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

export function FinancialModelWizard({ projectId }: { projectId: string }) {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [credits, setCredits] = useState<number | null>(null);

  const handleNext = (stepData: Partial<FinancialModelInput>) => {
    const merged = { ...state.formData, ...stepData };
    const validation = validateStep(state.currentStep, merged);
    
    if (!validation.ok) {
      setState(s => ({ ...s, errors: validation.errors }));
      return;
    }

    setState(s => ({
      ...s,
      formData: merged,
      currentStep: (s.currentStep + 1) as any,
      warnings: validation.warnings
    }));
  };

  const handleGenerate = async () => {
    setState(s => ({ ...s, isLoading: true }));
    try {
      const res = await fetch("/api/financial-model", {
        method: "POST",
        body: JSON.stringify({ ...state.formData, projectId }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error);
        return;
      }

      const { projection, creditsRemaining } = await res.json();
      setState(s => ({
        ...s,
        projection,
        currentStep: 5,
        isLoading: false
      }));
      setCredits(creditsRemaining);
    } catch (e) {
      toast.error("Failed to generate projection");
      setState(s => ({ ...s, isLoading: false }));
    }
  };

  return (
    <div className="wizard-container">
      <ProgressBar current={state.currentStep} total={5} />
      
      {state.currentStep === 1 && <Step1ModelType onNext={handleNext} />}
      {state.currentStep === 2 && <Step2CurrentState onNext={handleNext} />}
      {state.currentStep === 3 && <Step3CostStructure onNext={handleNext} />}
      {state.currentStep === 4 && <Step4Assumptions onGenerate={handleGenerate} />}
      {state.currentStep === 5 && (
        <Step5Results projection={state.projection} credits={credits} />
      )}
    </div>
  );
}
```

---

### 4. `src/lib/financial-model/validations.ts`

**Purpose:** Input validation rules (client + server).

```typescript
export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

export function validateFinancialModelInput(data: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  // Type guards + range checks
  if (!Number.isFinite(data.currentArrAud) || data.currentArrAud < 0) {
    errors.currentArrAud = "ARR must be a non-negative number";
  }
  if (data.currentArrAud > 1e9) {
    errors.currentArrAud = "ARR exceeds 1 billion (unrealistic)";
  }

  if (data.monthlyGrowthPct < -100 || data.monthlyGrowthPct > 500) {
    errors.monthlyGrowthPct = "Growth must be between -100% and 500%";
  }
  if (data.monthlyGrowthPct === 0 && data.currentArrAud === 0) {
    warnings.growth = "No revenue and no growth. Check assumptions.";
  }

  // OpEx vs revenue sanity check
  const monthlyRevenue = data.currentArrAud / 12;
  if (data.opexMonthlyAud + data.fixedCostsAud > monthlyRevenue) {
    warnings.opex = "Monthly costs exceed revenue. High burn period.";
  }

  // Churn + growth viability
  if (data.churnPct > data.monthlyGrowthPct) {
    warnings.churn = "Churn exceeds growth. Negative unit economics?";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    warnings
  };
}
```

---

### 5. `src/lib/financial-model/sector-defaults.ts`

**Purpose:** Lookup table for sector-specific assumptions.

```typescript
export const SECTOR_BASE_GROWTH_PCT: Record<string, number> = {
  ai: 12,
  saas: 8,
  fintech: 7,
  healthtech: 6,
  marketplace: 7,
  ecommerce: 6,
  default: 6,
};

export const SECTOR_RD_INTENSITY_PCT: Record<string, number> = {
  deeptech: 40,
  biotech: 40,
  ai: 30,
  saas: 20,
  fintech: 20,
  default: 10,
};

export const SECTOR_COGS_PCT: Record<string, number> = {
  saas: 25,
  fintech: 20,
  ecommerce: 45,
  marketplace: 15,
  default: 30,
};

export const SECTOR_OPEX_MONTHLY_AUD: Record<string, number> = {
  // These are BASE estimates for a 2-founder startup
  saas: 35000,
  fintech: 45000,
  marketplace: 40000,
  deeptech: 50000,
  default: 35000,
};

export function getDefaults(sector: string): SectorDefaults {
  const key = sector.toLowerCase();
  return {
    baseGrowthPct: SECTOR_BASE_GROWTH_PCT[key] ?? SECTOR_BASE_GROWTH_PCT.default,
    cogsPct: SECTOR_COGS_PCT[key] ?? SECTOR_COGS_PCT.default,
    rdIntensityPct: SECTOR_RD_INTENSITY_PCT[key] ?? SECTOR_RD_INTENSITY_PCT.default,
    opexMonthlyAud: SECTOR_OPEX_MONTHLY_AUD[key] ?? SECTOR_OPEX_MONTHLY_AUD.default,
  };
}
```

---

### 6. `src/lib/investor-pack/financial-model-section.ts`

**Purpose:** Assemble revenue projections section for investor pack.

```typescript
export async function buildFinancialModelSection(
  projectId: string,
  overrides?: { useOfFunds?: string; raiseTarget?: number }
): Promise<InvestorPackSection | null> {
  // 1. Fetch latest published model
  const model = await db
    .from("financial_models")
    .select("*")
    .eq("project_id", projectId)
    .eq("use_for_investor_pack", true)
    .eq("is_deleted", false)
    .order("published_at", { ascending: false })
    .limit(1)
    .single();

  if (!model) return null;

  // 2. Extract key metrics from projection_data
  const projection = model.projection_data as FinancialModelResult;
  const arrMonth12 = projection.summary.arrMonth12;
  const arrMonth24 = projection.summary.arrMonth24;
  const breakeven = projection.summary.monthBreakeven;
  const seriesAGate = projection.summary.monthsToSeriesA;

  // 3. Generate markdown with NO named benchmarks
  const content = `
## Revenue Projections

**Founder Projection (${model.scenario.toUpperCase()} Case)**

- Current ARR: A$${formatAud(model.current_arr_aud)}
- Assumed monthly growth: ${model.monthly_growth_pct}%
- Assumed churn: ${model.churn_pct}%

**36-Month Milestones**
- ARR at month 12: A$${formatAud(arrMonth12)}
- ARR at month 24: A$${formatAud(arrMonth24)}
- Breakeven (EBITDA+): Month ${breakeven || "beyond 36mo"}
- Series A funding timeline: Month ${seriesAGate || "not required"}

**Key Assumptions**
- COGS: ${model.cogs_pct}% of revenue
- OpEx base: A$${formatAud(model.opex_monthly_aud)}/month
- Tax incentives (RDTI): ${model.include_tax_incentives ? "Applied" : "Not applied"}

**Founder Notes**
${model.notes || "No additional notes."}

---
*Projections are illustrative estimates based on AU sector benchmarks. Not financial advice. Consult a qualified advisor.*
  `;

  // 4. Build use-of-funds subsection
  let useOfFunds = "";
  if (seriesAGate && seriesAGate < 36) {
    const runwayGap = seriesAGate - 12; // Months until Series A needed
    const estimatedRaise = (model.opex_monthly_aud * runwayGap) / 1e6;
    
    useOfFunds = `
### Use of Funds (${runwayGap}-Month Runway)

Estimated capital requirement: A$${formatAud(estimatedRaise * 1e6)}

Proposed allocation (subject to revision):
- Team expansion: 45% (${estimatedRaise * 0.45}M)
- Marketing & customer acquisition: 30% (${estimatedRaise * 0.30}M)
- Infrastructure & operations: 15% (${estimatedRaise * 0.15}M)
- Buffer & contingency: 10% (${estimatedRaise * 0.10}M)
    `;
  }

  return {
    pageId: "P3-revenue-projections",
    title: "Revenue Projections",
    content: content + useOfFunds,
    dataPoints: {
      arrMonth12,
      arrMonth24,
      breakeven,
      seriesAGate,
      scenario: model.scenario,
    }
  };
}
```

---

### 7. `src/lib/svi-analysis/financial-dimension.ts`

**Purpose:** Integrate financial models into SVI scoring.

```typescript
export async function computeFinancialDimension(
  projectId: string,
  analysis: SVIAnalysis
): Promise<number> {
  let score = 25;  // Base financial score

  // 1. Fetch latest saved model
  const model = await getLatestFinancialModel(projectId);
  if (!model) {
    // No model = no bonus, but no penalty
    return score;
  }

  // 2. Award points for evidence of planning
  if (model.monthsToSeriesA && model.monthsToSeriesA <= 24) {
    score += 15;  // Planning ahead, realistic Series A gate
  }

  if (model.monthBreakeven && model.monthBreakeven <= 24) {
    score += 10;  // Path to profitability identified
  }

  // 3. Award points if projection conservatism validated
  const month12Revenue = model.arr_month_12_aud;
  const actualMRR = analysis.estimatedMRR ?? 0;
  
  if (actualMRR > month12Revenue * 0.8) {
    // Founder is tracking or exceeding projection
    score += 5;
  } else if (actualMRR < month12Revenue * 0.5) {
    // Founder is significantly behind projection
    score -= 5;
  }

  return Math.min(Math.max(score, 0), 50);  // Clamp to dimension max
}

export async function computeTractionDimension(
  projectId: string,
  analysis: SVIAnalysis
): Promise<number> {
  let score = 30;  // Base traction score

  const model = await getLatestFinancialModel(projectId);
  if (!model) return score;

  // Boost confidence if revenue projection is backed by actual data
  if (analysis.hasRevenue && model.arr_month_12_aud) {
    const projectedMonth12 = model.arr_month_12_aud;
    const actualAnnual = (analysis.estimatedMRR ?? 0) * 12;

    if (actualAnnual > projectedMonth12 * 0.7) {
      // Evidence-backed growth trajectory
      score += 20;
    }
  }

  return Math.min(Math.max(score, 0), 50);
}
```

---

## Database Migration Script

**File:** `web/supabase/migrations/20260817_financial_models.sql`

```sql
-- See REVENUE_FORECAST_DESIGN.md §1.1 for full schema
-- Copy the CREATE TABLE + RLS policies from design doc

-- After applying this migration:
-- 1. supabase db push
-- 2. Verify with: psql $DATABASE_URL -c "SELECT * FROM financial_models LIMIT 1"
```

---

## Testing Strategy

### Unit Tests (`test/financial-model.test.ts`)

```typescript
describe("generateFinancialModel", () => {
  it("should generate deterministic output (same input → same output)", () => {
    const input = { /* test data */ };
    const out1 = generateFinancialModel(input);
    const out2 = generateFinancialModel(input);
    expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
  });

  it("should compute breakeven at month 18 for SaaS happy path", () => {
    const projection = generateFinancialModel(HAPPY_PATH_INPUT);
    expect(projection.summary.monthBreakeven).toBe(18);
  });

  it("should apply RDTI tax offset correctly", () => {
    const withRdti = generateFinancialModel({ ...input, includeTaxIncentives: true });
    const withoutRdti = generateFinancialModel({ ...input, includeTaxIncentives: false });
    
    // Month 6 EBITDA should be better with RDTI
    expect(withRdti.months[5].ebitdaAud).toBeGreaterThan(withoutRdti.months[5].ebitdaAud);
  });

  it("should handle 100% churn as edge case", () => {
    const projection = generateFinancialModel({ ...input, churnPct: 100 });
    // ARR should collapse by month 2
    expect(projection.months[1].revenueAud).toBeLessThan(input.currentArrAud / 12);
  });

  it("should handle zero revenue (pre-launch)", () => {
    const projection = generateFinancialModel({ ...input, currentArrAud: 0 });
    expect(projection.months[0].revenueAud).toBe(0);
    expect(projection.months[0].cumCashAud).toBeGreaterThan(0);  // Burn
  });
});
```

### E2E Tests (`test/financial-model.e2e.test.ts`)

```typescript
describe("Financial Model Wizard E2E", () => {
  it("should complete full wizard flow and save to DB", async () => {
    // 1. Navigate to wizard
    // 2. Fill step 2: ARR $50K, growth 8%, churn 3%
    // 3. Fill step 3: COGS 25%, OpEx $30K, fixed costs $5K
    // 4. Select base scenario, enable RDTI
    // 5. Click Generate
    // 6. Verify chart renders + metrics display
    // 7. Click Save (costs 2 credits)
    // 8. Verify model saved to DB
    // 9. Navigate to dashboard
    // 10. Verify "Financial Forecast" widget displays latest model
    // 11. Generate investor pack
    // 12. Verify pack includes Revenue Projections section
  });
});
```

---

## Performance Checklist

- [ ] Projection generation: <100ms (target)
- [ ] CSV export: <200ms for 36-month table
- [ ] Chart render: Recharts ComposedChart with 36 data points (lazy load on mobile)
- [ ] Table virtualization: Only render visible rows (Tanstack React Table or react-window)
- [ ] Lazy load: Chart hidden until step 5 (defer JS parsing)
- [ ] API response time: <500ms (projection compute + DB insert)
- [ ] Mobile: Wizard fits mobile viewport (single column, full-width inputs)

---

## Rollout Plan

### Feature Flag
```typescript
// lib/features.ts
export const FEATURE_FLAGS = {
  FINANCIAL_MODEL_BETA: process.env.NEXT_PUBLIC_FINANCIAL_MODEL_BETA === "true",
};

// Usage in component:
{FEATURE_FLAGS.FINANCIAL_MODEL_BETA && <FinancialModelWizard />}
```

### Gradual Rollout
- **Day 1–3:** Internal only (set flag via ENV)
- **Day 4–7:** 10% of premium users (AB test)
- **Day 8–10:** 50% of premium users (monitor errors)
- **Day 11–14:** 100% (full release)

### Monitoring
- Error rate: Alert if > 1% of generate requests fail
- Credit spend: Track average 2-credit spend per model saved
- Adoption: Daily active users using wizard
- Performance: P95 latency of /api/financial-model/generate

---

## Dependencies & Versions

```json
{
  "recharts": "^2.10.0",
  "react-hook-form": "^7.48.0",
  "zod": "^3.22.0",
  "supabase": "^2.38.0",
  "next": "^16.0.0"
}
```

---

**End of Implementation Guide**

This document provides the complete technical roadmap for implementation. Each file listed can be built independently and integrated incrementally.
