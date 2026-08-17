/**
 * src/lib/c-level/compute-c-level-dcf.ts
 *
 * C-Level CFO DCF Valuation Engine (v3.8.0)
 *
 * Deterministic, no randomness. All inputs → outputs are pure.
 *
 * Produces:
 *   - 5-year DCF valuation across bear/base/bull scenarios
 *   - 5-driver × 3-scenario sensitivity table
 *   - Founder exit payouts with AU CGT (50% discount + 47% marginal top rate)
 *   - Anonymised AU precedent comps
 *   - Markdown-ready narrative fragments for the CFO nightly report
 *
 * WACC anchors (AU early-stage, Cut Through Venture / AVCAL 2024–2026):
 *   bear = 42%, base = 38%, bull = 34%
 *
 * Terminal value: Gordon Growth (g = 4.0% AU long-run nominal GDP proxy).
 *
 * Integration:
 *   - Consumes ProjectionOutput from web/src/lib/forecast-builder.ts
 *   - Consumes SVI analysis output (score 0–200)
 *   - Consumes ExitStrategy fragments from exit-strategy.helpers.ts
 *
 * NOTE: NEVER include real Australian or global company names in output.
 * Comparables must come from the anonymised au-benchmark helper only.
 */

import type { ProjectionOutput } from "@/types/financial";

// ─── Types ────────────────────────────────────────────────────────────────

export type Scenario = "bear" | "base" | "bull";

export interface FinancialModelSnapshot {
  /** Latest MRR in AUD (0 for pre-revenue). */
  mrrAud: number;
  /** Monthly growth rate (decimal, e.g. 0.10 = 10% MoM). */
  monthlyGrowthRate: number;
  /** Monthly customer churn (decimal). */
  churnRate: number;
  /** Monthly OpEx burn in AUD. */
  monthlyBurnAud: number;
  /** Gross margin (decimal, e.g. 0.75 = 75%). */
  grossMarginPct: number;
  /** R&D spend as fraction of OpEx (for RDTI calc). */
  rndSpendFraction: number;
  /** Sector tag (used for terminal multiple + comp lookups). */
  sector:
    | "saas"
    | "fintech"
    | "marketplace"
    | "healthtech"
    | "ai"
    | "deeptech"
    | "cybertech"
    | "edtech"
    | "proptech"
    | "default";
  /** Cash balance in AUD (used for runway calc). */
  cashBalanceAud: number;
  /** Optional 36-month projection from forecast-builder. */
  projection?: ProjectionOutput | null;
}

export interface SviAnalysisSnapshot {
  /** SVI total score (0-200). */
  totalScore: number;
  /** Evidence completeness (0-1, 1 = fully evidenced). */
  evidenceCompleteness: number;
  /** Journey stage 1-7 (1=idea, 3=seed, 4=A, 5=B, 6=C, 7=late). */
  stage: number;
}

export interface ExitStrategySnapshot {
  founderStakePct: number; // Post-Series-B, pre-exit founder stake
  costBaseAud: number; // Estimated founder cost base
  targetExitValuationAud?: number; // Optional override
}

export interface DcfScenarioResult {
  scenario: Scenario;
  wacc: number;
  fcfYears: number[]; // AUD per year (Y1..Y5)
  pvFcf: number; // Sum of discounted Y1..Y5
  terminalValue: number; // AUD (undiscounted)
  pvTerminal: number; // Discounted AUD
  enterpriseValueAud: number;
  gordonGrowthG: number;
  notes: string;
}

export interface SensitivityCell {
  driver: string;
  base: number;
  bear: number;
  bull: number;
  bearImpactPct: number; // Δ EV vs base
  bullImpactPct: number;
  dominantLever: boolean;
}

export interface FounderExit {
  scenario: Scenario;
  exitValuationAud: number;
  founderStakePct: number;
  grossPayoutAud: number;
  costBaseAud: number;
  capitalGainAud: number;
  cgtDiscountedGainAud: number; // After 50% discount
  cgtEstimateAud: number; // 47% × discounted gain
  netPayoutAud: number;
}

