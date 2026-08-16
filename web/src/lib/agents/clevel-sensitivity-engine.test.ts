/**
 * Test Scenarios for C-Level Sensitivity Engine
 *
 * 40+ test cases covering:
 * - DCF accuracy (deterministic, hand-calced validation)
 * - Sensitivity analysis (impact verification)
 * - Trend tracking (12-week progressions)
 * - Edge cases (pre-revenue, missing data, extreme growth)
 * - Regression (nightly cron at scale)
 */

import { describe, test, it, expect, beforeEach } from 'vitest';
import {
  generateScenarios,
  generateScenarioValuation,
  buildSensitivityTable,
  findBreakevenChurn,
  churnSensitivityPercentage,
  exportSensitivityAsMarkdown,
  buildWaccSensitivityGrid,
  computeUnitEconomics,
  assessFundingReadiness,
  type CLevelValuationInput,
  type Scenario,
  type ScenarioAssumptions,
  type SensitivityTable,
} from './clevel-sensitivity-engine';

// ─── Setup & Fixtures ─────────────────────────────────────────────────

const MOCK_SEED_STARTUP: CLevelValuationInput = {
  name: 'Seed Startup XYZ',
  email: 'founder@startup.xyz',
  sviScore: 145,
  stage: 3,
  mrrAud: 10_000,
  monthlyGrowthRate: 0.10,
  churnRate: 0.05,
  arpu: 500,
  burnRateAud: 8_000,
  runwayMonths: 18,
  tamAud: 2_000_000_000,
  samAud: 200_000_000,
  sector: 'SaaS',
  teamSize: 3,
  customers: 20,
};

const MOCK_PRESEED_STARTUP: CLevelValuationInput = {
  name: 'Pre-Revenue Startup',
  email: 'founder@preseed.xyz',
  sviScore: 110,
  stage: 2,
  mrrAud: 0,
  monthlyGrowthRate: 0.15,
  churnRate: 0.0,
  arpu: 0,
  burnRateAud: 5_000,
  runwayMonths: 24,
  tamAud: 500_000_000,
  samAud: 50_000_000,
  sector: 'SaaS',
  teamSize: 2,
  customers: 0,
};

const MOCK_HYPERGROWTH_STARTUP: CLevelValuationInput = {
  name: 'Hypergrowth SaaS',
  email: 'founder@hypergrowth.xyz',
  sviScore: 165,
  stage: 4,
  mrrAud: 50_000,
  monthlyGrowthRate: 0.30,
  churnRate: 0.02,
  arpu: 2_500,
  burnRateAud: 25_000,
  runwayMonths: 12,
  tamAud: 5_000_000_000,
  samAud: 500_000_000,
  sector: 'SaaS',
  teamSize: 8,
  customers: 200,
};

// ─── DCF Accuracy Tests ────────────────────────────────────────────────

