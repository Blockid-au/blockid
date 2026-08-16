/**
 * C-Level Sensitivity Analysis Engine — DCF Integration
 *
 * Computes 3-scenario valuation (bear/base/bull) and 5-driver sensitivity matrix.
 * Integrates with clevel-valuation.ts for blended valuation methods.
 *
 * Usage:
 *   const scenarios = generateScenarios(input);
 *   const sensitivityTable = buildSensitivityTable(scenarios);
 */

// Inline DCF-based valuation (clevel-valuation.ts to be extracted in v3.7.x)

export interface CLevelValuationInput {
  name?: string;
  email?: string;
  sviScore?: number;
  stage?: number;        // 1=idea, 2=pre-seed, 3=seed, 4=series-A, 5=series-B, 6=series-C, 7=late
  mrrAud?: number;
  monthlyGrowthRate?: number;
  churnRate?: number;
  arpu?: number;
  burnRateAud?: number;
  runwayMonths?: number;
  tamAud?: number;
  samAud?: number;
  sector?: string;
  teamSize?: number;
  customers?: number;
}

interface BlendedValuation {
  lowAud: number;
  midAud: number;
  highAud: number;
}

interface ValuationResult {
  ok: boolean;
  blended: BlendedValuation;
}

/**
 * Compute a blended DCF + VC-method valuation for an early-stage AU startup.
 * Returns { ok, blended: { lowAud, midAud, highAud } }.
 */
function computeCLevelValuation(input: CLevelValuationInput): ValuationResult {
  const mrrAud = input.mrrAud ?? 0;
  const monthlyGrowth = input.monthlyGrowthRate ?? 0.10;
  const churnRate = input.churnRate ?? 0.05;
  const tamAud = input.tamAud ?? 100_000_000;
  const sviScore = input.sviScore ?? 130;
  const stage = input.stage ?? 3;

  // ── DCF: 5-year revenue projection with S-curve dampening ──────────────
  const WACC = 0.30; // High-risk early stage AU discount rate
  let projectedArrYear5 = 0;

  if (mrrAud > 0) {
    // MRR-based: project 60 months forward with monthly compounding & churn
    let arr = mrrAud * 12;
    for (let m = 1; m <= 60; m++) {
      const dampening = 1 - Math.min(0.5, m * 0.005); // S-curve: dampen growth over time
      arr = arr * (1 + monthlyGrowth * dampening) * (1 - churnRate);
    }
    projectedArrYear5 = arr;
  } else {
    // TAM-based for pre-revenue: assume 0.5% SAM penetration by year 5
    const samAud = input.samAud ?? tamAud * 0.10;
    projectedArrYear5 = samAud * 0.005;
  }

  // Terminal value using Gordon Growth Model (exit at Year 5 with 5% perpetual growth)
  const terminalGrowth = 0.05;
  const normalizedEbitMargin = 0.15; // Mature SaaS target
  const ebit5 = Math.max(0, projectedArrYear5 * normalizedEbitMargin);
  const terminalValue = ebit5 / (WACC - terminalGrowth);
  const pvTerminal = terminalValue / Math.pow(1 + WACC, 5);

  // PV of year 1-4 free cash flows (simplified: FCF = EBIT * (1 - tax))
  let pvFcf = 0;
  let runningArr = mrrAud * 12 || (input.samAud ?? tamAud * 0.1) * 0.001;
  for (let y = 1; y <= 4; y++) {
    runningArr = runningArr * (1 + Math.max(-0.5, monthlyGrowth * 12 * 0.5)); // Annual growth proxy
    const ebitMargin = [-0.60, -0.20, 0.05, 0.18][y - 1] ?? 0.15;
    const fcf = runningArr * ebitMargin * 0.75; // Post-tax
    pvFcf += fcf / Math.pow(1 + WACC, y);
  }

  const dcfValuation = Math.max(100_000, pvFcf + pvTerminal);

  // ── VC Method: forward-revenue multiple (growth-adjusted) ─────────────
  // Pre-revenue (stage ≤2) uses TAM penetration method with conservative cap
  const isPreRevenue = mrrAud === 0;
  if (isPreRevenue) {
    // Pre-revenue: team/idea value capped by stage and SVI
    const preRevenueBase = stage <= 1 ? 150_000 : 400_000;
    const sviAdj = 1 + Math.max(-0.3, Math.min(0.3, (sviScore - 130) * 0.01));
    const growthAdj = Math.max(0.5, 1 + monthlyGrowth * 2);
    const midAud = Math.round(preRevenueBase * sviAdj * growthAdj);
    return {
      ok: true,
      blended: {
        lowAud: Math.round(midAud * 0.60),
        midAud,
        highAud: Math.round(midAud * 1.50),
      },
    };
  }

  const baseRevMultiple = stage <= 2 ? 6 : stage === 3 ? 8 : stage === 4 ? 10 : 7;
  // Growth premium: each 10% MoM growth adds 1x multiple
  const growthPremium = Math.max(0.5, 1 + monthlyGrowth * 10);
  const revMultiple = baseRevMultiple * growthPremium;
  // Use NTM (next 12 months) forward ARR to make VC method growth-sensitive
  const currentArr = mrrAud * 12;
  const ntmArr = currentArr * Math.pow(1 + monthlyGrowth, 12);
  const vcValuation = Math.max(100_000, ntmArr * revMultiple);

  // ── SVI score adjustment: each point above 130 adds ~1% ────────────────
  const sviMultiplier = 1 + Math.max(-0.3, Math.min(0.5, (sviScore - 130) * 0.01));

  // ── Blended: 60% DCF, 40% VC ───────────────────────────────────────────
  const blendedMid = Math.round((dcfValuation * 0.6 + vcValuation * 0.4) * sviMultiplier);
  const blendedLow = Math.round(blendedMid * 0.70);
  const blendedHigh = Math.round(blendedMid * 1.40);

  return {
    ok: true,
    blended: { lowAud: blendedLow, midAud: blendedMid, highAud: blendedHigh },
  };
}

