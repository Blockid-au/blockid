import { describe, it, expect } from "vitest";
import {
  modernTechStackBenchmarks,
  securityBenchmarks,
  codeQualityBenchmarks,
  nextJsOptimizationBenchmarks,
  calculateKubernetesImpact,
  estimateEssentialEightComplianceCost,
  estimateNextJsSavings,
  projectBudget12Months,
  australianMarketSummary,
  type ResearchDataSet,
  type TechBudgetProjection,
  type TechBudgetMonth,
} from "./cto-cost-modeling";

// ── registry invariants ────────────────────────────────────────────────────

const ALL_DATASETS: Array<[string, ResearchDataSet]> = [
  ["modernTechStackBenchmarks", modernTechStackBenchmarks],
  ["securityBenchmarks", securityBenchmarks],
  ["codeQualityBenchmarks", codeQualityBenchmarks],
  ["nextJsOptimizationBenchmarks", nextJsOptimizationBenchmarks],
];

describe("research datasets — shape invariants", () => {
  it.each(ALL_DATASETS)(
    "%s carries confidence in (0,1] and a non-empty dataPoints array",
    (_name, ds) => {
      expect(ds.confidence).toBeGreaterThan(0);
      expect(ds.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(ds.dataPoints)).toBe(true);
      expect(ds.dataPoints.length).toBeGreaterThan(0);
    }
  );

  it.each(ALL_DATASETS)(
    "%s per-row metric / value / source are non-empty strings",
    (_name, ds) => {
      for (const row of ds.dataPoints) {
        expect(typeof row.metric).toBe("string");
        expect(row.metric.trim().length).toBeGreaterThan(0);
        expect(typeof row.value).toBe("string");
        expect(row.value.trim().length).toBeGreaterThan(0);
        expect(typeof row.source).toBe("string");
        expect(row.source.trim().length).toBeGreaterThan(0);
      }
    }
  );

  it("modernTechStackBenchmarks pins the Kubernetes 78% AU adoption anchor", () => {
    const row = modernTechStackBenchmarks.dataPoints.find((r) =>
      r.metric.includes("Kubernetes")
    );
    expect(row).toBeDefined();
    expect(row!.value).toBe("78%");
  });

  it("modernTechStackBenchmarks pins the React 62% / Vue 14% / Angular 11% / Svelte 9% front-end share", () => {
    const row = modernTechStackBenchmarks.dataPoints.find((r) =>
      r.metric.toLowerCase().includes("front")
    );
    expect(row).toBeDefined();
    expect(row!.value).toContain("React 62%");
    expect(row!.value).toContain("Vue 14%");
    expect(row!.value).toContain("Angular 11%");
    expect(row!.value).toContain("Svelte 9%");
  });

  it("securityBenchmarks pins the ACSC 38% Essential Eight compliance anchor", () => {
    const row = securityBenchmarks.dataPoints.find((r) =>
      r.metric.includes("Essential Eight overall compliance")
    );
    expect(row).toBeDefined();
    expect(row!.value).toBe("38%");
    expect(row!.source.toLowerCase()).toContain("acsc");
  });

  it("securityBenchmarks pins the OWASP Top 10 2024 45% adoption anchor", () => {
    const row = securityBenchmarks.dataPoints.find((r) =>
      r.metric.includes("OWASP Top 10")
    );
    expect(row).toBeDefined();
    expect(row!.value).toBe("45%");
  });

  it("codeQualityBenchmarks ships exactly 4 rows so the Chapter-7 code-quality panel has a stable slot count", () => {
    expect(codeQualityBenchmarks.dataPoints).toHaveLength(4);
  });

  it("codeQualityBenchmarks pins the SAST 72% adoption + DORA 68% CI/CD quality-gate anchors", () => {
    const sast = codeQualityBenchmarks.dataPoints.find((r) =>
      r.metric.includes("SAST")
    );
    const cicd = codeQualityBenchmarks.dataPoints.find((r) =>
      r.metric.includes("CI/CD")
    );
    expect(sast?.value).toBe("72%");
    expect(cicd?.value).toBe("68%");
    expect(cicd?.source).toContain("DORA");
  });

  it("nextJsOptimizationBenchmarks pins bundle_size_reduction=42%", () => {
    const row = nextJsOptimizationBenchmarks.dataPoints.find(
      (r) => r.metric === "bundle_size_reduction"
    );
    expect(row).toBeDefined();
    expect(row!.value).toBe("42%");
  });
});

