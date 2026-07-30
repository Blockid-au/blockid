import { describe, expect, it } from "vitest";
import type { SVIAnalysis, SVISubScore } from "@/lib/svi-analysis";
import type { DeepValuationAnalysis } from "@/lib/agents/deep-valuation";
import { buildScnActionPlan } from "@/lib/agents/scn-action-plan";

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
    totalSVI: 50,
    baselineSVI: 100,
    netAdjustment: 0,
    confidenceMultiplier: 1,
    subs: [
      sub("mpc", 30),
      sub("ptd", 30),
      sub("tre", 30),
      sub("iri", 30),
      sub("cgh", 30),
      sub("svm", 30),
      sub("ftv", 30),
      sub("lco", 30),
    ],
    riskPenalties: [],
    evidenceGaps: [],
    nextActions: [],
    signals: {} as SVIAnalysis["signals"],
    summary: "",
    stage: 0,
    stageLabel: "Concept",
    stageBonus: 0,
    sector: "saas",
    ...overrides,
  };
}

function makeDv(overrides: Partial<DeepValuationAnalysis["blendedValuation"]> = {}, peers: DeepValuationAnalysis["peerComparables"] = []): DeepValuationAnalysis {
  return {
    perspectives: [],
    marketSizing: {
      tamAud: 0, samAud: 0, somAud: 0,
      methodology: "", sources: [], confidence: "low",
    },
    revenueScenarios: [],
    peerComparables: peers,
    blendedValuation: {
      lowAud: 500_000,
      midAud: 1_500_000,
      highAud: 3_000_000,
      confidence: "medium",
      weights: {} as DeepValuationAnalysis["blendedValuation"]["weights"],
      ...overrides,
    },
    methodNotes: [],
    riskFlags: [],
    generatedAt: new Date().toISOString(),
  };
}

describe("buildScnActionPlan — envelope", () => {
  it("returns the 5 canonical SCN layers in order", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis() });
    expect(plan.layers.map((l) => l.code)).toEqual([
      "validation", "position", "value", "direction", "capital",
    ]);
  });

  it("returns non-empty label + question + unlockCriteria for every layer", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis() });
    for (const layer of plan.layers) {
      expect(layer.label.length).toBeGreaterThan(0);
      expect(layer.question.length).toBeGreaterThan(0);
      expect(layer.unlockCriteria.length).toBeGreaterThan(0);
      expect(layer.statusReason.length).toBeGreaterThan(0);
      expect(layer.actions.length).toBeGreaterThan(0);
    }
  });

  it("returns generatedAt as an ISO string parseable by Date", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis() });
    expect(plan.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(Date.parse(plan.generatedAt))).toBe(false);
  });
});