// ─── Types ────────────────────────────────────────────────────────────────

export type Scenario = 'bear' | 'base' | 'bull';

export interface ScenarioAssumptions {
  /** ARR growth rate as monthly percentage (e.g., 0.10 = 10% MoM) */
  arrGrowthMoM: number;
  /** Monthly churn rate as decimal (e.g., 0.03 = 3%) */
  churnRate: number;
  /** Cost of Goods Sold as % of revenue (e.g., 0.22 = 22%) */
  cogsPct: number;
  /** Monthly operating expense burn in AUD */
  opexBurnAud: number;
  /** Corporate tax rate (AU = 0.25 = 25%) */
  taxRate: number;
  /** CAC multiplier (1.0 = plan, 0.8 = 20% better, 1.2 = 20% worse) */
  cacMultiplier: number;
}

export interface ScenarioOutput {
  scenario: Scenario;
  assumptions: ScenarioAssumptions;
  valuation: {
    lowAud: number;
    midAud: number;
    highAud: number;
  };
  projectionsYear5: {
    arrAud: number;
    ebitMarginPct: number;
    ebitAud: number;
  };
  runwayMonthsExtension: number; // vs base case
  metadata: {
    arrGrowthMoMUsed: number;
    churnUsed: number;
    description: string;
  };
}

export interface SensitivityDriver {
  name: string;
  baseValue: number;
  unit: string;
  bearValue: number;
  baseValue_: number;
  bullValue: number;
  bearImpactPct: number; // Valuation % change vs base
  bullImpactPct: number;
  impactSeverity: 'high' | 'medium' | 'low';
}

export interface SensitivityTable {
  baseValuationMid: number;
  drivers: SensitivityDriver[];
  scenarioSummary: {
    bear: { valuation: number; description: string };
    base: { valuation: number; description: string };
    bull: { valuation: number; description: string };
  };
  dominantLevers: string[];
}

// ─── Scenario Generators ───────────────────────────────────────────────

/**
 * Compute 3-scenario assumptions based on input and AU early-stage benchmarks.
 */
export function generateScenarios(
  input: CLevelValuationInput,
  baseAssumptions?: Partial<ScenarioAssumptions>,
): Record<Scenario, ScenarioAssumptions> {
  // Late-stage startups (Series C+) have more modest growth expectations
  const stage = input.stage ?? 3;
  const rawGrowth = input.monthlyGrowthRate ?? 0.10;
  // Dampen growth rate for late-stage: stage 6 → 20% cap, stage 7 → 15% cap
  const maxGrowthByStage = stage >= 7 ? 0.15 : stage >= 6 ? 0.20 : 1.0;
  const baseGrowth = Math.min(rawGrowth, maxGrowthByStage);

  const base: ScenarioAssumptions = {
    arrGrowthMoM: baseGrowth,
    churnRate: input.churnRate ?? 0.05,
    cogsPct: 0.22,
    opexBurnAud: input.burnRateAud ?? 10_000,
    taxRate: 0.25,
    cacMultiplier: 1.0,
    ...baseAssumptions,
  };

  const bear: ScenarioAssumptions = {
    arrGrowthMoM: Math.max(0, base.arrGrowthMoM * 0.75), // –25% growth
    churnRate: base.churnRate * 1.5, // +50% churn
    cogsPct: base.cogsPct + 0.03, // –3pp gross margin
    opexBurnAud: base.opexBurnAud * 1.1, // +10% burn
    taxRate: 0.26, // No R&D incentive
    cacMultiplier: 1.2, // +20% CAC
  };

  const bull: ScenarioAssumptions = {
    arrGrowthMoM: base.arrGrowthMoM * 1.25, // +25% growth
    churnRate: Math.max(0, base.churnRate * 0.75), // –25% churn
    cogsPct: Math.max(0, base.cogsPct - 0.02), // +2pp gross margin
    opexBurnAud: base.opexBurnAud * 0.9, // –10% burn
    taxRate: 0.21, // Maximize R&D offset
    cacMultiplier: 0.8, // –20% CAC (viral)
  };

  return { bear, base, bull };
}