export interface AnonymisedComp {
  label: string;
  buyerType: string;
  dealYear: number;
  dealSizeAud: number;
  revenueMultiple: number;
}

export interface CFOValuationReport {
  computedAt: string; // ISO date
  version: string;
  scenarios: Record<Scenario, DcfScenarioResult>;
  enterpriseValue: {
    lowAud: number;
    midAud: number;
    highAud: number;
    confidence: "low" | "medium" | "high";
  };
  sensitivity: {
    baseEvAud: number;
    drivers: SensitivityCell[];
    dominantLever: string;
  };
  founderExits: FounderExit[];
  comps: AnonymisedComp[];
  rdtiRefundYear1Aud: number;
  esicQualifies: boolean;
  narrativeMarkdown: string;
  disclaimer: string;
}

// ─── Constants ────────────────────────────────────────────────────────────

const VERSION = "3.8.0";

const WACC_BY_SCENARIO: Record<Scenario, number> = {
  bear: 0.42,
  base: 0.38,
  bull: 0.34,
};

const GORDON_GROWTH_G = 0.04; // 4% AU long-run nominal GDP

const CGT_DISCOUNT_RATE = 0.5;
const CGT_MARGINAL_TOP = 0.47;

const RDTI_REFUND_RATE = 0.435;
const RDTI_TURNOVER_CAP_AUD = 20_000_000;

// Exit multiples by sector (forward revenue, mid-stage AU)
const SECTOR_TERMINAL_MULTIPLE: Record<FinancialModelSnapshot["sector"], number> = {
  saas: 6.0,
  fintech: 5.0,
  marketplace: 4.0,
  healthtech: 6.5,
  ai: 10.0,
  deeptech: 7.0,
  cybertech: 7.5,
  edtech: 5.5,
  proptech: 4.5,
  default: 5.0,
};

// Anonymised AU comps — never real company names.
const ANONYMISED_COMPS: Record<FinancialModelSnapshot["sector"], AnonymisedComp[]> = {
  saas: [
    { label: "AU SaaS Strategic Buyer 2022", buyerType: "strategic", dealYear: 2022, dealSizeAud: 120_000_000, revenueMultiple: 5.4 },
    { label: "AU SaaS PE Roll-up 2023", buyerType: "private-equity", dealYear: 2023, dealSizeAud: 65_000_000, revenueMultiple: 4.1 },
    { label: "AU SaaS Trade Sale Pattern 2024", buyerType: "strategic", dealYear: 2024, dealSizeAud: 45_000_000, revenueMultiple: 3.8 },
  ],
  fintech: [
    { label: "AU Fintech Trade Sale Pattern 2022", buyerType: "strategic", dealYear: 2022, dealSizeAud: 90_000_000, revenueMultiple: 4.2 },
    { label: "ASX-listed Fintech Acquirer 2023", buyerType: "strategic-listed", dealYear: 2023, dealSizeAud: 55_000_000, revenueMultiple: 3.6 },
  ],
  marketplace: [
    { label: "AU Marketplace Exit Archetype 2021", buyerType: "strategic", dealYear: 2021, dealSizeAud: 40_000_000, revenueMultiple: 3.2 },
    { label: "AU Marketplace PE Buyer 2024", buyerType: "private-equity", dealYear: 2024, dealSizeAud: 25_000_000, revenueMultiple: 2.7 },
  ],
  healthtech: [
    { label: "AU HealthTech Roll-up Acquirer 2023", buyerType: "strategic", dealYear: 2023, dealSizeAud: 55_000_000, revenueMultiple: 6.0 },
    { label: "AU HealthTech Trade Sale 2022", buyerType: "strategic", dealYear: 2022, dealSizeAud: 30_000_000, revenueMultiple: 5.5 },
  ],
  ai: [
    { label: "Global AI Acquirer (AU target) 2024", buyerType: "strategic-us", dealYear: 2024, dealSizeAud: 180_000_000, revenueMultiple: 12.0 },
    { label: "AU AI Talent Acqui-hire 2023", buyerType: "acqui-hire", dealYear: 2023, dealSizeAud: 15_000_000, revenueMultiple: 8.0 },
  ],
  cybertech: [
    { label: "ASX-listed Cybertech Acquirer 2023", buyerType: "strategic-listed", dealYear: 2023, dealSizeAud: 70_000_000, revenueMultiple: 7.0 },
  ],
  deeptech: [
    { label: "AU DeepTech Sovereign Fund Pattern 2024", buyerType: "sovereign", dealYear: 2024, dealSizeAud: 100_000_000, revenueMultiple: 8.5 },
  ],
  edtech: [
    { label: "AU EdTech Trade Sale 2022", buyerType: "strategic", dealYear: 2022, dealSizeAud: 30_000_000, revenueMultiple: 4.8 },
  ],
  proptech: [
    { label: "AU PropTech Trade Sale 2023", buyerType: "strategic", dealYear: 2023, dealSizeAud: 22_000_000, revenueMultiple: 4.0 },
  ],
  default: [
    { label: "AU Generic Tech Trade Sale 2023", buyerType: "strategic", dealYear: 2023, dealSizeAud: 25_000_000, revenueMultiple: 3.5 },
  ],
};