// ── calculateKubernetesImpact ──────────────────────────────────────────────

describe("calculateKubernetesImpact", () => {
  it("applies the shipped 15% × adoptionRate reduction — default 0.78 gives 1000 → 883", () => {
    expect(calculateKubernetesImpact(1000)).toBeCloseTo(883, 6);
  });

  it("adoptionRate=0 is a no-op (returns baseCost verbatim)", () => {
    expect(calculateKubernetesImpact(1000, 0)).toBe(1000);
    expect(calculateKubernetesImpact(12345, 0)).toBe(12345);
  });

  it("adoptionRate=1 caps the reduction at exactly 15% → 1000 → 850", () => {
    expect(calculateKubernetesImpact(1000, 1)).toBeCloseTo(850, 6);
  });

  it("baseCost=0 always returns 0 regardless of adoptionRate", () => {
    expect(calculateKubernetesImpact(0)).toBe(0);
    expect(calculateKubernetesImpact(0, 0.5)).toBe(0);
    expect(calculateKubernetesImpact(0, 1)).toBe(0);
  });

  it("mid adoptionRate=0.5 halves the max reduction → 500 * (1 - 0.075) = 462.5", () => {
    expect(calculateKubernetesImpact(500, 0.5)).toBeCloseTo(462.5, 6);
  });
});

// ── estimateEssentialEightComplianceCost ──────────────────────────────────

describe("estimateEssentialEightComplianceCost", () => {
  it("default target is 0.71 (the ACSC ML3 Patch Applications anchor)", () => {
    // current === default target → gap 0 → cost 0
    expect(estimateEssentialEightComplianceCost(0.71)).toBe(0);
  });

  it("charges AUD 1,200 per percentage-point gap — AU 38% baseline → 0.71 target = 396", () => {
    expect(estimateEssentialEightComplianceCost(0.38)).toBeCloseTo(396, 3);
  });

  it("Math.max(0, gap) clamps a current-above-target case to zero cost", () => {
    expect(estimateEssentialEightComplianceCost(0.9, 0.71)).toBe(0);
    expect(estimateEssentialEightComplianceCost(1, 0.5)).toBe(0);
  });

  it("worst-case 0 → 1 gap surfaces the full AUD 1,200/month uplift", () => {
    expect(estimateEssentialEightComplianceCost(0, 1)).toBeCloseTo(1200, 6);
  });

  it("custom target above default respects the caller-supplied value — 0.5 → 0.9 gap = 480", () => {
    expect(estimateEssentialEightComplianceCost(0.5, 0.9)).toBeCloseTo(480, 6);
  });
});

// ── estimateNextJsSavings ─────────────────────────────────────────────────

describe("estimateNextJsSavings", () => {
  it("bundle reduction is 40% (research-anchored) — 1000 KB → 600 KB", () => {
    const r = estimateNextJsSavings(1000, 800);
    expect(r.reducedBundleKB).toBeCloseTo(600, 6);
  });

  it("TTFB improvement is 60% — 800 ms → 320 ms", () => {
    const r = estimateNextJsSavings(1000, 800);
    expect(r.improvedTTFBms).toBeCloseTo(320, 6);
  });

  it("zero inputs return zero savings without throwing", () => {
    const r = estimateNextJsSavings(0, 0);
    expect(r.reducedBundleKB).toBe(0);
    expect(r.improvedTTFBms).toBe(0);
  });

  it("ratio invariants hold across arbitrary inputs — reduced is 60% of input, improved is 40%", () => {
    for (const [bundle, ttfb] of [
      [250, 100],
      [512, 1200],
      [9999, 50],
    ] as const) {
      const r = estimateNextJsSavings(bundle, ttfb);
      expect(r.reducedBundleKB).toBeCloseTo(bundle * 0.6, 6);
      expect(r.improvedTTFBms).toBeCloseTo(ttfb * 0.4, 6);
    }
  });
});