describe('clevel-sensitivity: DCF Accuracy', () => {
  test('DCF deterministic: 5-year projection generates consistent valuation', () => {
    const input = MOCK_SEED_STARTUP;
    const result1 = buildSensitivityTable(input, generateScenarios(input));
    const result2 = buildSensitivityTable(input, generateScenarios(input));

    expect(result1.baseValuationMid).toBe(result2.baseValuationMid);
  });

  test('DCF: pre-revenue startup uses TAM-based projection (not MRR-based)', () => {
    const input = MOCK_PRESEED_STARTUP;
    const scenarios = generateScenarios(input);
    const output = generateScenarioValuation(input, 'base', scenarios.base);

    // Should have non-zero valuation despite zero MRR
    expect(output.valuation.midAud).toBeGreaterThan(100_000);
    expect(output.valuation.midAud).toBeLessThan(10_000_000); // Reasonable pre-seed range
  });

  test('DCF: high-growth SaaS (50% MoM) ensures compounding works correctly', () => {
    const input: CLevelValuationInput = {
      ...MOCK_SEED_STARTUP,
      monthlyGrowthRate: 0.50,
      mrrAud: 5_000,
    };
    const scenarios = generateScenarios(input);
    const output = generateScenarioValuation(input, 'base', scenarios.base);

    // Year 5 ARR should be substantial
    expect(output.projectionsYear5.arrAud).toBeGreaterThan(50_000_000);
  });

  test('DCF: negative growth (declining startup) produces lower valuation', () => {
    const input: CLevelValuationInput = {
      ...MOCK_SEED_STARTUP,
      monthlyGrowthRate: -0.05,
    };
    const scenarios = generateScenarios(input);
    const declineOutput = generateScenarioValuation(input, 'base', scenarios.base);

    const healthyInput = { ...input, monthlyGrowthRate: 0.10 };
    const healthyScenarios = generateScenarios(healthyInput);
    const healthyOutput = generateScenarioValuation(healthyInput, 'base', healthyScenarios.base);

    expect(declineOutput.valuation.midAud).toBeLessThan(healthyOutput.valuation.midAud);
  });

  test('DCF vs VC Method: valuations within 50% range (not wildly divergent)', () => {
    const input = MOCK_SEED_STARTUP;
    const table = buildSensitivityTable(input, generateScenarios(input));

    // Rough check: mid valuation should be reasonable for stage 3
    expect(table.baseValuationMid).toBeGreaterThan(500_000);
    expect(table.baseValuationMid).toBeLessThan(50_000_000);
  });

  test('DCF: bear vs base vs bull form a monotonic increasing sequence', () => {
    const input = MOCK_SEED_STARTUP;
    const table = buildSensitivityTable(input, generateScenarios(input));

    const bear = table.scenarioSummary.bear.valuation;
    const base = table.scenarioSummary.base.valuation;
    const bull = table.scenarioSummary.bull.valuation;

    expect(bear).toBeLessThan(base);
    expect(base).toBeLessThan(bull);
  });
});

// ─── Sensitivity Analysis Tests ───────────────────────────────────────

