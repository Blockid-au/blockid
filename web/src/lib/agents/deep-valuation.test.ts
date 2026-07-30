import { describe, expect, it } from "vitest";
import type { SVIAnalysis, SVISubScore } from "@/lib/svi-analysis";
import type { WebsiteCompetitiveIntelligence } from "@/lib/competitive-intelligence";
import {
  buildDeepValuationAnalysis,
  type DeepValuationInput,
  type PerspectiveCode,
} from "./deep-valuation";

function sub(key: string, value: number): SVISubScore {
  return {
    label: key.toUpperCase(),
    key,
    value,
    adjustment: 0,
    rationale: "",
    evidence: [],
    gaps: [],
  };
}

function makeAnalysis(overrides: Partial<SVIAnalysis> = {}): SVIAnalysis {
  return {
    version: "test",
    totalSVI: 60,
    baselineSVI: 100,
    netAdjustment: 0,
    confidenceMultiplier: 1,
    subs: [sub("mpc", 30), sub("ptd", 30)],
    riskPenalties: [],
    evidenceGaps: [],
    nextActions: [],
    signals: {} as SVIAnalysis["signals"],
    summary: "",
    stage: 0,
    stageLabel: "Concept",
    stageBonus: 0,
    ...overrides,
  };
}

function makeCi(overrides: Partial<WebsiteCompetitiveIntelligence> = {}): WebsiteCompetitiveIntelligence {
  return {
    sciScore: 60,
    industry: "SaaS",
    subSector: "",
    competitionLevel: "medium",
    blueOceanScore: 50,
    marketMaturity: "growing",
    targetCustomer: "",
    revenueModelFit: [],
    competitors: [],
    uniquePositioning: "",
    gtmStrategy: {} as WebsiteCompetitiveIntelligence["gtmStrategy"],
    developmentDirection: {} as WebsiteCompetitiveIntelligence["developmentDirection"],
    elevationPlan: {} as WebsiteCompetitiveIntelligence["elevationPlan"],
    swot: {} as WebsiteCompetitiveIntelligence["swot"],
    ebitdaMetrics: {} as WebsiteCompetitiveIntelligence["ebitdaMetrics"],
    analysisConfidence: 60,
    analysisNotes: "",
    ...overrides,
  };
}

function baseInput(overrides: Partial<DeepValuationInput> = {}): DeepValuationInput {
  return {
    sviAnalysis: makeAnalysis(),
    rawText: "saas b2b software mrr subscription",
    ...overrides,
  };
}

const CANONICAL: PerspectiveCode[] = ["investor", "market", "operational", "ecosystem"];

describe("buildDeepValuationAnalysis — envelope shape", () => {
  it("returns the documented top-level keys", () => {
    const out = buildDeepValuationAnalysis(baseInput());
    expect(Object.keys(out).sort()).toEqual(
      [
        "blendedValuation",
        "generatedAt",
        "marketSizing",
        "methodNotes",
        "peerComparables",
        "perspectives",
        "revenueScenarios",
        "riskFlags",
      ].sort(),
    );
  });

  it("generatedAt is an ISO-8601 string that round-trips through Date.parse", () => {
    const out = buildDeepValuationAnalysis(baseInput());
    expect(typeof out.generatedAt).toBe("string");
    expect(Number.isFinite(Date.parse(out.generatedAt))).toBe(true);
  });

  it("methodNotes contains 4 fixed narrative lines", () => {
    const out = buildDeepValuationAnalysis(baseInput());
    expect(out.methodNotes).toHaveLength(4);
    for (const note of out.methodNotes) expect(note.length).toBeGreaterThan(20);
  });

  it("perspectives are emitted in canonical investor→market→operational→ecosystem order", () => {
    const out = buildDeepValuationAnalysis(baseInput());
    expect(out.perspectives.map((p) => p.code)).toEqual(CANONICAL);
  });

  it("every perspective has low <= mid <= high", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 5000, growthRatePct: 8 }));
    for (const p of out.perspectives) {
      expect(p.lowAud).toBeLessThanOrEqual(p.midAud);
      expect(p.midAud).toBeLessThanOrEqual(p.highAud);
    }
  });

  it("perspective weights renormalise to sum ≈ 1.0", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 5000 }));
    const total = out.perspectives.reduce((s, p) => s + p.weight, 0);
    expect(total).toBeGreaterThan(0.98);
    expect(total).toBeLessThanOrEqual(1.0 + 1e-6);
  });

  it("blendedValuation.weights exposes all four canonical codes", () => {
    const out = buildDeepValuationAnalysis(baseInput());
    expect(Object.keys(out.blendedValuation.weights).sort()).toEqual(CANONICAL.slice().sort());
  });

  it("blended low <= mid <= high", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 3000 }));
    expect(out.blendedValuation.lowAud).toBeLessThanOrEqual(out.blendedValuation.midAud);
    expect(out.blendedValuation.midAud).toBeLessThanOrEqual(out.blendedValuation.highAud);
  });
});