const DISCLAIMER =
  "NFA — general information only. Not financial or investment advice under Corporations Act 2001 (Cth). All valuation figures are AI-generated projections based on the founder's inputs and anonymised AU market benchmarks; consult a licensed financial adviser before making decisions.";

// ─── Core DCF ─────────────────────────────────────────────────────────────

interface ScenarioAdjustments {
  growthMultiplier: number;
  churnMultiplier: number;
  cogsAdditivePp: number; // percentage points added to (1 - grossMargin)
  burnMultiplier: number;
}

const ADJUSTMENTS: Record<Scenario, ScenarioAdjustments> = {
  bear: { growthMultiplier: 0.75, churnMultiplier: 1.5, cogsAdditivePp: 0.03, burnMultiplier: 1.10 },
  base: { growthMultiplier: 1.0, churnMultiplier: 1.0, cogsAdditivePp: 0.0, burnMultiplier: 1.0 },
  bull: { growthMultiplier: 1.25, churnMultiplier: 0.75, cogsAdditivePp: -0.02, burnMultiplier: 0.90 },
};

/**
 * Project 5 annual FCFs for a scenario using S-curve dampening.
 * Deterministic — no randomness.
 */
function projectFiveYearFcf(
  model: FinancialModelSnapshot,
  scenario: Scenario,
): { fcfYears: number[]; year5Arr: number } {
  const adj = ADJUSTMENTS[scenario];
  const monthlyGrowth = Math.max(0, model.monthlyGrowthRate * adj.growthMultiplier);
  const monthlyChurn = Math.min(0.5, model.churnRate * adj.churnMultiplier);
  const grossMargin = Math.max(0.10, Math.min(0.95, model.grossMarginPct - adj.cogsAdditivePp));
  const monthlyBurn = model.monthlyBurnAud * adj.burnMultiplier;

  const fcfYears: number[] = [];
  let arr = model.mrrAud * 12;
  // Pre-revenue guard: seed a nominal ARR from SVI-ish default so DCF is not zero.
  if (arr <= 0) arr = 30_000;

  for (let y = 1; y <= 5; y++) {
    // Compound MoM growth for 12 months with S-curve dampening
    let year = arr;
    for (let m = 0; m < 12; m++) {
      const monthIdx = (y - 1) * 12 + m + 1;
      const dampen = 1 - Math.min(0.5, monthIdx * 0.005); // slower as we age
      year = year * (1 + monthlyGrowth * dampen) * (1 - monthlyChurn);
    }
    const revenue = (arr + year) / 2; // average for the year (trapezoid)
    const gp = revenue * grossMargin;
    const opex = monthlyBurn * 12 * Math.pow(1 + 0.02 * (scenario === "bull" ? 1.5 : scenario === "bear" ? 0.5 : 1.0), y - 1);
    const ebit = gp - opex;
    const taxRate = ebit > 0 ? (scenario === "bull" ? 0.21 : 0.25) : 0;
    const rdtiRefund = opex * model.rndSpendFraction * RDTI_REFUND_RATE;
    const fcf = ebit * (1 - taxRate) + rdtiRefund;
    fcfYears.push(Math.round(fcf));
    arr = year;
  }
  return { fcfYears, year5Arr: arr };
}