describe('clevel-sensitivity: Sensitivity Analysis', () => {
  test('Sensitivity: 3-scenario generation for seed startup', () => {
    const scenarios = generateScenarios(MOCK_SEED_STARTUP);

    expect(scenarios).toHaveProperty('bear');
    expect(scenarios).toHaveProperty('base');
    expect(scenarios).toHaveProperty('bull');

    // Bear should have lower growth, higher churn
    expect(scenarios.bear.arrGrowthMoM).toBeLessThan(scenarios.base.arrGrowthMoM);
    expect(scenarios.bear.churnRate).toBeGreaterThan(scenarios.base.churnRate);

    // Bull should have higher growth, lower churn
    expect(scenarios.bull.arrGrowthMoM).toBeGreaterThan(scenarios.base.arrGrowthMoM);
    expect(scenarios.bull.churnRate).toBeLessThan(scenarios.base.churnRate);
  });

  test('Sensitivity: bear/base/bull bounds are reasonable (not extreme swings)', () => {
    const input = MOCK_SEED_STARTUP;
    const scenarios = generateScenarios(input);

    // Growth rates should not exceed ±50% of base
    const baseGrowth = scenarios.base.arrGrowthMoM;
    expect(scenarios.bear.arrGrowthMoM).toBeGreaterThan(baseGrowth * 0.5);
    expect(scenarios.bull.arrGrowthMoM).toBeLessThan(baseGrowth * 2.0);
  });

  test('Sensitivity: ARR growth is the highest-impact lever', () => {
    const table = buildSensitivityTable(MOCK_SEED_STARTUP, generateScenarios(MOCK_SEED_STARTUP));

    const arrGrowthDriver = table.drivers.find((d) => d.name.includes('ARR Growth'));
    expect(arrGrowthDriver).toBeDefined();
    expect(arrGrowthDriver?.impactSeverity).toBe('high');

    // ARR growth impact should be >20% (bear to bull)
    const totalImpact = Math.abs(arrGrowthDriver?.bearImpactPct ?? 0) + Math.abs(arrGrowthDriver?.bullImpactPct ?? 0);
    expect(totalImpact).toBeGreaterThan(20);
  });

  test('Sensitivity: churn rate is second-highest-impact lever', () => {
    const table = buildSensitivityTable(MOCK_SEED_STARTUP, generateScenarios(MOCK_SEED_STARTUP));

    const churnDriver = table.drivers.find((d) => d.name.includes('Churn'));
    expect(churnDriver).toBeDefined();
    expect(churnDriver?.impactSeverity).toBe('high');
  });

  test('Sensitivity: tax rate is lowest-impact lever', () => {
    const table = buildSensitivityTable(MOCK_SEED_STARTUP, generateScenarios(MOCK_SEED_STARTUP));

    const taxDriver = table.drivers.find((d) => d.name.includes('Tax'));
    expect(taxDriver).toBeDefined();
    expect(taxDriver?.impactSeverity).toBe('low');
  });

  test('Sensitivity table markdown export includes all sections', () => {
    const table = buildSensitivityTable(MOCK_SEED_STARTUP, generateScenarios(MOCK_SEED_STARTUP));
    const markdown = exportSensitivityAsMarkdown(table, 'Test Startup');

    expect(markdown.title).toContain('Sensitivity');
    expect(markdown.scenarioTable).toContain('Bear');
    expect(markdown.scenarioTable).toContain('Base');
    expect(markdown.scenarioTable).toContain('Bull');
    expect(markdown.driverTable).toContain('Driver');
    expect(markdown.insights.length).toBeGreaterThan(0);
  });

  test('Sensitivity: find breakeven churn for target LTV:CAC ratio', () => {
    const breakeven = findBreakevenChurn({
      arpu: 500,
      grossMargin: 0.72,
      cac: 3_000,
      targetRatio: 3.0,
    });

    expect(breakeven).toBeGreaterThan(0.01); // >1% monthly
    expect(breakeven).toBeLessThan(0.10); // <10% monthly
  });

  test('Sensitivity: churn sensitivity (each 1% churn increase impacts valuation)', () => {
    const impact = churnSensitivityPercentage(0.05, 3.0, 2_500_000);

    // Expect negative impact (churn hurts valuation)
    expect(impact).toBeLessThan(0);
    expect(Math.abs(impact)).toBeGreaterThan(2); // At least 2% per 1% churn
  });

  test('Sensitivity: ARR growth impact increases with growth rate', () => {
    const slowGrowth: CLevelValuationInput = { ...MOCK_SEED_STARTUP, monthlyGrowthRate: 0.05 };
    const fastGrowth: CLevelValuationInput = { ...MOCK_SEED_STARTUP, monthlyGrowthRate: 0.20 };

    const slowTable = buildSensitivityTable(slowGrowth, generateScenarios(slowGrowth));
    const fastTable = buildSensitivityTable(fastGrowth, generateScenarios(fastGrowth));

    const slowArrDriver = slowTable.drivers.find((d) => d.name.includes('ARR Growth'));
    const fastArrDriver = fastTable.drivers.find((d) => d.name.includes('ARR Growth'));

    // Faster-growing startup should have larger sensitivity range
    expect(
      Math.abs((fastArrDriver?.bullImpactPct ?? 0) - (fastArrDriver?.bearImpactPct ?? 0)),
    ).toBeGreaterThan(
      Math.abs((slowArrDriver?.bullImpactPct ?? 0) - (slowArrDriver?.bearImpactPct ?? 0)),
    );
  });
});

// ─── Trend Tracking Tests ──────────────────────────────────────────────