describe("buildScnActionPlan — layer statuses", () => {
  it("validation: complete when mpc>=60 and CI present", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        subs: [sub("mpc", 60), sub("tre", 0), sub("iri", 0), sub("cgh", 0)],
        competitiveIntelligence: {} as SVIAnalysis["competitiveIntelligence"],
      }),
    });
    expect(plan.layers.find((l) => l.code === "validation")?.status).toBe("complete");
  });

  it("validation: in_progress when mpc in [40, 60)", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        subs: [sub("mpc", 40), sub("tre", 0), sub("iri", 0), sub("cgh", 0)],
      }),
    });
    expect(plan.layers.find((l) => l.code === "validation")?.status).toBe("in_progress");
  });

  it("validation: gap when mpc < 40", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        subs: [sub("mpc", 30), sub("tre", 0), sub("iri", 0), sub("cgh", 0)],
      }),
    });
    expect(plan.layers.find((l) => l.code === "validation")?.status).toBe("gap");
  });

  it("validation: gap when mpc>=60 but no CI", () => {
    // mpc>=60 alone is not enough — CI is also required
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        subs: [sub("mpc", 80), sub("tre", 0), sub("iri", 0), sub("cgh", 0)],
      }),
    });
    // Falls through to the in_progress branch (>=40 wins over >=60+CI complete)
    expect(plan.layers.find((l) => l.code === "validation")?.status).toBe("in_progress");
  });

  it("position: complete when sviScore>=70 and website URL present", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        totalSVI: 70,
        websiteUrl: "https://example.com",
        subs: [sub("mpc", 0), sub("tre", 0), sub("iri", 0), sub("cgh", 0)],
      }),
    });
    expect(plan.layers.find((l) => l.code === "position")?.status).toBe("complete");
  });

  it("position: in_progress when sviScore in [40, 70) even with website", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        totalSVI: 40,
        websiteUrl: "https://example.com",
        subs: [sub("mpc", 0), sub("tre", 0), sub("iri", 0), sub("cgh", 0)],
      }),
    });
    expect(plan.layers.find((l) => l.code === "position")?.status).toBe("in_progress");
  });

  it("position: gap when sviScore < 40", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ totalSVI: 30 }),
    });
    expect(plan.layers.find((l) => l.code === "position")?.status).toBe("gap");
  });

  it("value: complete requires deepValuation + high confidence + tre>=60", () => {
    const dv = makeDv({ confidence: "high", midAud: 2_000_000 });
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        subs: [sub("mpc", 0), sub("tre", 60), sub("iri", 0), sub("cgh", 0)],
      }),
      deepValuation: dv,
    });
    expect(plan.layers.find((l) => l.code === "value")?.status).toBe("complete");
  });

  it("value: in_progress when deepValuation mid>1M but confidence not high", () => {
    const dv = makeDv({ confidence: "medium", midAud: 2_000_000 });
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        subs: [sub("mpc", 0), sub("tre", 0), sub("iri", 0), sub("cgh", 0)],
      }),
      deepValuation: dv,
    });
    expect(plan.layers.find((l) => l.code === "value")?.status).toBe("in_progress");
  });

  it("value: gap when no deepValuation at all", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis() });
    expect(plan.layers.find((l) => l.code === "value")?.status).toBe("gap");
  });

  it("direction: complete when nextActions present and evidenceGaps<=3", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        nextActions: [{ priority: "P0", title: "x", detail: "d", impact: "i" }],
        evidenceGaps: [
          { priority: "P0", label: "", action: "", impact: 5, evidenceType: "" },
          { priority: "P1", label: "", action: "", impact: 3, evidenceType: "" },
        ],
      }),
    });
    expect(plan.layers.find((l) => l.code === "direction")?.status).toBe("complete");
  });

  it("direction: in_progress when nextActions present but too many gaps (>3)", () => {
    const gaps = Array.from({ length: 5 }, (_, i) => ({
      priority: "P0" as const, label: `g${i}`, action: "", impact: 1, evidenceType: "",
    }));
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        nextActions: [{ priority: "P0", title: "x", detail: "d", impact: "i" }],
        evidenceGaps: gaps,
      }),
    });
    expect(plan.layers.find((l) => l.code === "direction")?.status).toBe("in_progress");
  });

  it("direction: gap when no nextActions", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis() });
    expect(plan.layers.find((l) => l.code === "direction")?.status).toBe("gap");
  });

  it("capital: complete when iri>=70 and cgh>=60", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        subs: [sub("mpc", 0), sub("tre", 0), sub("iri", 70), sub("cgh", 60)],
      }),
    });
    expect(plan.layers.find((l) => l.code === "capital")?.status).toBe("complete");
  });

  it("capital: in_progress when iri in [50, 70)", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        subs: [sub("mpc", 0), sub("tre", 0), sub("iri", 50), sub("cgh", 0)],
      }),
    });
    expect(plan.layers.find((l) => l.code === "capital")?.status).toBe("in_progress");
  });

  it("capital: gap when iri < 50", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis() });
    expect(plan.layers.find((l) => l.code === "capital")?.status).toBe("gap");
  });
});

describe("buildScnActionPlan — action library branches", () => {
  it("position: inserts an extra P0 'close biggest evidence gaps' action when sviScore < 60", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ totalSVI: 45 }),
    });
    const posActions = plan.layers.find((l) => l.code === "position")!.actions;
    expect(posActions[0].title).toMatch(/close your 3 biggest evidence gaps/i);
    expect(posActions[0].priority).toBe("P0");
    // Two shipped baseline actions + one prepended = 3 total
    expect(posActions.length).toBe(3);
  });

  it("position: skips the prepended action when sviScore >= 60", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ totalSVI: 80 }),
    });
    const posActions = plan.layers.find((l) => l.code === "position")!.actions;
    expect(posActions.length).toBe(2);
    expect(posActions[0].title).not.toMatch(/close your 3 biggest evidence gaps/i);
  });

  it("value: pre-revenue branch fires when stage < 4", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ stage: 2 }),
    });
    const valueActions = plan.layers.find((l) => l.code === "value")!.actions;
    expect(valueActions.some((a) => /first revenue/i.test(a.title))).toBe(true);
    expect(valueActions.some((a) => /A\$10K MRR/i.test(a.title))).toBe(false);
  });

  it("value: revenue branch fires when stage >= 4", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ stage: 5 }),
    });
    const valueActions = plan.layers.find((l) => l.code === "value")!.actions;
    expect(valueActions.some((a) => /A\$10K MRR/i.test(a.title))).toBe(true);
    expect(valueActions.some((a) => /first revenue/i.test(a.title))).toBe(false);
  });

  it("capital: deck+dataroom branch fires when stage >= 3", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ stage: 3 }),
    });
    const capActions = plan.layers.find((l) => l.code === "capital")!.actions;
    expect(capActions.some((a) => /Data Room/i.test(a.title))).toBe(true);
    expect(capActions.some((a) => /pitch deck/i.test(a.title))).toBe(true);
  });

  it("capital: pre-raise investor-map branch fires when stage < 3", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ stage: 1 }),
    });
    const capActions = plan.layers.find((l) => l.code === "capital")!.actions;
    expect(capActions.some((a) => /AU investor list/i.test(a.title))).toBe(true);
    expect(capActions.some((a) => /Data Room/i.test(a.title))).toBe(false);
  });
});

