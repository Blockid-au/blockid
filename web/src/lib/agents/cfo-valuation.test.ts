import { describe, it, expect } from "vitest";
import {
  buildVcValuationReport,
  estimateMarketSizing,
  unitEconomics,
  vcBenchmark,
  VC_BENCHMARKS,
} from "./cfo-valuation";

describe("cfo-valuation — VC-grade valuation engine", () => {
  const input = {
    sector: "saas",
    stage: "seed",
    mrrAud: 20000,
    monthlyGrowthRatePct: 8,
    grossMarginPct: 80,
    cashOnHandAud: 300000,
    arpuAud: 150,
    monthlyChurnPct: 3,
    cacAud: 600,
    customers: 130,
  };

  it("returns a blended valuation with weighted methods (Berkus shown as reference for revenue-positive)", () => {
    const r = buildVcValuationReport(input);
    expect(r.methods.length).toBeGreaterThanOrEqual(4);
    expect(r.blended.midAud).toBeGreaterThan(0);
    expect(r.blended.lowAud).toBeLessThanOrEqual(r.blended.midAud);
    expect(r.blended.highAud).toBeGreaterThanOrEqual(r.blended.midAud);
    expect(r.blended.confidence).toBeGreaterThanOrEqual(30);
    const wsum = r.methods.reduce((s, m) => s + m.weight, 0);
    expect(wsum).toBeCloseTo(1, 1);
  });

  it("orders market sizing TAM ≥ SAM ≥ SOM", () => {
    const m = estimateMarketSizing(input);
    expect(m.tamAud).toBeGreaterThanOrEqual(m.samAud);
    expect(m.samAud).toBeGreaterThanOrEqual(m.somAud);
    expect(m.sources.length).toBeGreaterThan(0);
  });

  it("scenarios are ordered bull > base > bear", () => {
    const r = buildVcValuationReport(input);
    expect(r.scenarios.bull).toBeGreaterThan(r.scenarios.base);
    expect(r.scenarios.base).toBeGreaterThan(r.scenarios.bear);
  });

  it("produces a financial injection with valid dilution and use-of-funds", () => {
    const r = buildVcValuationReport(input);
    expect(r.injection.raiseAud).toBeGreaterThan(0);
    expect(r.injection.dilutionPct).toBeGreaterThan(0);
    expect(r.injection.dilutionPct).toBeLessThan(100);
    const pct = r.injection.useOfFunds.reduce((s, u) => s + u.pct, 0);
    expect(pct).toBe(100);
  });

  it("computes unit economics with an LTV/CAC verdict", () => {
    const ue = unitEconomics(input);
    expect(ue.ltvCacRatio).toBeGreaterThan(0);
    expect(["strong", "healthy", "watch", "weak"]).toContain(ue.verdict);
  });

  it("projects 36 months and resolves a break-even outcome", () => {
    const r = buildVcValuationReport(input);
    expect(r.projection).toHaveLength(36);
    expect(r.breakEven).toHaveProperty("month");
  });

  it("exposes a benchmark for every known sector with citations", () => {
    for (const key of Object.keys(VC_BENCHMARKS)) {
      const bm = vcBenchmark(key);
      expect(bm.arrMultiple.high).toBeGreaterThan(bm.arrMultiple.low);
      expect(bm.sources.length).toBeGreaterThan(0);
    }
  });
});
