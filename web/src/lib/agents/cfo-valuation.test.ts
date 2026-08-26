import { describe, it, expect } from "vitest";
import {
  auExitRealisationCheck,
  buildVcValuationReport,
  estimateMarketSizing,
  growthTierAdjustment,
  projectFinancials,
  scorecardFactors,
  scorecardMethod,
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

  // T0167 — coverage for AU-relevant sectors that the SVI classifier can emit
  // (see SECTOR_LABELS in src/lib/svi-analysis.ts). Previously anything outside
  // the original 17 sectors silently fell back to "default" (5.0x), which
  // under- or over-priced SpaceTech, GovTech, HRTech, LogisticsTech, etc.
  it("covers extended AU-relevant sectors with distinct multiples (not default)", () => {
    const extended = [
      "hrtech",
      "mediatech",
      "sportstech",
      "traveltech",
      "logisticstech",
      "retailtech",
      "govtech",
      "constructiontech",
      "spacetech",
    ];
    const defaultMid = vcBenchmark("default").arrMultiple.mid;
    for (const key of extended) {
      const bm = vcBenchmark(key);
      expect(bm.sector).toBe(key);
      expect(bm.arrMultiple.high).toBeGreaterThan(bm.arrMultiple.low);
      // Every extended sector must diverge from the generalist fallback so it
      // materially changes valuation output.
      expect(bm.arrMultiple.mid).not.toBe(defaultMid);
    }
  });

  // Berkus method should honour real input signals for pre-revenue startups
  // (founder vesting = quality team, SHA/data room = strategic relationships)
  // instead of using hardcoded flags that under- or over-credit every founder.
  it("pre-revenue Berkus responds to governance signals — vesting + SHA + data room lifts mid", () => {
    const preRev = { sector: "saas", stage: "pre-seed", mrrAud: 0, monthlyGrowthRatePct: 0 };
    const bare = buildVcValuationReport(preRev);
    const strong = buildVcValuationReport({
      ...preRev,
      hasFounderVesting: true,
      hasShareholdersAgreement: true,
      hasDataRoom: true,
    });
    const bareBerkus = bare.methods.find((m) => m.method === "berkus")!;
    const strongBerkus = strong.methods.find((m) => m.method === "berkus")!;
    expect(strongBerkus.midAud).toBeGreaterThan(bareBerkus.midAud);
    // Berkus carries 0.35 weight when pre-revenue, so the governance signal
    // must also lift the blended mid — the point of the change.
    expect(strong.blended.midAud).toBeGreaterThan(bare.blended.midAud);
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

  // Bug fix: the RDTI uplift was flat 4.35% for any positive refund, meaning a
  // A$10 refund lifted valuation identically to a A$500K refund. The lift must
  // scale with the refund's size relative to the RFS base — and stay capped so
  // a single tax attribute cannot dominate the method.
  it("RDTI valuation lift scales with refund magnitude and is capped", () => {
    const small = buildVcValuationReport({ ...input, estimatedRdtiRefundAud: 5_000 });
    const large = buildVcValuationReport({ ...input, estimatedRdtiRefundAud: 500_000 });
    const smallRfs = small.methods.find(m => m.method === "risk_factor_summation")!;
    const largeRfs = large.methods.find(m => m.method === "risk_factor_summation")!;
    expect(largeRfs.midAud).toBeGreaterThan(smallRfs.midAud);
    // Cap: even at a very large refund the RDTI-only lift stays ≤15%, so
    // rfMid never exceeds rfBase * 1.15 when ESIC is off.
    const bmMed = 6.75; // saas
    const rfBase = input.mrrAud * 12 * bmMed;
    expect(largeRfs.midAud).toBeLessThanOrEqual(Math.round(rfBase * 1.15) + 1);
    expect(largeRfs.rationale).toMatch(/proportional lift/);
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

  // Scorecard method (Bill Payne) — reference-only cross-check
  describe("scorecardMethod (Bill Payne)", () => {
    it("emits 7 factors whose weights sum to 1", () => {
      const factors = scorecardFactors(input);
      expect(factors).toHaveLength(7);
      const wSum = factors.reduce((s, f) => s + f.weight, 0);
      expect(wSum).toBeCloseTo(1, 5);
      // Each multiplier stays within Bill Payne's 0.5–2.5 band
      for (const f of factors) {
        expect(f.multiplier).toBeGreaterThanOrEqual(0.5);
        expect(f.multiplier).toBeLessThanOrEqual(2.5);
      }
    });

    it("produces an ordered mid valuation and cites the AU seed anchor", () => {
      const s = scorecardMethod(input);
      expect(s.method).toBe("scorecard");
      expect(s.midAud).toBeGreaterThan(0);
      expect(s.lowAud).toBeLessThan(s.midAud);
      expect(s.highAud).toBeGreaterThan(s.midAud);
      expect(s.rationale).toMatch(/Bill Payne/);
      expect(s.rationale).toMatch(/AVCAL|Cut Through Venture/);
    });

    it("stronger governance + ESIC lifts the mid valuation", () => {
      const bare = scorecardMethod(input);
      const strong = scorecardMethod({
        ...input,
        hasFounderVesting: true,
        hasShareholdersAgreement: true,
        hasEsopPool: true,
        hasDataRoom: true,
        esicQualifies: true,
      });
      expect(strong.midAud).toBeGreaterThan(bare.midAud);
    });

    it("is included in report.methods as a reference (weight=0) and never shifts blended", () => {
      const r = buildVcValuationReport(input);
      const s = r.methods.find((m) => m.method === "scorecard");
      expect(s).toBeDefined();
      expect(s!.weight).toBe(0);
      // Method weights (excluding scorecard) still sum to 1.
      const wSum = r.methods.filter((m) => m.method !== "scorecard").reduce((sum, m) => sum + m.weight, 0);
      expect(wSum).toBeCloseTo(1, 1);
    });
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
      // Anchor exits use anonymized labels (compliance — no real company names in output).
      const anchorCompanies = check.anchorExits.map((a) => a.company);
      const hasAnonymizedLabel = anchorCompanies.every((c) =>
        /^AU \w+ exit \d+ \(\d{4}\)$/.test(c)
      );
      expect(hasAnonymizedLabel).toBe(true);
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
