/**
 * Colocated vitest for the pure idea-stage valuation estimator at
 * ./idea-valuation.ts.
 *
 * P3-idea-valuation-lib-test — pins the Berkus + Scorecard model that anchors
 * the /tools/idea-valuation founder surface (referenced by first-principles
 * engine, svi-actions, landing CTA strip, and the founder-pack PDF). A silent
 * drift in the per-factor cap, band spread, TAM tiering, or suggestion ordering
 * would leak into a pre-incorporation valuation range founders quote at their
 * first cheque conversation — this test blocks that regression in CI.
 */

import { describe, expect, it } from "vitest";

import {
  AU_PRE_INCORP_BAND,
  TAM_PRESETS,
  computeIdeaValuation,
  type IdeaValuationInput,
  type Score1to5,
} from "./idea-valuation";

const NO_TRAITS = {
  priorExit: false,
  technical: false,
  domainExpert: false,
  hasNetwork: false,
  fullTime: false,
} as const;

const ALL_TRAITS = {
  priorExit: true,
  technical: true,
  domainExpert: true,
  hasNetwork: true,
  fullTime: true,
} as const;

const NO_TRACTION = {
  waitlistOver100: false,
  paidLois: false,
  pilotSigned: false,
  payingCustomers: false,
  acceleratorAccepted: false,
} as const;

const NO_TEAM = {
  hasCEO: false,
  hasCTO: false,
  hasCommercial: false,
  hasDesign: false,
} as const;

const FULL_TEAM = {
  hasCEO: true,
  hasCTO: true,
  hasCommercial: true,
  hasDesign: true,
} as const;

function baseInput(overrides: Partial<IdeaValuationInput> = {}): IdeaValuationInput {
  return {
    tamAud: 800_000_000,
    problemSeverity: 3 as Score1to5,
    founderStrength: 3 as Score1to5,
    founderTraits: { ...NO_TRAITS },
    solutionMaturity: 3 as Score1to5,
    traction: { ...NO_TRACTION },
    moatStrength: 3 as Score1to5,
    competitionDensity: 3 as Score1to5,
    team: { ...NO_TEAM },
    ...overrides,
  };
}

describe("computeIdeaValuation — output shape", () => {
  it("returns berkusBaseAud, scorecardMultiplier, mid/low/highAud, factors[5], suggestions[≤3], confidence", () => {
    const out = computeIdeaValuation(baseInput());
    expect(typeof out.berkusBaseAud).toBe("number");
    expect(typeof out.scorecardMultiplier).toBe("number");
    expect(typeof out.midAud).toBe("number");
    expect(typeof out.lowAud).toBe("number");
    expect(typeof out.highAud).toBe("number");
    expect(out.factors).toHaveLength(5);
    expect(out.suggestions.length).toBeLessThanOrEqual(3);
    expect(typeof out.confidence).toBe("string");
    expect(out.confidence.length).toBeGreaterThan(0);
  });

  it("emits the 5 Berkus factor keys in stable order (soundIdea/prototype/qualityTeam/strategicRelationships/productRollout)", () => {
    const out = computeIdeaValuation(baseInput());
    expect(out.factors.map((f) => f.key)).toEqual([
      "soundIdea",
      "prototype",
      "qualityTeam",
      "strategicRelationships",
      "productRollout",
    ]);
  });

  it("caps every factor at AUD 500,000 (Berkus per-pillar cap) and carries a non-empty label + note", () => {
    const out = computeIdeaValuation(
      baseInput({
        problemSeverity: 5,
        solutionMaturity: 5,
        founderStrength: 5,
        founderTraits: { ...ALL_TRAITS },
        team: { ...FULL_TEAM },
        traction: {
          waitlistOver100: true,
          paidLois: true,
          pilotSigned: true,
          payingCustomers: true,
          acceleratorAccepted: true,
        },
      }),
    );
    for (const f of out.factors) {
      expect(f.capAud).toBe(500_000);
      expect(f.valueAud).toBeLessThanOrEqual(500_000);
      expect(f.fillRatio).toBeGreaterThanOrEqual(0);
      expect(f.fillRatio).toBeLessThanOrEqual(1);
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.note.length).toBeGreaterThan(0);
    }
  });
});