function discount(cashflow: number, wacc: number, year: number): number {
  return cashflow / Math.pow(1 + wacc, year);
}

/**
 * Build a single scenario DCF result.
 */
function buildScenario(
  model: FinancialModelSnapshot,
  scenario: Scenario,
): DcfScenarioResult {
  const wacc = WACC_BY_SCENARIO[scenario];
  const { fcfYears, year5Arr } = projectFiveYearFcf(model, scenario);

  const pvFcf = fcfYears.reduce((acc, fcf, i) => acc + discount(fcf, wacc, i + 1), 0);

  // Terminal value — take the max of Gordon-Growth and exit-multiple methods
  // as a defensible upper bound (pick the exit-multiple as the primary anchor
  // because it maps closer to how AU strategic acquirers price at Series B+).
  const grossMargin = model.grossMarginPct - ADJUSTMENTS[scenario].cogsAdditivePp;
  const year5FcfMargin = Math.max(0.05, grossMargin - 0.20);
  const year5Fcf = year5Arr * year5FcfMargin;
  const gordonTv = year5Fcf / Math.max(0.05, wacc - GORDON_GROWTH_G);

  const multiple = SECTOR_TERMINAL_MULTIPLE[model.sector] ?? SECTOR_TERMINAL_MULTIPLE.default;
  const exitTv = year5Arr * multiple;

  const terminalValue = Math.max(gordonTv, exitTv);
  const pvTerminal = discount(terminalValue, wacc, 5);

  const enterpriseValueAud = Math.max(0, Math.round(pvFcf + pvTerminal));

  return {
    scenario,
    wacc,
    fcfYears,
    pvFcf: Math.round(pvFcf),
    terminalValue: Math.round(terminalValue),
    pvTerminal: Math.round(pvTerminal),
    enterpriseValueAud,
    gordonGrowthG: GORDON_GROWTH_G,
    notes:
      `Year 5 ARR ${formatAud(year5Arr)}; TV method = ${terminalValue === exitTv ? "exit-multiple" : "gordon-growth"}; ` +
      `sector multiple ${multiple.toFixed(1)}x`,
  };
}

// ─── Sensitivity Table ────────────────────────────────────────────────────

interface Driver {
  name: string;
  base: number;
  bear: number;
  bull: number;
  mutate: (model: FinancialModelSnapshot, value: number) => FinancialModelSnapshot;
}

function buildSensitivityDrivers(model: FinancialModelSnapshot): Driver[] {
  const g = model.monthlyGrowthRate;
  const c = model.churnRate;
  const gm = model.grossMarginPct;
  return [
    {
      name: "ARR growth MoM",
      base: g,
      bear: Math.max(0, g * 0.75),
      bull: g * 1.25,
      mutate: (m, v) => ({ ...m, monthlyGrowthRate: v }),
    },
    {
      name: "Monthly churn",
      base: c,
      bear: c * 1.5,
      bull: Math.max(0.001, c * 0.75),
      mutate: (m, v) => ({ ...m, churnRate: v }),
    },
    {
      name: "Gross margin",
      base: gm,
      bear: Math.max(0.10, gm - 0.05),
      bull: Math.min(0.95, gm + 0.05),
      mutate: (m, v) => ({ ...m, grossMarginPct: v }),
    },
    {
      name: "OpEx burn",
      base: model.monthlyBurnAud,
      bear: model.monthlyBurnAud * 1.10,
      bull: model.monthlyBurnAud * 0.90,
      mutate: (m, v) => ({ ...m, monthlyBurnAud: v }),
    },
    {
      name: "S&M efficiency (proxy: MRR)",
      base: model.mrrAud,
      bear: model.mrrAud * 0.85,
      bull: model.mrrAud * 1.15,
      mutate: (m, v) => ({ ...m, mrrAud: v }),
    },
  ];
}