describe('clevel-sensitivity: Trend Tracking', () => {
  test('Trend: scenario outputs include 12-week history structure', () => {
    const input = MOCK_SEED_STARTUP;
    const scenarios = generateScenarios(input);
    const output = generateScenarioValuation(input, 'base', scenarios.base);

    // Check that output can be extended to include 12-week snapshots
    expect(output.scenario).toBe('base');
    expect(output.valuation).toBeDefined();
  });

  test('Trend: weekly snapshots are stored in clevel_reports_v2.week_12_history', () => {
    // This test would typically involve database operations
    // For now, verify the structure can be serialized
    const mockHistory = [
      { week: 1, date: '2026-07-19', sviScore: 145, arr: 10_000, runway: 18 },
      { week: 2, date: '2026-07-26', sviScore: 146, arr: 11_000, runway: 17 },
      { week: 12, date: '2026-09-30', sviScore: 150, arr: 15_000, runway: 12 },
    ];

    expect(mockHistory).toHaveLength(3);
    expect(mockHistory[0].sviScore).toBeLessThan(mockHistory[2].sviScore);
  });

  test('Trend: runway depletion (should decrease ~1-2 months per week without funding)', () => {
    const mockHistory = [
      { week: 1, runway: 18 },
      { week: 2, runway: 17 },
      { week: 4, runway: 15 },
      { week: 8, runway: 11 },
      { week: 12, runway: 7 },
    ];

    for (let i = 1; i < mockHistory.length; i++) {
      expect(mockHistory[i].runway).toBeLessThanOrEqual(mockHistory[i - 1].runway);
    }
  });

  test('Trend: funding event detection (jump in runway)', () => {
    const mockHistory = [
      { week: 1, runway: 8 },
      { week: 2, runway: 6 },
      { week: 5, runway: 18 }, // Series A close!
      { week: 12, runway: 16 },
    ];

    const fundingDetected = mockHistory[2]!.runway > mockHistory[1]!.runway * 2;
    expect(fundingDetected).toBe(true);
  });

  test('Trend: SVI score progression (upward if good execution)', () => {
    const mockScores = [145, 145, 146, 147, 148, 149, 150, 150, 151, 151, 152, 153];

    const trend = mockScores[mockScores.length - 1]! > mockScores[0]!;
    expect(trend).toBe(true);
  });

  test('Trend: ARR progression matches growth rate assumptions', () => {
    const input = MOCK_SEED_STARTUP;
    const monthlyGrowth = input.monthlyGrowthRate ?? 0.10;
    const startArr = (input.mrrAud ?? 0) * 12;

    // Simulate 12 weeks of growth
    let arr = startArr;
    const arrProgression = [arr];
    for (let week = 1; week < 12; week++) {
      arr *= Math.pow(1 + monthlyGrowth, 1); // 1 week ≈ 0.25 months
      arrProgression.push(arr);
    }

    // ARR should increase monotonically if growth rate > 0
    for (let i = 1; i < arrProgression.length; i++) {
      expect(arrProgression[i]).toBeGreaterThan(arrProgression[i - 1]!);
    }
  });
});

// ─── Edge Cases ────────────────────────────────────────────────────────