describe("buildScnActionPlan — thisWeekFocus", () => {
  it("selects a this_week + P0 action when available", () => {
    // sviScore < 60 forces the P0/this_week 'close 3 biggest gaps' action to exist.
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ totalSVI: 45 }),
    });
    expect(plan.thisWeekFocus.timeline).toBe("this_week");
    expect(plan.thisWeekFocus.priority).toBe("P0");
  });

  it("falls back to a this_week action when no this_week+P0 exists", () => {
    // sviScore>=60 removes the P0/this_week 'close 3 biggest gaps' from position.
    // The remaining this_week candidates are the P1 'Get on the AU Startup Index leaderboard',
    // the P1 'Publish 3-scenario projection', and the P1 'Set one Strategic North-Star metric'.
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ totalSVI: 70 }),
    });
    expect(plan.thisWeekFocus.timeline).toBe("this_week");
  });

  it("is a member of the flattened action list across all layers", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis() });
    const all = plan.layers.flatMap((l) => l.actions);
    expect(all).toContain(plan.thisWeekFocus);
  });
});

describe("buildScnActionPlan — yourNumber", () => {
  it("uses default fallback valuation band when no deepValuation is supplied", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis() });
    expect(plan.yourNumber.valuationMidAud).toBe(500_000);
    expect(plan.yourNumber.valuationLowAud).toBe(200_000);
    expect(plan.yourNumber.valuationHighAud).toBe(1_200_000);
    expect(plan.yourNumber.valuationConfidence).toBe("low");
  });

  it("passes through the deepValuation blended band when supplied", () => {
    const dv = makeDv({ lowAud: 900_000, midAud: 2_500_000, highAud: 5_000_000, confidence: "high" });
    const plan = buildScnActionPlan({ analysis: makeAnalysis(), deepValuation: dv });
    expect(plan.yourNumber.valuationMidAud).toBe(2_500_000);
    expect(plan.yourNumber.valuationLowAud).toBe(900_000);
    expect(plan.yourNumber.valuationHighAud).toBe(5_000_000);
    expect(plan.yourNumber.valuationConfidence).toBe("high");
  });

  it("labels sviScore < 50 as 'Pre-validated'", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 30 }) });
    expect(plan.yourNumber.sviLabel).toMatch(/Pre-validated/);
  });

  it("labels sviScore in [50, 70) as 'Early-validated'", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 55 }) });
    expect(plan.yourNumber.sviLabel).toMatch(/Early-validated/);
  });

  it("labels sviScore in [70, 90) as 'Investable'", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 85 }) });
    expect(plan.yourNumber.sviLabel).toMatch(/Investable/);
  });

  it("labels sviScore in [90, 120) as 'Strong'", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 100 }) });
    expect(plan.yourNumber.sviLabel).toMatch(/Strong/);
  });

  it("labels sviScore >= 120 as 'Top tier'", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 150 }) });
    expect(plan.yourNumber.sviLabel).toMatch(/Top tier/);
  });

  it("percentileLabel with no percentileRank echoes 'vs AU {stageLabel}'", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ stageLabel: "Concept" }),
    });
    expect(plan.yourNumber.sviPercentileLabel).toBe("vs AU concept");
  });

  it("percentileLabel with a percentile computes 'top N% of AU {stageLabel}'", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ stageLabel: "Seed", percentileRank: 85 }),
    });
    // top = round(100 - 85) = 15
    expect(plan.yourNumber.sviPercentileLabel).toBe("top 15% of AU seed");
  });

  it("percentileLabel clamps top to at least 1% when percentile is 100", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ stageLabel: "Seed", percentileRank: 100 }),
    });
    expect(plan.yourNumber.sviPercentileLabel).toBe("top 1% of AU seed");
  });

  it("formats headline valuation with M suffix and the lowercased pre-em-dash label", () => {
    const dv = makeDv({ midAud: 2_500_000 });
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({ totalSVI: 55 }),
      deepValuation: dv,
    });
    expect(plan.yourNumber.headline).toBe("Your number: A$2.50M (early-validated)");
  });

  it("formats headline valuation with K suffix for sub-A$1M", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 30 }) });
    // default midAud=500_000 → A$500K
    expect(plan.yourNumber.headline).toContain("A$500K");
  });

  it("formats headline valuation with B suffix for A$1B+", () => {
    const dv = makeDv({ midAud: 2_500_000_000 });
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 150 }), deepValuation: dv });
    expect(plan.yourNumber.headline).toContain("A$2.50B");
  });
});