function buildSensitivity(model: FinancialModelSnapshot, baseEv: number): {
  drivers: SensitivityCell[];
  dominantLever: string;
} {
  const drivers = buildSensitivityDrivers(model);
  const cells: SensitivityCell[] = drivers.map((d) => {
    const bearModel = d.mutate(model, d.bear);
    const bullModel = d.mutate(model, d.bull);
    const bearEv = buildScenario(bearModel, "base").enterpriseValueAud;
    const bullEv = buildScenario(bullModel, "base").enterpriseValueAud;
    const bearImpactPct = baseEv > 0 ? ((bearEv - baseEv) / baseEv) * 100 : 0;
    const bullImpactPct = baseEv > 0 ? ((bullEv - baseEv) / baseEv) * 100 : 0;
    return {
      driver: d.name,
      base: d.base,
      bear: d.bear,
      bull: d.bull,
      bearImpactPct: round2(bearImpactPct),
      bullImpactPct: round2(bullImpactPct),
      dominantLever: false,
    };
  });

  // Dominant lever: largest total absolute impact
  let maxIdx = 0;
  let maxImpact = 0;
  cells.forEach((c, i) => {
    const total = Math.abs(c.bearImpactPct) + Math.abs(c.bullImpactPct);
    if (total > maxImpact) {
      maxImpact = total;
      maxIdx = i;
    }
  });
  cells[maxIdx].dominantLever = true;

  return { drivers: cells, dominantLever: cells[maxIdx].driver };
}

// ─── Founder Exit Payouts ─────────────────────────────────────────────────

function buildFounderExits(
  scenarios: Record<Scenario, DcfScenarioResult>,
  exit: ExitStrategySnapshot,
): FounderExit[] {
  return (["bear", "base", "bull"] as Scenario[]).map((s) => {
    const ev = exit.targetExitValuationAud ?? scenarios[s].enterpriseValueAud;
    const founderStake = Math.max(0, Math.min(1, exit.founderStakePct / 100));
    const grossPayoutAud = Math.round(ev * founderStake);
    const capitalGainAud = Math.max(0, grossPayoutAud - exit.costBaseAud);
    const cgtDiscountedGainAud = Math.round(capitalGainAud * (1 - CGT_DISCOUNT_RATE));
    const cgtEstimateAud = Math.round(cgtDiscountedGainAud * CGT_MARGINAL_TOP);
    return {
      scenario: s,
      exitValuationAud: ev,
      founderStakePct: exit.founderStakePct,
      grossPayoutAud,
      costBaseAud: exit.costBaseAud,
      capitalGainAud,
      cgtDiscountedGainAud,
      cgtEstimateAud,
      netPayoutAud: grossPayoutAud - cgtEstimateAud,
    };
  });
}

// ─── Confidence + Enterprise Value Roll-up ────────────────────────────────

function confidenceBand(svi: SviAnalysisSnapshot): "low" | "medium" | "high" {
  if (svi.evidenceCompleteness >= 0.75 && svi.totalScore >= 140) return "high";
  if (svi.evidenceCompleteness >= 0.5 && svi.totalScore >= 110) return "medium";
  return "low";
}

// ─── Public API ───────────────────────────────────────────────────────────