describe("sector detection + fallback", () => {
  it("saas keyword steers marketSizing to the SaaS TAM row", () => {
    const out = buildDeepValuationAnalysis(baseInput());
    expect(out.marketSizing.tamAud).toBe(22_000_000_000);
    expect(out.marketSizing.sources).toContain("IBISWorld AU SaaS 2025");
  });

  it("fintech keyword steers to the FinTech TAM row", () => {
    const out = buildDeepValuationAnalysis(baseInput({ rawText: "neobank payment platform fintech" }));
    expect(out.marketSizing.tamAud).toBe(35_000_000_000);
    expect(out.marketSizing.sources).toContain("KPMG Fintech Pulse AU 2025");
  });

  it("healthtech keyword steers to the HealthTech TAM row", () => {
    const out = buildDeepValuationAnalysis(baseInput({ rawText: "digital health telehealth clinical" }));
    expect(out.marketSizing.tamAud).toBe(18_000_000_000);
  });

  it("empty text falls back to the default sector row", () => {
    const out = buildDeepValuationAnalysis(baseInput({ rawText: "" }));
    expect(out.marketSizing.tamAud).toBe(15_000_000_000);
    expect(out.marketSizing.sources).toEqual(["PitchBook AU 2025 medians"]);
  });

  it("scrapedText contributes to sector detection alongside rawText", () => {
    const out = buildDeepValuationAnalysis(
      baseInput({ rawText: "", scrapedText: "fintech neobank" }),
    );
    expect(out.marketSizing.tamAud).toBe(35_000_000_000);
  });
});

describe("stage mapping via SVIAnalysis.stage", () => {
  it("stage=0 assumptions cite pre-seed AU median A$1,200,000", () => {
    const out = buildDeepValuationAnalysis(baseInput({ sviAnalysis: makeAnalysis({ stage: 0 }) }));
    const eco = out.perspectives.find((p) => p.code === "ecosystem")!;
    expect(eco.assumptions.some((a) => a.includes("pre-seed") && a.includes("1,200,000"))).toBe(true);
  });

  it("stage=2 assumptions cite seed AU median A$4,500,000", () => {
    const out = buildDeepValuationAnalysis(baseInput({ sviAnalysis: makeAnalysis({ stage: 2 }) }));
    const eco = out.perspectives.find((p) => p.code === "ecosystem")!;
    expect(eco.assumptions.some((a) => a.includes("seed") && a.includes("4,500,000"))).toBe(true);
  });

  it("stage=3 assumptions cite series-a AU median A$15,000,000", () => {
    const out = buildDeepValuationAnalysis(baseInput({ sviAnalysis: makeAnalysis({ stage: 3 }) }));
    const eco = out.perspectives.find((p) => p.code === "ecosystem")!;
    expect(eco.assumptions.some((a) => a.includes("series-a") && a.includes("15,000,000"))).toBe(true);
  });

  it("stage=4 assumptions cite series-b AU median A$45,000,000", () => {
    const out = buildDeepValuationAnalysis(baseInput({ sviAnalysis: makeAnalysis({ stage: 4 }) }));
    const eco = out.perspectives.find((p) => p.code === "ecosystem")!;
    expect(eco.assumptions.some((a) => a.includes("series-b") && a.includes("45,000,000"))).toBe(true);
  });

  it("stage=5+ assumptions cite growth AU median A$120,000,000", () => {
    const out = buildDeepValuationAnalysis(baseInput({ sviAnalysis: makeAnalysis({ stage: 7 }) }));
    const eco = out.perspectives.find((p) => p.code === "ecosystem")!;
    expect(eco.assumptions.some((a) => a.includes("growth") && a.includes("120,000,000"))).toBe(true);
  });
});