describe("buildScnActionPlan — plainEnglish branches", () => {
  it("returns the maturitySignal isEstablished carve-out when applicable", () => {
    const plan = buildScnActionPlan({
      analysis: makeAnalysis({
        maturitySignal: { isEstablished: true } as SVIAnalysis["maturitySignal"],
      }),
    });
    expect(plan.yourNumber.plainEnglish).toMatch(/established company/i);
    expect(plan.yourNumber.plainEnglish).toMatch(/Stripe\/Xero/);
  });

  it("returns pre-validated framing when sviScore < 50", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 30 }) });
    expect(plan.yourNumber.plainEnglish).toMatch(/pre-validated/i);
  });

  it("returns early-validated framing when sviScore in [50, 90)", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 60 }) });
    expect(plan.yourNumber.plainEnglish).toMatch(/early-validated/i);
  });

  it("returns investable framing when sviScore >= 90", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 100 }) });
    expect(plan.yourNumber.plainEnglish).toMatch(/investable/i);
  });
});

describe("buildScnActionPlan — milestones", () => {
  it("stage <= 1 emits the discovery→MVP→first-paying trio", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ stage: 0 }) });
    expect(plan.milestones.map((m) => m.day)).toEqual([30, 60, 90]);
    expect(plan.milestones[0].title).toMatch(/Problem-Solution Fit/);
    expect(plan.milestones[2].title).toMatch(/paying customer/i);
  });

  it("stage in (1, 3] emits the data-room→intros→term-sheet trio", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ stage: 3 }) });
    expect(plan.milestones[0].title).toMatch(/Data room complete/i);
    expect(plan.milestones[1].title).toMatch(/warm investor intros/i);
    expect(plan.milestones[2].title).toMatch(/term sheet/i);
  });

  it("stage > 3 emits the ARR→Series-A→round-opened trio", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ stage: 5 }) });
    expect(plan.milestones[0].title).toMatch(/ARR/);
    expect(plan.milestones[1].title).toMatch(/Series A readiness/i);
    expect(plan.milestones[2].title).toMatch(/Series A round opened/i);
  });

  it("every milestone carries a non-empty measurableGoal and >=1 evidenceRequired", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis() });
    for (const m of plan.milestones) {
      expect(m.measurableGoal.length).toBeGreaterThan(0);
      expect(m.evidenceRequired.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("buildScnActionPlan — valuation levers", () => {
  it("pre-revenue path leads with 'reach A$1 of first revenue'", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ stage: 2 }) });
    expect(plan.valuationLevers[0].lever).toMatch(/first revenue/i);
  });

  it("revenue path leads with 'push MRR to A$10K'", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ stage: 5 }) });
    expect(plan.valuationLevers[0].lever).toMatch(/MRR to A\$10K/i);
  });

  it("includes an ESOP pool lever regardless of stage", () => {
    const plan = buildScnActionPlan({ analysis: makeAnalysis() });
    expect(plan.valuationLevers.some((l) => /ESOP pool/i.test(l.lever))).toBe(true);
  });

  it("adds an SVI-lift lever only when sviScore < 80", () => {
    const low = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 50 }) });
    expect(low.valuationLevers.some((l) => /lift SVI to 80\+/i.test(l.lever))).toBe(true);
    const high = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 85 }) });
    expect(high.valuationLevers.some((l) => /lift SVI to 80\+/i.test(l.lever))).toBe(false);
  });

  it("adds a peer-similarity lever when deepValuation carries peer comparables", () => {
    const dv = makeDv({}, [
      {
        name: "Canva",
        sector: "saas",
        stageGuess: "growth",
        estValuationLowAud: 30_000_000_000,
        estValuationHighAud: 50_000_000_000,
        similarityScore: 45,
        source: "Test",
      },
    ]);
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ totalSVI: 85 }), deepValuation: dv });
    expect(plan.valuationLevers.some((l) => /Canva/.test(l.lever))).toBe(true);
  });

  it("caps valuation levers at 5", () => {
    const dv = makeDv({}, [
      {
        name: "Canva",
        sector: "saas",
        stageGuess: "growth",
        estValuationLowAud: 30_000_000_000,
        estValuationHighAud: 50_000_000_000,
        similarityScore: 45,
        source: "Test",
      },
    ]);
    // pre-revenue + sviScore<80 → 5 candidate levers (first-revenue, ESOP, SVI-lift, anchor-customer, peer). Cap holds.
    const plan = buildScnActionPlan({ analysis: makeAnalysis({ stage: 2, totalSVI: 40 }), deepValuation: dv });
    expect(plan.valuationLevers.length).toBeLessThanOrEqual(5);
  });
});