export function buildCFODCFValuation(
  financialModel: FinancialModelSnapshot,
  sviAnalysis: SviAnalysisSnapshot,
  exitStrategy: ExitStrategySnapshot,
): CFOValuationReport {
  const scenarios: Record<Scenario, DcfScenarioResult> = {
    bear: buildScenario(financialModel, "bear"),
    base: buildScenario(financialModel, "base"),
    bull: buildScenario(financialModel, "bull"),
  };

  const baseEv = scenarios.base.enterpriseValueAud;
  const sensitivity = buildSensitivity(financialModel, baseEv);

  const founderExits = buildFounderExits(scenarios, exitStrategy);
  const comps = ANONYMISED_COMPS[financialModel.sector] ?? ANONYMISED_COMPS.default;

  // RDTI Y1 refund (approximation): rndSpendFraction × annual OpEx × 43.5%,
  // but only if annual revenue (12 × MRR) below A$20M turnover cap.
  const annualRevenue = financialModel.mrrAud * 12;
  const annualOpex = financialModel.monthlyBurnAud * 12;
  const rdtiRefundYear1Aud =
    annualRevenue < RDTI_TURNOVER_CAP_AUD
      ? Math.round(annualOpex * financialModel.rndSpendFraction * RDTI_REFUND_RATE)
      : 0;

  // ESIC qualifies broadly: early stage (stage ≤ 4), revenue < A$200k in prior FY.
  const esicQualifies = sviAnalysis.stage <= 4 && annualRevenue < 200_000;

  const enterpriseValue = {
    lowAud: scenarios.bear.enterpriseValueAud,
    midAud: scenarios.base.enterpriseValueAud,
    highAud: scenarios.bull.enterpriseValueAud,
    confidence: confidenceBand(sviAnalysis),
  };

  const narrativeMarkdown = renderMarkdown({
    scenarios,
    sensitivity,
    founderExits,
    comps,
    rdtiRefundYear1Aud,
    esicQualifies,
    enterpriseValue,
    financialModel,
    sviAnalysis,
  });

  return {
    computedAt: new Date().toISOString(),
    version: VERSION,
    scenarios,
    enterpriseValue,
    sensitivity: {
      baseEvAud: baseEv,
      drivers: sensitivity.drivers,
      dominantLever: sensitivity.dominantLever,
    },
    founderExits,
    comps,
    rdtiRefundYear1Aud,
    esicQualifies,
    narrativeMarkdown,
    disclaimer: DISCLAIMER,
  };
}

// ─── Markdown Renderer ────────────────────────────────────────────────────