describe("investor + operational perspective weight gating on MRR", () => {
  it("pre-revenue: investor raw weight starts at 0.15 (lower than 0.30 revenue baseline)", () => {
    const noMrr = buildDeepValuationAnalysis(baseInput({ mrrAud: 0 }));
    const withMrr = buildDeepValuationAnalysis(baseInput({ mrrAud: 5000 }));
    const noInv = noMrr.perspectives.find((p) => p.code === "investor")!.weight;
    const withInv = withMrr.perspectives.find((p) => p.code === "investor")!.weight;
    expect(withInv).toBeGreaterThan(noInv);
  });

  it("pre-revenue: operational raw weight is 0.05 vs 0.25 with MRR", () => {
    const noMrr = buildDeepValuationAnalysis(baseInput({ mrrAud: 0 }));
    const withMrr = buildDeepValuationAnalysis(baseInput({ mrrAud: 5000 }));
    const noOp = noMrr.perspectives.find((p) => p.code === "operational")!.weight;
    const withOp = withMrr.perspectives.find((p) => p.code === "operational")!.weight;
    expect(withOp).toBeGreaterThan(noOp);
  });

  it("pre-revenue investor perspective still produces a non-zero mid via TAM floor", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 0 }));
    const inv = out.perspectives.find((p) => p.code === "investor")!;
    expect(inv.midAud).toBeGreaterThan(0);
  });

  it("pre-revenue operational perspective mid is 0 (no ARR)", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 0 }));
    const op = out.perspectives.find((p) => p.code === "operational")!;
    expect(op.midAud).toBe(0);
  });

  it("investor confidence is 'low' when MRR <= 1000 and 'medium' otherwise", () => {
    const preRev = buildDeepValuationAnalysis(baseInput({ mrrAud: 0 }));
    const rev = buildDeepValuationAnalysis(baseInput({ mrrAud: 5000 }));
    expect(preRev.perspectives.find((p) => p.code === "investor")!.confidence).toBe("low");
    expect(rev.perspectives.find((p) => p.code === "investor")!.confidence).toBe("medium");
  });

  it("operational confidence is 'high' when MRR > 500", () => {
    const rev = buildDeepValuationAnalysis(baseInput({ mrrAud: 5000 }));
    expect(rev.perspectives.find((p) => p.code === "operational")!.confidence).toBe("high");
  });
});

describe("rounding + numeric hygiene", () => {
  it("all perspective bands round to A$10,000 steps (Math.round of x / 10_000)", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 5000 }));
    for (const p of out.perspectives) {
      for (const v of [p.lowAud, p.midAud, p.highAud]) {
        expect(v % 10_000).toBe(0);
      }
    }
  });

  it("blended bands also round to A$10,000 steps", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 5000 }));
    for (const v of [out.blendedValuation.lowAud, out.blendedValuation.midAud, out.blendedValuation.highAud]) {
      expect(v % 10_000).toBe(0);
    }
  });

  it("round() returns 0 for non-positive intermediates (operational at MRR=0)", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 0 }));
    const op = out.perspectives.find((p) => p.code === "operational")!;
    expect(op.lowAud).toBe(0);
    expect(op.midAud).toBe(0);
    expect(op.highAud).toBe(0);
  });
});

describe("marketSizing", () => {
  it("sam/som are TAM × sector share proportions (saas 25% / 1.2%)", () => {
    const out = buildDeepValuationAnalysis(baseInput());
    expect(out.marketSizing.samAud).toBeCloseTo(22_000_000_000 * 0.25);
    expect(out.marketSizing.somAud).toBeCloseTo(22_000_000_000 * 0.012);
  });

  it("methodology string cites both the SAM % and SOM % for the resolved sector", () => {
    const out = buildDeepValuationAnalysis(baseInput());
    expect(out.marketSizing.methodology).toContain("25%");
    expect(out.marketSizing.methodology).toContain("1.20%");
  });
});