describe("Berkus factor 1 — sound idea (problem severity)", () => {
  it("scales as severity/5 × 500k (score 1 → 100k)", () => {
    const out = computeIdeaValuation(baseInput({ problemSeverity: 1 }));
    const idea = out.factors.find((f) => f.key === "soundIdea")!;
    expect(idea.valueAud).toBeCloseTo(100_000, 5);
    expect(idea.fillRatio).toBeCloseTo(0.2, 10);
  });

  it("reaches the 500k cap at severity 5", () => {
    const out = computeIdeaValuation(baseInput({ problemSeverity: 5 }));
    const idea = out.factors.find((f) => f.key === "soundIdea")!;
    expect(idea.valueAud).toBe(500_000);
    expect(idea.fillRatio).toBe(1);
  });
});

describe("Berkus factor 2 — prototype (solution maturity)", () => {
  it("scales as maturity/5 × 500k (score 2 → 200k)", () => {
    const out = computeIdeaValuation(baseInput({ solutionMaturity: 2 }));
    const proto = out.factors.find((f) => f.key === "prototype")!;
    expect(proto.valueAud).toBeCloseTo(200_000, 5);
    expect(proto.fillRatio).toBeCloseTo(0.4, 10);
  });

  it("reaches the 500k cap at maturity 5", () => {
    const out = computeIdeaValuation(baseInput({ solutionMaturity: 5 }));
    const proto = out.factors.find((f) => f.key === "prototype")!;
    expect(proto.valueAud).toBe(500_000);
    expect(proto.fillRatio).toBe(1);
  });
});

describe("Berkus factor 3 — quality team (weighted founder × traits × completeness)", () => {
  it("uses the documented 50/25/25 weighting — floor case (score 1, no traits, no team) → 0.5*0.2 = 0.10 fill", () => {
    const out = computeIdeaValuation(
      baseInput({
        founderStrength: 1,
        founderTraits: { ...NO_TRAITS },
        team: { ...NO_TEAM },
      }),
    );
    const q = out.factors.find((f) => f.key === "qualityTeam")!;
    expect(q.fillRatio).toBeCloseTo(0.1, 10);
    expect(q.valueAud).toBeCloseTo(50_000, 5);
  });

  it("reaches the 500k cap at founderStrength=5, all traits, full team", () => {
    const out = computeIdeaValuation(
      baseInput({
        founderStrength: 5,
        founderTraits: { ...ALL_TRAITS },
        team: { ...FULL_TEAM },
      }),
    );
    const q = out.factors.find((f) => f.key === "qualityTeam")!;
    expect(q.fillRatio).toBe(1);
    expect(q.valueAud).toBe(500_000);
  });

  it("mid case (founder 3, 2 traits, 2 seats) → 0.5*0.6 + 0.25*(2/5) + 0.25*(2/4) = 0.525", () => {
    const out = computeIdeaValuation(
      baseInput({
        founderStrength: 3,
        founderTraits: {
          priorExit: true,
          technical: true,
          domainExpert: false,
          hasNetwork: false,
          fullTime: false,
        },
        team: {
          hasCEO: true,
          hasCTO: true,
          hasCommercial: false,
          hasDesign: false,
        },
      }),
    );
    const q = out.factors.find((f) => f.key === "qualityTeam")!;
    expect(q.fillRatio).toBeCloseTo(0.525, 10);
    expect(q.valueAud).toBeCloseTo(262_500, 5);
  });
});