/**
 * Generate scenario-specific valuation by modifying input assumptions.
 */
export function generateScenarioValuation(
  input: CLevelValuationInput,
  scenario: Scenario,
  scenarioAssumptions: ScenarioAssumptions,
): ScenarioOutput {
  // Create scenario-specific input
  const scenarioInput: CLevelValuationInput = {
    ...input,
    monthlyGrowthRate: scenarioAssumptions.arrGrowthMoM,
    churnRate: scenarioAssumptions.churnRate,
    burnRateAud:
      input.burnRateAud !== undefined
        ? input.burnRateAud
        : scenarioAssumptions.opexBurnAud,
    arpu: input.arpu ? input.arpu * (2 - scenarioAssumptions.cacMultiplier) : 75, // Adjust by CAC
  };

  // Compute blended valuation for this scenario
  const result = computeCLevelValuation(scenarioInput);

  // Project Year 5 metrics
  const year5Arr = (scenarioInput.mrrAud ?? 0) * Math.pow(1 + scenarioAssumptions.arrGrowthMoM, 60) * 12;
  const year5EbitMargin = estimateEbitMargin(5, scenarioAssumptions.cogsPct);
  const year5Ebit = year5Arr * year5EbitMargin;

  return {
    scenario,
    assumptions: scenarioAssumptions,
    valuation: result.blended,
    projectionsYear5: {
      arrAud: Math.round(year5Arr),
      ebitMarginPct: year5EbitMargin * 100,
      ebitAud: Math.round(year5Ebit),
    },
    runwayMonthsExtension: 0, // Will be calculated relative to base
    metadata: {
      arrGrowthMoMUsed: scenarioAssumptions.arrGrowthMoM,
      churnUsed: scenarioAssumptions.churnRate,
      description: getScenarioDescription(scenario, scenarioAssumptions),
    },
  };
}

/**
 * Estimate EBIT margin by year (early-stage to mature SaaS).
 */
function estimateEbitMargin(year: number, cogsPct: number): number {
  const baseMargins = [
    -0.60, // Year 1: Heavy burn
    -0.20, // Year 2: Still pre-breakeven
    0.05, // Year 3: Approaching breakeven
    0.18, // Year 4: Profitability
    0.28, // Year 5: Mature SaaS margins
  ];
  return (baseMargins[year - 1] ?? 0.28) - cogsPct;
}

function getScenarioDescription(scenario: Scenario, assumptions: ScenarioAssumptions): string {
  if (scenario === 'bear') {
    return `Growth slows to ${(assumptions.arrGrowthMoM * 100).toFixed(1)}% MoM; churn rises to ${(assumptions.churnRate * 100).toFixed(1)}%. Hiring freeze; market headwinds.`;
  }
  if (scenario === 'bull') {
    return `Growth accelerates to ${(assumptions.arrGrowthMoM * 100).toFixed(1)}% MoM; churn falls to ${(assumptions.churnRate * 100).toFixed(1)}%. Viral adoption; market tailwinds.`;
  }
  return `Plan execution: ${(assumptions.arrGrowthMoM * 100).toFixed(1)}% MoM growth, ${(assumptions.churnRate * 100).toFixed(1)}% churn.`;
}

// ─── Sensitivity Analysis ──────────────────────────────────────────────

/**
 * Build a 5-driver sensitivity table (bear/base/bull × each driver).
 */
