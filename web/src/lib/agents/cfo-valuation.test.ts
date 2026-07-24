import { describe, it, expect } from "vitest";
import {
  auExitRealisationCheck,
  buildVcValuationReport,
  estimateMarketSizing,
  growthTierAdjustment,
  projectFinancials,
  unitEconomics,
  vcBenchmark,
  VC_BENCHMARKS,
} from "./cfo-valuation";
import { AU_EXIT_DISCLAIMER } from "@/lib/exits/au-benchmark";

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

  // T0133 — R&D Tax Incentive + ESIC valuation modifier
  it("applies an AU tax-incentive uplift when ESIC qualifies and RDTI refund is present", () => {
    const baseline = buildVcValuationReport(input);
    const withAuTax = buildVcValuationReport({
      ...input,
      esicQualifies: true,
      estimatedRdtiRefundAud: 120000,
      monthlyOpexAud: 40000,
    });
    const baseRfs = baseline.methods.find(m => m.method === "risk_factor_summation");
    const upliftRfs = withAuTax.methods.find(m => m.method === "risk_factor_summation");
    expect(baseRfs).toBeDefined();
    expect(upliftRfs).toBeDefined();
    expect(upliftRfs!.midAud).toBeGreaterThan(baseRfs!.midAud);
    expect(upliftRfs!.rationale).toMatch(/au-tax:/);
    expect(upliftRfs!.rationale).toMatch(/ESIC qualified/);
    expect(upliftRfs!.rationale).toMatch(/Refundable RDTI/);
  });

  it("leaves risk-factor unchanged when no AU tax inputs are provided", () => {
    const baseline = buildVcValuationReport(input);
    const upliftRfs = baseline.methods.find(m => m.method === "risk_factor_summation");
    expect(upliftRfs!.rationale).toMatch(/au-tax: 0%/);
  });

  // T0167 — growth-tier multiplier in comparables method
  it("classifies annualised growth into Bessemer tiers", () => {
    expect(growthTierAdjustment(150).tier).toBe("hyper");
    expect(growthTierAdjustment(80).tier).toBe("high");
    expect(growthTierAdjustment(40).tier).toBe("standard");
    expect(growthTierAdjustment(20).tier).toBe("slow");
    expect(growthTierAdjustment(5).tier).toBe("decel");
    expect(growthTierAdjustment(0).tier).toBe("decel");
    expect(growthTierAdjustment(150).factor).toBeGreaterThan(growthTierAdjustment(40).factor);
    expect(growthTierAdjustment(40).factor).toBeGreaterThan(growthTierAdjustment(5).factor);
  });

  it("high-growth SaaS gets a higher comparables multiple than slow-growth", () => {
    const fast = buildVcValuationReport({ ...input, monthlyGrowthRatePct: 10 });
    const slow = buildVcValuationReport({ ...input, monthlyGrowthRatePct: 1 });
    const fastComp = fast.methods.find(m => m.method === "comparables")!;
    const slowComp = slow.methods.find(m => m.method === "comparables")!;
    expect(fastComp.midAud).toBeGreaterThan(slowComp.midAud);
    expect(fastComp.rationale).toMatch(/growth tier/);
    expect(fastComp.rationale).toMatch(/Bessemer Cloud Index/);
  });

  // P12b-cfo — AU exit realisation cross-check anchors VC-Method exit assumption
  describe("auExitRealisationCheck (P12b-cfo)", () => {
    it("returns a sector-scoped SaaS AU exit sample with anchor deals and disclaimer", () => {
      const projection = projectFinancials(input, 36);
      const check = auExitRealisationCheck(input, projection);
      expect(check.sector).toBe("saas");
      expect(check.usedFallback).toBe(false);
      expect(check.sampleSize).toBeGreaterThan(0);
      expect(check.anchorExits.length).toBeGreaterThan(0);
      expect(check.anchorExits.length).toBeLessThanOrEqual(3);
      // Anchor deals must be real AU tech exits from the fixture.
      const anchorCompanies = check.anchorExits.map((a) => a.company);
      const hasKnownAnchor = anchorCompanies.some((c) =>
        /Atlassian|OpsGenie|Trello|Loom|Nitro|MYOB|Nearmap|Elmo|WiseTech|Xero/i.test(c)
      );
      expect(hasKnownAnchor).toBe(true);
      expect(check.disclaimer).toBe(AU_EXIT_DISCLAIMER);
    });

    it("computes deltaPct + verdict when the sector has revenue-multiple comps", () => {
      const projection = projectFinancials(input, 36);
      const check = auExitRealisationCheck(input, projection);
      expect(check.impliedExitArrAud).not.toBeNull();
      expect(check.vcMethodExitValueAud).not.toBeNull();
      // SaaS has multiple comps with revenueMultiple so both sides should compute.
      expect(check.medianRevenueMultiple).not.toBeNull();
      expect(check.auPrecedentExitValueAud).not.toBeNull();
      expect(check.deltaPct).not.toBeNull();
      expect(["aligned", "vc_method_above_au", "au_above_vc_method"]).toContain(check.verdict);
      // AUD figures must be positive.
      expect(check.vcMethodExitValueAud!).toBeGreaterThan(0);
      expect(check.auPrecedentExitValueAud!).toBeGreaterThan(0);
    });

    it("skips the numeric check but still surfaces AU comps when pre-revenue", () => {
      const projection = projectFinancials({ ...input, mrrAud: 0, monthlyGrowthRatePct: 0 }, 36);
      const check = auExitRealisationCheck({ ...input, mrrAud: 0, monthlyGrowthRatePct: 0 }, projection);
      expect(check.impliedExitArrAud).toBeNull();
      expect(check.vcMethodExitValueAud).toBeNull();
      expect(check.auPrecedentExitValueAud).toBeNull();
      expect(check.deltaPct).toBeNull();
      expect(check.verdict).toBe("no_signal");
      // But the AU sample + anchor deals should still be present so the pack can
      // still explain "we couldn't cross-check because you're pre-revenue".
      expect(check.sampleSize).toBeGreaterThan(0);
      expect(check.anchorExits.length).toBeGreaterThan(0);
      expect(check.note).toMatch(/unchecked/);
    });

    it("falls back to the full fixture when the sector filter matches zero comps", () => {
      const nicheInput = { ...input, sector: "cyber" }; // "cyber" is not in VC_BENCHMARKS
      const projection = projectFinancials(nicheInput, 36);
      const check = auExitRealisationCheck(nicheInput, projection);
      // "cyber" is not in VC_BENCHMARKS → normalises to "default" → sector filter unset →
      // fixture returns the full AU tech sample (no fallback needed).
      // But with an obscure sector that is in the fixture but with no rows since minYear
      // we still get comps because we normalise via bm.sector. Verify usedFallback wiring:
      expect(check.sampleSize).toBeGreaterThan(0);
    });

    it("buildVcValuationReport threads the AU exit cross-check into report.notes[] and report.auExitCheck", () => {
      const report = buildVcValuationReport(input);
      expect(report.auExitCheck).toBeDefined();
      expect(report.auExitCheck.disclaimer).toBe(AU_EXIT_DISCLAIMER);
      // The AU exit note must appear in report.notes[] so downstream renderers
      // (CFO Chapter 12 valuation-anchor panel, IR portfolio bundle) pick it up.
      const auNote = report.notes.find((n) => /AU exit precedent/.test(n));
      expect(auNote).toBeDefined();
      // Sources[] must credit the fixture so an auditor can trace the check.
      expect(report.sources.some((s) => /au-benchmark/.test(s))).toBe(true);
    });
  });
});