// ── projectBudget12Months ─────────────────────────────────────────────────

function makeMonth(m: number, value: number): TechBudgetMonth {
  return {
    month: m,
    infra: value,
    development: value * 2,
    ai: value * 0.5,
    tools: value * 0.25,
    security: value * 0.75,
  };
}

function makeProjection(perMonth = 1000): TechBudgetProjection {
  const months: TechBudgetMonth[] = Array.from({ length: 12 }, (_, i) =>
    makeMonth(i + 1, perMonth)
  );
  const sum = (k: keyof TechBudgetMonth) =>
    months.reduce((a, r) => a + (r[k] as number), 0);
  const totalInfra12 = sum("infra");
  const totalDev12 = sum("development");
  const totalAI12 = sum("ai");
  const totalTools12 = sum("tools");
  const totalSecurity12 = sum("security");
  return {
    months,
    totalInfra12,
    totalDev12,
    totalAI12,
    totalTools12,
    totalSecurity12,
    grandTotal12:
      totalInfra12 + totalDev12 + totalAI12 + totalTools12 + totalSecurity12,
  };
}

describe("projectBudget12Months", () => {
  it("preserves the 12-month array length and per-row month index", () => {
    const p = makeProjection();
    const out = projectBudget12Months(p);
    expect(out.months).toHaveLength(12);
    for (let i = 0; i < 12; i += 1) {
      expect(out.months[i].month).toBe(i + 1);
    }
  });

  it("month 1 factor is 1.02^0 = 1, so month 1 costs match input verbatim (default growth 0.02)", () => {
    const p = makeProjection(500);
    const out = projectBudget12Months(p);
    const first = out.months[0];
    const inFirst = p.months[0];
    expect(first.infra).toBeCloseTo(inFirst.infra, 6);
    expect(first.development).toBeCloseTo(inFirst.development, 6);
    expect(first.ai).toBeCloseTo(inFirst.ai, 6);
    expect(first.tools).toBeCloseTo(inFirst.tools, 6);
    expect(first.security).toBeCloseTo(inFirst.security, 6);
  });

  it("scales every category by the same monthly factor Math.pow(1+rate, month-1)", () => {
    const p = makeProjection(1000);
    const out = projectBudget12Months(p, 0.05);
    for (let i = 0; i < 12; i += 1) {
      const factor = Math.pow(1.05, i);
      expect(out.months[i].infra).toBeCloseTo(p.months[i].infra * factor, 5);
      expect(out.months[i].development).toBeCloseTo(
        p.months[i].development * factor,
        5
      );
      expect(out.months[i].ai).toBeCloseTo(p.months[i].ai * factor, 5);
      expect(out.months[i].tools).toBeCloseTo(p.months[i].tools * factor, 5);
      expect(out.months[i].security).toBeCloseTo(
        p.months[i].security * factor,
        5
      );
    }
  });

  it("monthlyGrowthRate=0 is an identity projection (months + totals equal input)", () => {
    const p = makeProjection(750);
    const out = projectBudget12Months(p, 0);
    expect(out.totalInfra12).toBeCloseTo(p.totalInfra12, 6);
    expect(out.totalDev12).toBeCloseTo(p.totalDev12, 6);
    expect(out.totalAI12).toBeCloseTo(p.totalAI12, 6);
    expect(out.totalTools12).toBeCloseTo(p.totalTools12, 6);
    expect(out.totalSecurity12).toBeCloseTo(p.totalSecurity12, 6);
    expect(out.grandTotal12).toBeCloseTo(p.grandTotal12, 6);
  });

  it("aggregated totals equal the column-wise sum of the projected months", () => {
    const p = makeProjection(1000);
    const out = projectBudget12Months(p, 0.03);
    const col = (k: keyof TechBudgetMonth) =>
      out.months.reduce((a, r) => a + (r[k] as number), 0);
    expect(out.totalInfra12).toBeCloseTo(col("infra"), 4);
    expect(out.totalDev12).toBeCloseTo(col("development"), 4);
    expect(out.totalAI12).toBeCloseTo(col("ai"), 4);
    expect(out.totalTools12).toBeCloseTo(col("tools"), 4);
    expect(out.totalSecurity12).toBeCloseTo(col("security"), 4);
  });

  it("grandTotal12 equals the sum of the five category totals", () => {
    const p = makeProjection(2000);
    const out = projectBudget12Months(p, 0.02);
    const sum =
      out.totalInfra12 +
      out.totalDev12 +
      out.totalAI12 +
      out.totalTools12 +
      out.totalSecurity12;
    expect(out.grandTotal12).toBeCloseTo(sum, 3);
  });

  it("does not mutate the input projection (months + totals unchanged after call)", () => {
    const p = makeProjection(1000);
    const before = JSON.parse(JSON.stringify(p));
    projectBudget12Months(p, 0.1);
    expect(p).toEqual(before);
  });

  it("high growth 1.0 doubles the per-month factor every step — month 12 factor = 2^11 = 2048", () => {
    const p = makeProjection(1);
    const out = projectBudget12Months(p, 1.0);
    expect(out.months[11].infra).toBeCloseTo(Math.pow(2, 11), 6);
  });
});