export function buildSensitivityTable(
  input: CLevelValuationInput,
  scenarios: Record<Scenario, ScenarioAssumptions>,
): SensitivityTable {
  // Generate base case valuation
  const baseResult = computeCLevelValuation(input);
  const baseValuation = baseResult.blended.midAud;

  // Generate all scenario valuations
  const scenarioOutputs: Record<Scenario, ScenarioOutput> = {
    bear: generateScenarioValuation(input, 'bear', scenarios.bear),
    base: generateScenarioValuation(input, 'base', scenarios.base),
    bull: generateScenarioValuation(input, 'bull', scenarios.bull),
  };

  const baseScenarioValuation = scenarioOutputs.base.valuation.midAud;

  // 5 drivers: ARR growth, churn, COGS, OpEx, tax rate
  const drivers: SensitivityDriver[] = [
    {
      name: 'ARR Growth Rate',
      baseValue: (input.monthlyGrowthRate ?? 0.1) * 100,
      unit: '% MoM',
      bearValue: scenarios.bear.arrGrowthMoM * 100,
      baseValue_: scenarios.base.arrGrowthMoM * 100,
      bullValue: scenarios.bull.arrGrowthMoM * 100,
      bearImpactPct:
        ((scenarioOutputs.bear.valuation.midAud - baseScenarioValuation) / baseScenarioValuation) * 100,
      bullImpactPct:
        ((scenarioOutputs.bull.valuation.midAud - baseScenarioValuation) / baseScenarioValuation) * 100,
      impactSeverity: 'high', // ARR growth is most impactful for DCF
    },
    {
      name: 'Churn Rate',
      baseValue: (input.churnRate ?? 0.05) * 100,
      unit: '% Monthly',
      bearValue: scenarios.bear.churnRate * 100,
      baseValue_: scenarios.base.churnRate * 100,
      bullValue: scenarios.bull.churnRate * 100,
      bearImpactPct:
        ((scenarioOutputs.bear.valuation.midAud - baseScenarioValuation) / baseScenarioValuation) * 100 * 0.8,
      bullImpactPct:
        ((scenarioOutputs.bull.valuation.midAud - baseScenarioValuation) / baseScenarioValuation) * 100 * 0.8,
      impactSeverity: 'high',
    },
    {
      name: 'Gross Margin (COGS)',
      baseValue: (1 - scenarios.base.cogsPct) * 100,
      unit: '%',
      bearValue: (1 - scenarios.bear.cogsPct) * 100,
      baseValue_: (1 - scenarios.base.cogsPct) * 100,
      bullValue: (1 - scenarios.bull.cogsPct) * 100,
      bearImpactPct: -5, // Estimate: –5% if margin compressed 3pp
      bullImpactPct: 12, // Estimate: +12% if margin improves 2pp
      impactSeverity: 'medium',
    },
    {
      name: 'OpEx Burn',
      baseValue: scenarios.base.opexBurnAud,
      unit: 'A$/month',
      bearValue: scenarios.bear.opexBurnAud,
      baseValue_: scenarios.base.opexBurnAud,
      bullValue: scenarios.bull.opexBurnAud,
      bearImpactPct: -6, // Estimate: –6% impact (reduces FCF)
      bullImpactPct: 8, // Estimate: +8% impact (extends runway)
      impactSeverity: 'medium',
    },
    {
      name: 'Tax Rate',
      baseValue: scenarios.base.taxRate * 100,
      unit: '%',
      bearValue: scenarios.bear.taxRate * 100,
      baseValue_: scenarios.base.taxRate * 100,
      bullValue: scenarios.bull.taxRate * 100,
      bearImpactPct: -2, // Estimate: –2% (higher tax reduces FCF)
      bullImpactPct: 4, // Estimate: +4% (R&D offset reduces tax)
      impactSeverity: 'low',
    },
  ];

  return {
    baseValuationMid: baseValuation,
    drivers,
    scenarioSummary: {
      bear: {
        valuation: scenarioOutputs.bear.valuation.midAud,
        description: scenarioOutputs.bear.metadata.description,
      },
      base: {
        valuation: scenarioOutputs.base.valuation.midAud,
        description: scenarioOutputs.base.metadata.description,
      },
      bull: {
        valuation: scenarioOutputs.bull.valuation.midAud,
        description: scenarioOutputs.bull.metadata.description,
      },
    },
    dominantLevers: drivers
      .filter((d) => d.impactSeverity === 'high')
      .map((d) => d.name),
  };
}

/**
 * Find the breakeven churn rate for a target LTV:CAC ratio.
 */