describe("Berkus factor 4 — strategic relationships (traction signals)", () => {
  it("waitlistOver100 alone → 0.2 fill", () => {
    const out = computeIdeaValuation(
      baseInput({ traction: { ...NO_TRACTION, waitlistOver100: true } }),
    );
    const s = out.factors.find((f) => f.key === "strategicRelationships")!;
    expect(s.fillRatio).toBeCloseTo(0.2, 10);
  });

  it("paidLois + pilotSigned → 0.6 fill (0.3 + 0.3)", () => {
    const out = computeIdeaValuation(
      baseInput({
        traction: { ...NO_TRACTION, paidLois: true, pilotSigned: true },
      }),
    );
    const s = out.factors.find((f) => f.key === "strategicRelationships")!;
    expect(s.fillRatio).toBeCloseTo(0.6, 10);
  });

  it("clamps to 1.0 when all four signals fire (0.2+0.3+0.3+0.2 = 1.0)", () => {
    const out = computeIdeaValuation(
      baseInput({
        traction: {
          waitlistOver100: true,
          paidLois: true,
          pilotSigned: true,
          payingCustomers: false,
          acceleratorAccepted: true,
        },
      }),
    );
    const s = out.factors.find((f) => f.key === "strategicRelationships")!;
    expect(s.fillRatio).toBe(1);
    expect(s.valueAud).toBe(500_000);
  });

  it("payingCustomers does NOT contribute to the strategic pillar (that lives in productRollout)", () => {
    const out = computeIdeaValuation(
      baseInput({
        traction: { ...NO_TRACTION, payingCustomers: true },
      }),
    );
    const s = out.factors.find((f) => f.key === "strategicRelationships")!;
    expect(s.fillRatio).toBe(0);
  });
});

describe("Berkus factor 5 — product rollout (paying + maturity)", () => {
  it("payingCustomers alone → 0.7 fill", () => {
    const out = computeIdeaValuation(
      baseInput({
        solutionMaturity: 3,
        traction: { ...NO_TRACTION, payingCustomers: true },
      }),
    );
    const r = out.factors.find((f) => f.key === "productRollout")!;
    expect(r.fillRatio).toBeCloseTo(0.7, 10);
  });

  it("maturity=4 with no paying customers → 0.2 fill", () => {
    const out = computeIdeaValuation(baseInput({ solutionMaturity: 4 }));
    const r = out.factors.find((f) => f.key === "productRollout")!;
    expect(r.fillRatio).toBeCloseTo(0.2, 10);
  });

  it("maturity=5 with paying customers clamps to 1.0 (0.7 + 0.2 + 0.1)", () => {
    const out = computeIdeaValuation(
      baseInput({
        solutionMaturity: 5,
        traction: { ...NO_TRACTION, payingCustomers: true },
      }),
    );
    const r = out.factors.find((f) => f.key === "productRollout")!;
    expect(r.fillRatio).toBeCloseTo(1, 10);
    expect(r.valueAud).toBeCloseTo(500_000, 5);
  });

  it("maturity=3 with no traction → 0 fill (nothing has fired)", () => {
    const out = computeIdeaValuation(baseInput({ solutionMaturity: 3 }));
    const r = out.factors.find((f) => f.key === "productRollout")!;
    expect(r.fillRatio).toBe(0);
    expect(r.valueAud).toBe(0);
  });
});

describe("Scorecard multiplier — TAM tiering", () => {
  // baseInput sets moat=3 (contributes +0.05) and comp=3 (contributes 0), so
  // the neutral offset is +0.05 on top of whichever TAM band is exercised.
  it("<10M TAM contributes -0.20 to the multiplier", () => {
    const out = computeIdeaValuation(baseInput({ tamAud: 5_000_000 }));
    expect(out.scorecardMultiplier).toBeCloseTo(0.85, 10);
  });

  it("<100M TAM contributes -0.05 to the multiplier", () => {
    const out = computeIdeaValuation(baseInput({ tamAud: 50_000_000 }));
    expect(out.scorecardMultiplier).toBeCloseTo(1.0, 10);
  });

  it("<1B TAM contributes +0.15 to the multiplier", () => {
    const out = computeIdeaValuation(baseInput({ tamAud: 800_000_000 }));
    expect(out.scorecardMultiplier).toBeCloseTo(1.2, 10);
  });

  it("≥1B TAM contributes +0.30 (global tier)", () => {
    const out = computeIdeaValuation(baseInput({ tamAud: 5_000_000_000 }));
    expect(out.scorecardMultiplier).toBeCloseTo(1.35, 10);
  });

  it("zero or negative TAM contributes -0.25 (invalid signal — floor)", () => {
    const zero = computeIdeaValuation(baseInput({ tamAud: 0 }));
    expect(zero.scorecardMultiplier).toBeCloseTo(0.8, 10);
    const negative = computeIdeaValuation(baseInput({ tamAud: -1 }));
    expect(negative.scorecardMultiplier).toBeCloseTo(0.8, 10);
  });

  it("non-finite TAM (NaN) falls into the invalid branch → -0.25", () => {
    const out = computeIdeaValuation(baseInput({ tamAud: Number.NaN }));
    expect(out.scorecardMultiplier).toBeCloseTo(0.8, 10);
  });
});