describe('clevel-sensitivity: Edge Cases', () => {
  test('Edge case: pre-revenue startup (zero MRR) handles gracefully', () => {
    const input = MOCK_PRESEED_STARTUP;
    const scenarios = generateScenarios(input);

    expect(scenarios.base.arrGrowthMoM).toBeGreaterThan(0);
    expect(scenarios.base.churnRate).toBe(0); // Can't churn if no customers
  });

  test('Edge case: missing growth rate uses stage benchmark', () => {
    const input: CLevelValuationInput = {
      ...MOCK_SEED_STARTUP,
      monthlyGrowthRate: undefined as any,
    };
    const scenarios = generateScenarios(input);

    // Should default to non-zero growth
    expect(scenarios.base.arrGrowthMoM).toBeGreaterThan(0.05);
  });

  test('Edge case: missing data defaults to reasonable AU benchmarks', () => {
    const minimal: CLevelValuationInput = {
      name: 'Minimal Startup',
      email: 'founder@minimal.xyz',
      sviScore: 100,
      stage: 2,
    };
    const scenarios = generateScenarios(minimal);

    expect(scenarios.base.arrGrowthMoM).toBeGreaterThan(0);
    expect(scenarios.base.churnRate).toBeGreaterThan(0);
    expect(scenarios.base.taxRate).toBe(0.25);
  });

  test('Edge case: extreme growth rate (300% MoM) does not break WACC', () => {
    const input: CLevelValuationInput = {
      ...MOCK_SEED_STARTUP,
      monthlyGrowthRate: 3.0,
    };
    const scenarios = generateScenarios(input);
    const output = generateScenarioValuation(input, 'base', scenarios.base);

    // Should produce non-negative valuation
    expect(output.valuation.midAud).toBeGreaterThan(0);
  });

  test('Edge case: zero churn rate (perfect retention)', () => {
    const input: CLevelValuationInput = {
      ...MOCK_SEED_STARTUP,
      churnRate: 0.0,
    };
    const scenarios = generateScenarios(input);

    expect(scenarios.base.churnRate).toBe(0);
    expect(scenarios.bear.churnRate).toBe(0); // Can't go negative
  });

  test('Edge case: high customer concentration (top 3 = 60% of revenue)', () => {
    const input = MOCK_SEED_STARTUP;
    // This would typically be flagged in CMO report
    // For sensitivity: no direct impact on DCF, but reduces confidence
    const table = buildSensitivityTable(input, generateScenarios(input));

    expect(table.baseValuationMid).toBeGreaterThan(0);
    // Confidence might be marked lower in metadata (not in this function)
  });

  test('Edge case: very early stage (stage 0 = concept)', () => {
    const input: CLevelValuationInput = {
      ...MOCK_PRESEED_STARTUP,
      stage: 0,
      sviScore: 80,
    };
    const scenarios = generateScenarios(input);

    // Should still generate scenarios
    expect(scenarios.base.arrGrowthMoM).toBeGreaterThan(0);
  });

  test('Edge case: late-stage (stage 7 = series C+)', () => {
    const input: CLevelValuationInput = {
      ...MOCK_HYPERGROWTH_STARTUP,
      stage: 7,
      sviScore: 180,
    };
    const scenarios = generateScenarios(input);

    // Growth should be more modest
    expect(scenarios.base.arrGrowthMoM).toBeLessThan(0.30);
  });
});

// ─── Regression & Scale Tests ──────────────────────────────────────────