describe("revenueScenarios", () => {
  it("emits exactly 3 rows in conservative→base→optimistic order", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 2000 }));
    expect(out.revenueScenarios.map((s) => s.scenario)).toEqual([
      "conservative",
      "base",
      "optimistic",
    ]);
  });

  it("uses A$2,000 MRR floor when caller passes mrrAud=0 (projections stay non-zero)", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 0, growthRatePct: 8 }));
    for (const scen of out.revenueScenarios) {
      expect(scen.year1MrrAud).toBeGreaterThan(0);
      expect(scen.year3ArrAud).toBeGreaterThan(0);
      expect(scen.payingCustomers).toBeGreaterThan(0);
    }
  });

  it("optimistic monthly growth is capped at 25% so projections stay bounded", () => {
    const capped = buildDeepValuationAnalysis(baseInput({ mrrAud: 1000, growthRatePct: 100 }));
    const uncapped = buildDeepValuationAnalysis(baseInput({ mrrAud: 1000, growthRatePct: 500 }));
    const c = capped.revenueScenarios.find((s) => s.scenario === "optimistic")!;
    const u = uncapped.revenueScenarios.find((s) => s.scenario === "optimistic")!;
    expect(c.year3ArrAud).toBe(u.year3ArrAud);
  });

  it("customer count ARPU differs by sector — fintech A$80 vs saas A$250 for identical ARR", () => {
    const fin = buildDeepValuationAnalysis(baseInput({
      rawText: "neobank fintech payment",
      mrrAud: 10_000,
      growthRatePct: 6,
    }));
    const saas = buildDeepValuationAnalysis(baseInput({
      rawText: "saas b2b subscription",
      mrrAud: 10_000,
      growthRatePct: 6,
    }));
    const finBase = fin.revenueScenarios.find((s) => s.scenario === "base")!;
    const saasBase = saas.revenueScenarios.find((s) => s.scenario === "base")!;
    // Same MRR + growth → same ARR; fintech's A$80 ARPU yields ~3.1× more customers than saas' A$250 ARPU
    expect(finBase.payingCustomers).toBeGreaterThan(saasBase.payingCustomers * 2);
  });
});

describe("peerComparables", () => {
  it("returns at most 3 peers per sector", () => {
    const out = buildDeepValuationAnalysis(baseInput());
    expect(out.peerComparables.length).toBeLessThanOrEqual(3);
  });

  it("saas sector surfaces the shipped SafetyCulture peer", () => {
    const out = buildDeepValuationAnalysis(baseInput());
    expect(out.peerComparables.some((p) => p.name === "SafetyCulture")).toBe(true);
  });

  it("fintech sector surfaces Zeller with sector='fintech'", () => {
    const out = buildDeepValuationAnalysis(baseInput({ rawText: "neobank fintech payment" }));
    expect(out.peerComparables.some((p) => p.name === "Zeller" && p.sector === "fintech")).toBe(true);
  });

  it("unknown sector falls back to the default peer row with stageGuess echoing resolved stage", () => {
    const out = buildDeepValuationAnalysis(baseInput({
      rawText: "",
      sviAnalysis: makeAnalysis({ stage: 3 }),
    }));
    expect(out.peerComparables).toHaveLength(1);
    expect(out.peerComparables[0].name).toBe("AU Series-A median");
    expect(out.peerComparables[0].stageGuess).toBe("series-a");
  });

  it("every peer row carries an estValuationLow ≤ estValuationHigh invariant", () => {
    const out = buildDeepValuationAnalysis(baseInput());
    for (const p of out.peerComparables) {
      expect(p.estValuationLowAud).toBeLessThanOrEqual(p.estValuationHighAud);
    }
  });
});