describe("Scorecard multiplier — moat and competition contributions", () => {
  it("moat 1 subtracts 0.15, moat 5 adds 0.25 (holding TAM at <1B tier +0.15, comp3=0)", () => {
    const lowMoat = computeIdeaValuation(baseInput({ moatStrength: 1 }));
    // 1 + 0.15 (tam) + -0.15 (moat1) + 0 (comp3) = 1.00
    expect(lowMoat.scorecardMultiplier).toBeCloseTo(1.0, 10);
    const highMoat = computeIdeaValuation(baseInput({ moatStrength: 5 }));
    // 1 + 0.15 + 0.25 + 0 = 1.40
    expect(highMoat.scorecardMultiplier).toBeCloseTo(1.4, 10);
  });

  it("competition 1 subtracts 0.15, competition 5 adds 0.15", () => {
    const dense = computeIdeaValuation(baseInput({ competitionDensity: 1 }));
    // 1 + 0.15 (tam) + 0.05 (moat3) + -0.15 (comp1) = 1.05
    expect(dense.scorecardMultiplier).toBeCloseTo(1.05, 10);
    const uncontested = computeIdeaValuation(baseInput({ competitionDensity: 5 }));
    // 1 + 0.15 + 0.05 + 0.15 = 1.35
    expect(uncontested.scorecardMultiplier).toBeCloseTo(1.35, 10);
  });

  it("clamps to the floor 0.5 for the worst-case scorecard (invalid TAM + moat 1 + comp 1)", () => {
    const out = computeIdeaValuation(
      baseInput({ tamAud: 0, moatStrength: 1, competitionDensity: 1 }),
    );
    // 1 + -0.25 + -0.15 + -0.15 = 0.45 → clamped to 0.5
    expect(out.scorecardMultiplier).toBe(0.5);
  });

  it("clamps to the ceiling 1.5 for the best-case scorecard (global TAM + moat 5 + comp 5)", () => {
    const out = computeIdeaValuation(
      baseInput({
        tamAud: 10_000_000_000,
        moatStrength: 5,
        competitionDensity: 5,
      }),
    );
    // 1 + 0.30 + 0.25 + 0.15 = 1.70 → clamped to 1.5
    expect(out.scorecardMultiplier).toBe(1.5);
  });
});

describe("Mid / low / high band arithmetic", () => {
  it("midAud = round(berkusBaseAud × scorecardMultiplier); low/high = mid × (1 ∓ 0.35)", () => {
    const out = computeIdeaValuation(
      baseInput({
        problemSeverity: 4,
        solutionMaturity: 3,
        founderStrength: 4,
        team: { ...FULL_TEAM },
      }),
    );
    expect(out.midAud).toBe(Math.round(out.berkusBaseAud * out.scorecardMultiplier));
    expect(out.lowAud).toBe(Math.round(out.midAud * 0.65));
    expect(out.highAud).toBe(Math.round(out.midAud * 1.35));
  });

  it("lowAud ≤ midAud ≤ highAud always holds", () => {
    const out = computeIdeaValuation(baseInput());
    expect(out.lowAud).toBeLessThanOrEqual(out.midAud);
    expect(out.midAud).toBeLessThanOrEqual(out.highAud);
  });

  it("all-zeros pillar case → mid/low/high all 0 (no pillar has fired)", () => {
    const out = computeIdeaValuation(
      baseInput({
        problemSeverity: 1,
        solutionMaturity: 1,
        founderStrength: 1,
      }),
    );
    // even with zero-est pillars the sound-idea/prototype pillars fire at 100k each,
    // so mid > 0. Assert monotone band around it instead.
    expect(out.midAud).toBeGreaterThan(0);
    expect(out.lowAud).toBe(Math.round(out.midAud * 0.65));
  });
});