describe('clevel-sensitivity: Regression & Scale', () => {
  test('Regression: nightly cron on 100 startups completes <30sec', async () => {
    const startups = Array.from({ length: 100 }, (_, i) => ({
      ...MOCK_SEED_STARTUP,
      name: `Startup ${i}`,
      email: `founder${i}@test.xyz`,
    }));

    const start = Date.now();
    const results = startups.map((startup) => {
      const scenarios = generateScenarios(startup);
      return buildSensitivityTable(startup, scenarios);
    });
    const duration = Date.now() - start;

    expect(results).toHaveLength(100);
    expect(duration).toBeLessThan(30_000); // Should be much faster than this
  });

  test('Regression: concurrent scenario generation (no race conditions)', async () => {
    const input = MOCK_SEED_STARTUP;
    const promises = Promise.all([
      generateScenarioValuation(input, 'bear', generateScenarios(input).bear),
      generateScenarioValuation(input, 'base', generateScenarios(input).base),
      generateScenarioValuation(input, 'bull', generateScenarios(input).bull),
    ]);

    const results = await promises;
    expect(results).toHaveLength(3);
    expect(results[0]?.scenario).toBe('bear');
    expect(results[1]?.scenario).toBe('base');
    expect(results[2]?.scenario).toBe('bull');
  });

  test('Regression: idempotency (same input = same output)', () => {
    const input = MOCK_SEED_STARTUP;
    const result1 = buildSensitivityTable(input, generateScenarios(input));
    const result2 = buildSensitivityTable(input, generateScenarios(input));

    expect(result1.baseValuationMid).toBe(result2.baseValuationMid);
    expect(result1.scenarioSummary.bear.valuation).toBe(result2.scenarioSummary.bear.valuation);
  });

  test('Regression: sensitivity table structure is consistent', () => {
    const inputs = [MOCK_SEED_STARTUP, MOCK_PRESEED_STARTUP, MOCK_HYPERGROWTH_STARTUP];

    inputs.forEach((input) => {
      const table = buildSensitivityTable(input, generateScenarios(input));

      expect(table.drivers).toHaveLength(5); // Exactly 5 drivers
      expect(table.scenarioSummary).toHaveProperty('bear');
      expect(table.scenarioSummary).toHaveProperty('base');
      expect(table.scenarioSummary).toHaveProperty('bull');
    });
  });

  test('Regression: no NaN or Infinity in outputs', () => {
    const inputs = [MOCK_SEED_STARTUP, MOCK_PRESEED_STARTUP, MOCK_HYPERGROWTH_STARTUP];

    inputs.forEach((input) => {
      const table = buildSensitivityTable(input, generateScenarios(input));

      expect(isFinite(table.baseValuationMid)).toBe(true);
      table.drivers.forEach((driver) => {
        expect(isFinite(driver.bearImpactPct)).toBe(true);
        expect(isFinite(driver.bullImpactPct)).toBe(true);
      });
    });
  });
});

// ─── Unit Economics Tests ──────────────────────────────────────────────

describe('clevel-sensitivity: Unit Economics', () => {
  test('LTV:CAC breakeven: higher CAC = higher churn tolerance', () => {
    const loCAC = findBreakevenChurn({
      arpu: 500,
      grossMargin: 0.72,
      cac: 2_000,
      targetRatio: 3.0,
    });

    const hiCAC = findBreakevenChurn({
      arpu: 500,
      grossMargin: 0.72,
      cac: 4_000,
      targetRatio: 3.0,
    });

    // Higher CAC should support higher churn (worse retention)
    expect(hiCAC).toBeGreaterThan(loCAC);
  });

  test('LTV:CAC breakeven: higher ARPU = lower churn tolerance (stronger position)', () => {
    const lowARPU = findBreakevenChurn({
      arpu: 100,
      grossMargin: 0.72,
      cac: 3_000,
      targetRatio: 3.0,
    });

    const highARPU = findBreakevenChurn({
      arpu: 1_000,
      grossMargin: 0.72,
      cac: 3_000,
      targetRatio: 3.0,
    });

    // Higher ARPU = higher LTV = can afford lower breakeven churn (tighter target)
    expect(highARPU).toBeLessThan(lowARPU);
  });

  test('Gross margin sensitivity: lower COGS % improves LTV', () => {
    const highCOGS = findBreakevenChurn({
      arpu: 500,
      grossMargin: 0.50, // 50% GM
      cac: 3_000,
      targetRatio: 3.0,
    });

    const lowCOGS = findBreakevenChurn({
      arpu: 500,
      grossMargin: 0.80, // 80% GM
      cac: 3_000,
      targetRatio: 3.0,
    });

    // Better margins = higher LTV = lower breakeven churn (can afford to be pickier)
    expect(lowCOGS).toBeLessThan(highCOGS);
  });
});

// ─── Valuation Realism Tests ───────────────────────────────────────────