function renderMarkdown(input: {
  scenarios: Record<Scenario, DcfScenarioResult>;
  sensitivity: { drivers: SensitivityCell[]; dominantLever: string };
  founderExits: FounderExit[];
  comps: AnonymisedComp[];
  rdtiRefundYear1Aud: number;
  esicQualifies: boolean;
  enterpriseValue: CFOValuationReport["enterpriseValue"];
  financialModel: FinancialModelSnapshot;
  sviAnalysis: SviAnalysisSnapshot;
}): string {
  const { scenarios, sensitivity, founderExits, comps, rdtiRefundYear1Aud, esicQualifies, enterpriseValue } = input;
  const rows = (["bear", "base", "bull"] as Scenario[])
    .map((s) => {
      const r = scenarios[s];
      return `| ${cap(s)} | ${formatAud(r.pvFcf)} | ${formatAud(r.pvTerminal)} | ${formatAud(r.enterpriseValueAud)} | ${(r.wacc * 100).toFixed(0)}% | ${r.notes} |`;
    })
    .join("\n");

  const sensRows = sensitivity.drivers
    .map((d) =>
      `| ${d.driver}${d.dominantLever ? " (dominant)" : ""} | ${d.bearImpactPct >= 0 ? "+" : ""}${d.bearImpactPct}% | ${d.bullImpactPct >= 0 ? "+" : ""}${d.bullImpactPct}% |`,
    )
    .join("\n");

  const compRows = comps
    .map((c) => `| ${c.label} | ${c.buyerType} | ${c.dealYear} | ${formatAud(c.dealSizeAud)} | ${c.revenueMultiple.toFixed(1)}x |`)
    .join("\n");

  const exitRows = founderExits
    .map(
      (e) =>
        `| ${cap(e.scenario)} | ${formatAud(e.exitValuationAud)} | ${e.founderStakePct.toFixed(1)}% | ${formatAud(e.grossPayoutAud)} | ${formatAud(e.cgtEstimateAud)} | ${formatAud(e.netPayoutAud)} |`,
    )
    .join("\n");

  return `## CFO DCF Valuation Brief

**Enterprise Value (base case): ${formatAud(enterpriseValue.midAud)}** (bear ${formatAud(enterpriseValue.lowAud)} — bull ${formatAud(enterpriseValue.highAud)}). Confidence: **${enterpriseValue.confidence}**.

### 5-year DCF (bear / base / bull)

| Scenario | 5-yr FCF PV | Terminal PV | Enterprise Value | WACC | Notes |
|----------|-------------|-------------|------------------|------|-------|
${rows}

WACC anchored to Cut Through Venture / AVCAL 2024–2026 AU early-stage risk premium (bear 42%, base 38%, bull 34%). Terminal value: max of Gordon-Growth (g = 4.0%) and sector exit-multiple.

### Sensitivity (5 drivers × 3 scenarios)

Base EV: ${formatAud(sensitivity.drivers[0] ? enterpriseValue.midAud : 0)}. Dominant lever: **${sensitivity.dominantLever}**.

| Driver | Bear impact | Bull impact |
|--------|-------------|-------------|
${sensRows}

### Australian tax optimisation

- **RDTI 43.5%** — Year-1 refundable offset estimate: **${formatAud(rdtiRefundYear1Aud)}** (based on annual R&D spend fraction).
- **ESIC** — ${esicQualifies ? "qualifies" : "does not currently qualify"} under the early-stage innovation company test.
- **CGT on founder exit** — 50% discount if held > 12 months + 47% marginal top rate applied below.

### Founder exit payouts (post-CGT)

| Scenario | Exit EV | Founder stake | Gross | CGT | Net |
|----------|---------|---------------|-------|-----|-----|
${exitRows}

### Anonymised AU precedent comps

| Anonymised label | Buyer type | Year | Deal size | Revenue multiple |
|------------------|-----------|------|-----------|------------------|
${compRows}

${DISCLAIMER}
`;
}

// ─── Utilities ────────────────────────────────────────────────────────────

function formatAud(n: number): string {
  if (!Number.isFinite(n)) return "A$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `A$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `A$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `A$${(n / 1_000).toFixed(1)}k`;
  return `A$${Math.round(n)}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Compliance Helpers ───────────────────────────────────────────────────

/**
 * Regex that flags a curated list of real Australian and global company /
 * VC / founder names. Used to gate report content BEFORE storage.
 *
 * Extend this list as new violations are caught in review.
 */
export const REAL_NAME_REGEX =
  /\b(Canva|Atlassian|Xero|Afterpay|MYOB|SafetyCulture|Culture\s*Amp|Airwallex|Deputy|Employment\s*Hero|Immutable|Linktree|Go1|Octopus\s*Deploy|Zip\s*Co|Airtree|Blackbird|Square\s*Peg|Rampersand|Tidal\s*Ventures|King\s*River|HubSpot|Notion|Airtable|Monday\.com|Asana|Linear|Salesforce|Slack|Zoom|Stripe\s*Inc|Shopify)\b/i;

export interface ComplianceScanResult {
  ok: boolean;
  violations: string[];
}

/**
 * Scan a rendered report for real company / VC names.
 * Returns { ok: true, violations: [] } if clean.
 */
export function scanForRealNames(text: string): ComplianceScanResult {
  const violations = new Set<string>();
  let match: RegExpExecArray | null;
  const globalRegex = new RegExp(REAL_NAME_REGEX.source, "gi");
  while ((match = globalRegex.exec(text)) !== null) {
    violations.add(match[0]);
  }
  return { ok: violations.size === 0, violations: Array.from(violations) };
}