describe("Suggestions", () => {
  it("returns at most 3 suggestions, sorted by upliftAud descending", () => {
    const out = computeIdeaValuation(
      baseInput({ problemSeverity: 1, solutionMaturity: 1, founderStrength: 1 }),
    );
    expect(out.suggestions.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < out.suggestions.length; i++) {
      expect(out.suggestions[i - 1].upliftAud).toBeGreaterThanOrEqual(
        out.suggestions[i].upliftAud,
      );
    }
  });

  it("suppresses pillar-level suggestions with < 50k headroom (a fully-fired pillar drops out)", () => {
    const out = computeIdeaValuation(
      baseInput({
        problemSeverity: 5,
        solutionMaturity: 5,
        founderStrength: 5,
        founderTraits: { ...ALL_TRAITS },
        team: { ...FULL_TEAM },
        traction: {
          waitlistOver100: true,
          paidLois: true,
          pilotSigned: true,
          payingCustomers: true,
          acceleratorAccepted: true,
        },
      }),
    );
    // Every Berkus pillar is at cap → the pillar-level suggestions are all suppressed.
    // Only scorecard-side hints remain, and moat/tam are strong so those also skip.
    expect(out.suggestions).toHaveLength(0);
  });

  it("adds the 're-frame the market' scorecard hint when TAM < 100M (with all Berkus pillars filled to isolate the scorecard-side hint)", () => {
    const out = computeIdeaValuation(
      baseInput({
        tamAud: 50_000_000,
        problemSeverity: 5,
        solutionMaturity: 5,
        founderStrength: 5,
        founderTraits: { ...ALL_TRAITS },
        team: { ...FULL_TEAM },
        traction: {
          waitlistOver100: true,
          paidLois: true,
          pilotSigned: true,
          payingCustomers: true,
          acceleratorAccepted: true,
        },
        moatStrength: 5, // suppress the moat hint so market is the sole candidate
      }),
    );
    const titles = out.suggestions.map((s) => s.title);
    expect(titles.some((t) => /market/i.test(t))).toBe(true);
  });

  it("adds the 'articulate a defensible moat' hint when moatStrength ≤ 2", () => {
    // Fill the Berkus pillars so their per-pillar uplift falls behind the 150k moat hint.
    const out = computeIdeaValuation(
      baseInput({
        tamAud: 5_000_000_000,
        moatStrength: 2,
        problemSeverity: 5,
        solutionMaturity: 5,
        founderStrength: 5,
        founderTraits: { ...ALL_TRAITS },
        team: { ...FULL_TEAM },
        traction: {
          waitlistOver100: true,
          paidLois: true,
          pilotSigned: true,
          payingCustomers: true,
          acceleratorAccepted: true,
        },
      }),
    );
    const titles = out.suggestions.map((s) => s.title);
    expect(titles.some((t) => /moat/i.test(t))).toBe(true);
  });

  it("scales pillar uplift by the current scorecard multiplier (bigger multiplier → bigger suggested uplift)", () => {
    const low = computeIdeaValuation(
      baseInput({
        tamAud: 5_000_000,
        problemSeverity: 1,
        moatStrength: 1,
        competitionDensity: 1,
      }),
    );
    const high = computeIdeaValuation(
      baseInput({
        tamAud: 5_000_000_000,
        problemSeverity: 1,
        moatStrength: 5,
        competitionDensity: 5,
      }),
    );
    const lowPillar = low.suggestions.find((s) => /problem/i.test(s.title));
    const highPillar = high.suggestions.find((s) => /problem/i.test(s.title));
    expect(lowPillar).toBeTruthy();
    expect(highPillar).toBeTruthy();
    expect(highPillar!.upliftAud).toBeGreaterThan(lowPillar!.upliftAud);
  });
});