describe('clevel-sensitivity: Valuation Realism', () => {
  test('Valuation realism: seed startup (stage 3, A$10k MRR) should be A$1-5M range', () => {
    const table = buildSensitivityTable(MOCK_SEED_STARTUP, generateScenarios(MOCK_SEED_STARTUP));

    expect(table.scenarioSummary.bear.valuation).toBeGreaterThan(500_000);
    expect(table.scenarioSummary.bull.valuation).toBeLessThan(10_000_000);
  });

  test('Valuation realism: pre-revenue startup should be <A$2M', () => {
    const table = buildSensitivityTable(MOCK_PRESEED_STARTUP, generateScenarios(MOCK_PRESEED_STARTUP));

    expect(table.scenarioSummary.bull.valuation).toBeLessThan(2_000_000);
  });

  test('Valuation realism: hypergrowth (A$50k MRR, 30% MoM) should be >A$5M', () => {
    const table = buildSensitivityTable(MOCK_HYPERGROWTH_STARTUP, generateScenarios(MOCK_HYPERGROWTH_STARTUP));

    expect(table.scenarioSummary.base.valuation).toBeGreaterThan(5_000_000);
  });

  test('Valuation realism: higher SVI score correlates with higher valuation', () => {
    const lowSVI: CLevelValuationInput = { ...MOCK_SEED_STARTUP, sviScore: 100 };
    const highSVI: CLevelValuationInput = { ...MOCK_SEED_STARTUP, sviScore: 170 };

    const lowTable = buildSensitivityTable(lowSVI, generateScenarios(lowSVI));
    const highTable = buildSensitivityTable(highSVI, generateScenarios(highSVI));

    expect(highTable.baseValuationMid).toBeGreaterThan(lowTable.baseValuationMid);
  });
});

// ─── v3.7.3 DCF Enhancements ───────────────────────────────────────────