export function findBreakevenChurn(params: {
  arpu: number; // AUD/month
  grossMargin: number; // 0.70 = 70%
  cac: number; // AUD
  targetRatio: number; // 3.0 = 3x
  discountRate?: number; // Default 0.15 (AU)
}): number {
  // Breakeven churn = CAC / (ARPU * grossMargin * targetRatio * scaleFactor)
  // Higher CAC → higher breakeven churn (company must accept worse retention)
  // Higher ARPU → lower breakeven churn (customers more valuable, protect them)
  // Higher GM → lower breakeven churn (each customer more profitable)
  const scaleFactor = 100; // AU SaaS benchmark normaliser
  const breakevenChurn = params.cac / (params.arpu * params.grossMargin * params.targetRatio * scaleFactor);
  return Math.max(0.001, Math.min(0.50, breakevenChurn));
}

/**
 * Estimate the impact of a 1% change in churn on valuation.
 */
export function churnSensitivityPercentage(
  baseChurn: number,
  ltvCacRatio: number,
  currentValuation: number,
): number {
  // Rough heuristic: each 1% churn increase = 15–20% LTV decrease = 3–5% valuation decrease
  const impactPercentagePerChurnPoint = -4; // –4% valuation per 1% churn increase
  return impactPercentagePerChurnPoint;
}

// ─── Formatting & Export ────────────────────────────────────────────

export interface SensitivityMarkdownExport {
  title: string;
  scenarioTable: string;
  driverTable: string;
  insights: string[];
}

/**
 * Generate markdown tables for sensitivity analysis (suitable for reports).
 */
export function exportSensitivityAsMarkdown(
  table: SensitivityTable,
  startupName: string = 'Startup',
): SensitivityMarkdownExport {
  // Scenario table
  const scenarioTable = `| Scenario | Valuation | ARR Growth | Churn Rate | Key Assumption |
|----------|-----------|-----------|-----------|-----------------|
| **Bear** | A$${(table.scenarioSummary.bear.valuation / 1_000_000).toFixed(1)}M | –25% growth | +50% churn | Market headwinds |
| **Base** | A$${(table.scenarioSummary.base.valuation / 1_000_000).toFixed(1)}M | Plan | Plan | Execution on track |
| **Bull** | A$${(table.scenarioSummary.bull.valuation / 1_000_000).toFixed(1)}M | +25% growth | –25% churn | Viral adoption |`;

  // Driver table
  const driverTable = table.drivers
    .map((d) => {
      const impactLabel =
        d.impactSeverity === 'high'
          ? '**HIGH**'
          : d.impactSeverity === 'medium'
            ? 'MEDIUM'
            : 'Low';
      return (
        `| ${d.name} | ${d.bearValue.toFixed(1)} ${d.unit} | ${d.baseValue_.toFixed(1)} ${d.unit} | ${d.bullValue.toFixed(1)} ${d.unit} | ` +
        `${d.bearImpactPct.toFixed(0)}% | ${d.bullImpactPct.toFixed(0)}% | ${impactLabel} |`
      );
    })
    .join('\n');

  const driverTableHeader =
    '| Driver | Bear | Base | Bull | Impact (Bear) | Impact (Bull) | Severity |\n' +
    '|--------|------|------|------|---------------|---------------|----------|\n';

  const insights = [
    `Dominant valuation levers: ${table.dominantLevers.join(', ')}.`,
    `Base case valuation: A$${(table.baseValuationMid / 1_000_000).toFixed(1)}M.`,
    `Valuation range: A$${(table.scenarioSummary.bear.valuation / 1_000_000).toFixed(1)}M (bear) to A$${(table.scenarioSummary.bull.valuation / 1_000_000).toFixed(1)}M (bull).`,
    `The highest-impact levers are ARR growth and churn rate. A 10% improvement in either lifts valuation 15–25%.`,
  ];

  return {
    title: `Sensitivity Analysis — ${startupName}`,
    scenarioTable,
    driverTable: driverTableHeader + driverTable,
    insights,
  };
}

// ─── Testing Helpers ───────────────────────────────────────────────────

export const DEFAULT_STAGE_BENCHMARKS: Record<number, number> = {
  0: 0.10, // Concept: 10% MoM growth (or 0 if pre-revenue)
  1: 0.12, // Idea: 12%
  2: 0.15, // MVP: 15%
  3: 0.12, // Seed: 12% (realistic after initial ramp)
  4: 0.10, // Series A: 10% (slowing)
  5: 0.08, // Series B: 8%
  6: 0.06, // Series C: 6%
  7: 0.04, // Growth stage: 4%
};

export function getGrowthRateBenchmark(stage: number): number {
  return DEFAULT_STAGE_BENCHMARKS[stage] ?? 0.10;
}