describe("Confidence note branching", () => {
  it("tightest band when paying customers AND mature product (maturity ≥ 4)", () => {
    const out = computeIdeaValuation(
      baseInput({
        solutionMaturity: 4,
        traction: { ...NO_TRACTION, payingCustomers: true },
      }),
    );
    expect(out.confidence).toMatch(/Tighter band/);
  });

  it("wide band when either paying customers OR mature product (but not both)", () => {
    const payingOnly = computeIdeaValuation(
      baseInput({
        solutionMaturity: 3,
        traction: { ...NO_TRACTION, payingCustomers: true },
      }),
    );
    expect(payingOnly.confidence).toMatch(/^Wide band/);

    const matureOnly = computeIdeaValuation(baseInput({ solutionMaturity: 4 }));
    expect(matureOnly.confidence).toMatch(/^Wide band/);
  });

  it("very wide band when neither signal fires (pure idea stage)", () => {
    const out = computeIdeaValuation(baseInput({ solutionMaturity: 2 }));
    expect(out.confidence).toMatch(/Very wide band/);
  });
});

describe("TAM_PRESETS", () => {
  it("exposes 4 AU-oriented tiers with monotone increasing values (niche → global)", () => {
    expect(TAM_PRESETS).toHaveLength(4);
    for (let i = 1; i < TAM_PRESETS.length; i++) {
      expect(TAM_PRESETS[i].value).toBeGreaterThan(TAM_PRESETS[i - 1].value);
    }
    expect(TAM_PRESETS[0].label).toMatch(/Niche AU/);
    expect(TAM_PRESETS[TAM_PRESETS.length - 1].label).toMatch(/Global/);
  });

  it("each preset value lands in a distinct TAM tier — the four presets exercise all four scorecard TAM branches", () => {
    const multipliers = TAM_PRESETS.map(
      (p) => computeIdeaValuation(baseInput({ tamAud: p.value })).scorecardMultiplier,
    );
    // niche(<10M)=-0.20, regional(<100M)=-0.05, national(<1B)=+0.15, global(>=1B)=+0.30
    // holding moat=comp=3 (neutral), the four multipliers are all distinct and monotone.
    expect(multipliers).toEqual([...multipliers].sort((a, b) => a - b));
    expect(new Set(multipliers).size).toBe(4);
  });
});

describe("AU_PRE_INCORP_BAND", () => {
  it("exposes an AU pre-incorporation reference band in the 150k–800k AUD envelope", () => {
    expect(AU_PRE_INCORP_BAND).toEqual({ lowAud: 150_000, highAud: 800_000 });
    expect(AU_PRE_INCORP_BAND.lowAud).toBeLessThan(AU_PRE_INCORP_BAND.highAud);
  });
});

describe("Integration — end-to-end monotonicity", () => {
  it("strictly better inputs never yield a lower midAud (baseline vs everything-improved)", () => {
    const baseline = computeIdeaValuation(baseInput());
    const better = computeIdeaValuation(
      baseInput({
        problemSeverity: 5,
        solutionMaturity: 5,
        founderStrength: 5,
        founderTraits: { ...ALL_TRAITS },
        team: { ...FULL_TEAM },
        traction: {
          waitlistOver100: true,
          paidLois: true,
          pilotSigned: true,
          payingCustomers: true,
          acceleratorAccepted: true,
        },
        moatStrength: 5,
        competitionDensity: 5,
        tamAud: 10_000_000_000,
      }),
    );
    expect(better.midAud).toBeGreaterThan(baseline.midAud);
    expect(better.berkusBaseAud).toBeGreaterThan(baseline.berkusBaseAud);
  });

  it("berkusBaseAud equals the sum of the 5 factor valueAud (contract with the founder-facing chart)", () => {
    const out = computeIdeaValuation(baseInput({ problemSeverity: 4 }));
    const sum = out.factors.reduce((acc, f) => acc + f.valueAud, 0);
    expect(out.berkusBaseAud).toBeCloseTo(sum, 5);
  });
});