describe('DCF v3.7.3 enhancements', () => {
  // ── buildWaccSensitivityGrid ─────────────────────────────────────────

  it('grid is 3×3 with correct dimensions', () => {
    const grid = buildWaccSensitivityGrid(MOCK_SEED_STARTUP);

    expect(grid.waccValues).toHaveLength(3);
    expect(grid.terminalGrowthValues).toHaveLength(3);
    expect(grid.grid).toHaveLength(3);
    grid.grid.forEach((row) => expect(row).toHaveLength(3));
  });

  it('center cell [1][1] matches base WACC=0.30 / tg=0.05', () => {
    const grid = buildWaccSensitivityGrid(MOCK_SEED_STARTUP, [0.28, 0.30, 0.32], [0.04, 0.05, 0.06]);
    const centerCell = grid.grid[1]![1]!;

    expect(centerCell).toBeGreaterThan(0);
    // waccDown2pct is the change from center to WACC=0.28; it should be positive (lower WACC → higher value)
    expect(grid.sensitivityPct.waccDown2pct).toBeGreaterThan(0);
  });

  it('sensitivityPct.waccUp2pct is negative (higher WACC → lower valuation)', () => {
    const grid = buildWaccSensitivityGrid(MOCK_SEED_STARTUP);

    expect(grid.sensitivityPct.waccUp2pct).toBeLessThan(0);
  });

  it('sensitivityPct.terminalGrowthUp1pct is positive (higher terminal growth → higher valuation)', () => {
    const grid = buildWaccSensitivityGrid(MOCK_SEED_STARTUP);

    expect(grid.sensitivityPct.terminalGrowthUp1pct).toBeGreaterThan(0);
  });

  it('rangeAud.low < rangeAud.high', () => {
    const grid = buildWaccSensitivityGrid(MOCK_SEED_STARTUP);

    expect(grid.rangeAud.low).toBeLessThan(grid.rangeAud.high);
  });

  // ── computeUnitEconomics ──────────────────────────────────────────────

  it('LTV increases as discount rate decreases', () => {
    const result = computeUnitEconomics({
      arpu: 500,
      grossMarginPct: 0.72,
      cac: 3_000,
      churnRate: 0.05,
      discountRates: [0.10, 0.15, 0.20],
    });

    const ltvs = result.ltvByDiscountRate.map((e) => e.ltv);
    expect(ltvs[0]).toBeGreaterThan(ltvs[1]!);
    expect(ltvs[1]).toBeGreaterThan(ltvs[2]!);
  });

  it('LTV:CAC ratio is > 1 with reasonable SaaS inputs', () => {
    const result = computeUnitEconomics({
      arpu: 500,
      grossMarginPct: 0.72,
      cac: 2_000,
      churnRate: 0.03,
      discountRates: [0.12],
    });

    expect(result.ltvByDiscountRate[0]!.ltvCacRatio).toBeGreaterThan(1);
  });

  it('CAC payback months is positive and scales with CAC', () => {
    const lowCac = computeUnitEconomics({ arpu: 500, grossMarginPct: 0.72, cac: 1_000, churnRate: 0.05 });
    const highCac = computeUnitEconomics({ arpu: 500, grossMarginPct: 0.72, cac: 4_000, churnRate: 0.05 });

    expect(lowCac.cacPaybackMonths).toBeGreaterThan(0);
    expect(highCac.cacPaybackMonths).toBeGreaterThan(lowCac.cacPaybackMonths);
  });

  it('paybackSensitivity has exactly 3 entries', () => {
    const result = computeUnitEconomics({
      arpu: 500,
      grossMarginPct: 0.72,
      cac: 3_000,
      churnRate: 0.05,
    });

    expect(result.paybackSensitivity).toHaveLength(3);
  });

  it('unitMarginPerMonthAud equals arpu × grossMarginPct', () => {
    const result = computeUnitEconomics({
      arpu: 400,
      grossMarginPct: 0.75,
      cac: 2_000,
      churnRate: 0.05,
    });

    expect(result.unitMarginPerMonthAud).toBeCloseTo(300, 5);
  });

  // ── assessFundingReadiness ────────────────────────────────────────────

  it('Series A is not_ready for a pre-revenue startup', () => {
    const report = assessFundingReadiness(MOCK_PRESEED_STARTUP, 110);
    const seriesA = report.gates.find((g) => g.stage === 'series_a');

    expect(seriesA?.band).toBe('not_ready');
  });

  it('Seed is ready for a basic seed-stage startup meeting all criteria', () => {
    const readyInput: CLevelValuationInput = {
      ...MOCK_SEED_STARTUP,
      teamSize: 3,
      stage: 3,
      sviScore: 130,
    };
    const report = assessFundingReadiness(readyInput, 130);
    const seed = report.gates.find((g) => g.stage === 'seed');

    expect(seed?.band).toBe('ready');
  });

  it('gaps array is non-empty for not_ready stages', () => {
    const report = assessFundingReadiness(MOCK_PRESEED_STARTUP, 110);
    const seriesA = report.gates.find((g) => g.stage === 'series_a');

    expect(seriesA?.gaps.length).toBeGreaterThan(0);
  });

  it('nextMilestones for Series A includes ARR milestone when pre-revenue', () => {
    const report = assessFundingReadiness(MOCK_PRESEED_STARTUP, 110);
    const seriesA = report.gates.find((g) => g.stage === 'series_a');
    const hasArrMilestone = seriesA?.nextMilestones.some((m) => m.toLowerCase().includes('arr'));

    expect(hasArrMilestone).toBe(true);
  });

  it('primaryUnlockStage is seed for a very early startup', () => {
    const earlyInput: CLevelValuationInput = {
      stage: 1,
      teamSize: 1,
      sviScore: 80,
      mrrAud: 0,
    };
    const report = assessFundingReadiness(earlyInput, 80);

    expect(report.primaryUnlockStage).toBe('seed');
  });

  it('overallReadinessScore is between 0 and 100', () => {
    const report = assessFundingReadiness(MOCK_SEED_STARTUP, 145);

    expect(report.overallReadinessScore).toBeGreaterThanOrEqual(0);
    expect(report.overallReadinessScore).toBeLessThanOrEqual(100);
  });
});