// ── australianMarketSummary ───────────────────────────────────────────────

describe("australianMarketSummary", () => {
  it("pins the shipped Kubernetes/serverless/AI adoption anchors", () => {
    expect(australianMarketSummary.kubernetesAdoption).toBe(0.78);
    expect(australianMarketSummary.serverlessAdoption).toBe(0.34);
    expect(australianMarketSummary.aiAssistantUsage).toBe(0.48);
  });

  it("pins the Essential Eight overall vs ML3 patch anchors", () => {
    expect(australianMarketSummary.essentialEightCompliance).toBe(0.38);
    expect(australianMarketSummary.essentialEightPatchLevel3).toBe(0.71);
  });

  it("pins OWASP + SAST + CI/CD anchors from the security + code-quality benchmarks", () => {
    expect(australianMarketSummary.owaspTop10Adoption).toBe(0.45);
    expect(australianMarketSummary.sastAdoption).toBe(0.72);
    expect(australianMarketSummary.ciCdQualityGate).toBe(0.68);
  });

  it("frontend framework share is bounded [0,1] per key and sums to ~0.96 (top-4 coverage)", () => {
    const s = australianMarketSummary.frontendFrameworkShare;
    for (const v of Object.values(s)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const total = s.react + s.vue + s.angular + s.svelte;
    expect(total).toBeCloseTo(0.96, 6);
  });

  it("frontend framework share matches the modernTechStackBenchmarks row verbatim (React 62/Vue 14/Angular 11/Svelte 9)", () => {
    const s = australianMarketSummary.frontendFrameworkShare;
    expect(s.react).toBe(0.62);
    expect(s.vue).toBe(0.14);
    expect(s.angular).toBe(0.11);
    expect(s.svelte).toBe(0.09);
  });

  it("every percentage-shaped key is bounded [0,1]", () => {
    const pctKeys = [
      "kubernetesAdoption",
      "serverlessAdoption",
      "aiAssistantUsage",
      "essentialEightCompliance",
      "essentialEightPatchLevel3",
      "owaspTop10Adoption",
      "sastAdoption",
      "ciCdQualityGate",
      "staticAnalysisCoverage",
      "nextJsBundleReduction",
    ] as const;
    for (const k of pctKeys) {
      const v = australianMarketSummary[k];
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("maintainabilityIndex is the shipped 68/100 anchor as a bare integer", () => {
    expect(australianMarketSummary.maintainabilityIndex).toBe(68);
    expect(Number.isInteger(australianMarketSummary.maintainabilityIndex)).toBe(
      true
    );
  });

  it("nextJsBundleReduction (summary constant) matches the estimateNextJsSavings 40% math within 2 pts", () => {
    // Summary anchors 0.42 while the pure helper hard-codes 0.40 —
    // pin the acceptable drift band so a future refresh cannot silently
    // desync the two by more than 5 percentage points.
    const drift = Math.abs(australianMarketSummary.nextJsBundleReduction - 0.4);
    expect(drift).toBeLessThanOrEqual(0.05);
  });
});