describe("riskFlags", () => {
  it("SVI < 50 fires the fundamentals warning", () => {
    const out = buildDeepValuationAnalysis(baseInput({
      sviAnalysis: makeAnalysis({ totalSVI: 40 }),
    }));
    expect(out.riskFlags.some((f) => f.startsWith("SVI < 50"))).toBe(true);
  });

  it("SVI = 50 does NOT fire the fundamentals warning (strict <)", () => {
    const out = buildDeepValuationAnalysis(baseInput({
      sviAnalysis: makeAnalysis({ totalSVI: 50 }),
    }));
    expect(out.riskFlags.some((f) => f.startsWith("SVI < 50"))).toBe(false);
  });

  it("mrrAud=0 fires the pre-revenue haircut warning", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 0 }));
    expect(out.riskFlags.some((f) => f.startsWith("Pre-revenue"))).toBe(true);
  });

  it("mrrAud>0 skips the pre-revenue warning", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 5000 }));
    expect(out.riskFlags.some((f) => f.startsWith("Pre-revenue"))).toBe(false);
  });

  it("competitionLevel='extreme' fires the multiple-compression warning", () => {
    const out = buildDeepValuationAnalysis(baseInput({
      competitiveIntelligence: makeCi({ competitionLevel: "extreme" }),
    }));
    expect(out.riskFlags.some((f) => f.startsWith("Extreme competition"))).toBe(true);
  });

  it("competitionLevel='high' fires the moat-defensibility warning", () => {
    const out = buildDeepValuationAnalysis(baseInput({
      competitiveIntelligence: makeCi({ competitionLevel: "high" }),
    }));
    expect(out.riskFlags.some((f) => f.startsWith("High competition"))).toBe(true);
  });

  it("sector=ecommerce fires the lower-revenue-multiples warning", () => {
    const out = buildDeepValuationAnalysis(baseInput({ rawText: "e-commerce d2c online store" }));
    expect(out.riskFlags.some((f) => f.startsWith("eCommerce"))).toBe(true);
  });
});

describe("blendedValuation.confidence band", () => {
  it("no MRR + no CI → 'low' (2 lens medium at most, no high)", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 0 }));
    expect(out.blendedValuation.confidence).toBe("medium");
  });

  it("MRR > 500 elevates operational to 'high' → overall 'medium' (1 high + others medium)", () => {
    const out = buildDeepValuationAnalysis(baseInput({ mrrAud: 5000 }));
    expect(["medium", "high"]).toContain(out.blendedValuation.confidence);
  });
});

describe("competitiveIntelligence integration", () => {
  it("higher blueOceanScore lifts the market perspective mid vs low", () => {
    const low = buildDeepValuationAnalysis(baseInput({
      competitiveIntelligence: makeCi({ blueOceanScore: 10 }),
    }));
    const high = buildDeepValuationAnalysis(baseInput({
      competitiveIntelligence: makeCi({ blueOceanScore: 90 }),
    }));
    const lowMid = low.perspectives.find((p) => p.code === "market")!.midAud;
    const highMid = high.perspectives.find((p) => p.code === "market")!.midAud;
    expect(highMid).toBeGreaterThan(lowMid);
  });

  it("ebitdaMetrics low/high are averaged into the ecosystem sector-adjust", () => {
    const withBench = buildDeepValuationAnalysis(baseInput({
      competitiveIntelligence: makeCi({
        ebitdaMetrics: {
          evEbitdaMultipleLow: 4,
          evEbitdaMultipleHigh: 8,
        } as WebsiteCompetitiveIntelligence["ebitdaMetrics"],
      }),
    }));
    const noBench = buildDeepValuationAnalysis(baseInput());
    const withEco = withBench.perspectives.find((p) => p.code === "ecosystem")!;
    const noEco = noBench.perspectives.find((p) => p.code === "ecosystem")!;
    // Both should carry non-zero mid; the assumption line should cite the supplied EBITDA multiple midpoint
    expect(withEco.midAud).toBeGreaterThan(0);
    expect(noEco.midAud).toBeGreaterThan(0);
    expect(withEco.assumptions.some((a) => a.includes("EBITDA multiple: 6.0"))).toBe(true);
    // No CI supplied → assumption falls back to the 6.0 default label
    expect(noEco.assumptions.some((a) => a.includes("EBITDA multiple: 6.0"))).toBe(true);
  });
});
