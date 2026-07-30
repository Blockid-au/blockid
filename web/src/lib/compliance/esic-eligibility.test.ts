// Colocated vitest for the pure ESIC Div 360 self-assessment helper.
//
// Backs the ESIC self-assessment worksheet template, the funding gate, and
// the marketing gate — each of which asserts branch behaviour transitively.
// This suite pins the *direct* branch matrix of assessESIC / scoreEsic100Point /
// passesPrinciplesTest so downstream gates can trust the shape.
//
// Statutory anchors exercised: ITAA97 Div 360 (s 360-40 early-stage limbs,
// s 360-45 100-point innovation test with A$50k third-party-capital gate,
// R&D tiered scoring, trademarks-score-zero rule, s 360-40(1)(f) principles
// alt path). Contract: docs/plans/atlassian-standard-mapping-goal.md §P6.

import { describe, it, expect } from "vitest";

import {
  ESIC_DISCLAIMER,
  assessESIC,
  passesPrinciplesTest,
  scoreEsic100Point,
  type ESIC100PointInput,
  type ESICInput,
  type ESICPrinciplesInput,
} from "./esic-eligibility";

const NOW = new Date("2026-07-30T00:00:00Z");

function baseInput(overrides: Partial<ESICInput> = {}): ESICInput {
  return {
    company_incorporated_year: 2024,
    company_incorporated_month: 1,
    turnover_prior_year_aud: 50_000,
    total_expenses_prior_year_aud: 200_000,
    is_listed: false,
    has_r_and_d_expenditure: false,
    ...overrides,
  };
}

function emptyPoints(overrides: Partial<ESIC100PointInput> = {}): ESIC100PointInput {
  return {
    australian_patent: false,
    innovation_patent: false,
    plant_breeder_rights: false,
    trademarks: false,
    accelerator_alumni: false,
    ...overrides,
  };
}

function truePrinciples(): ESICPrinciplesInput {
  return {
    is_genuinely_focused_on_developing_new_or_improved: true,
    high_growth_potential: true,
    can_scale_broader_than_local_market: true,
    has_competitive_advantage: true,
    can_demonstrate_broader_than_local_market: true,
  };
}

describe("scoreEsic100Point — s 360-45 objective test", () => {
  it("awards 50 points for an Australian standard patent", () => {
    const scored = scoreEsic100Point(emptyPoints({ australian_patent: true }));
    expect(scored.points).toBe(50);
    expect(scored.breakdown).toEqual([
      { item: "Australian standard patent", points: 50 },
    ]);
  });

  it("stacks patent + innovation patent + plant breeder + licensing = 125", () => {
    const scored = scoreEsic100Point(
      emptyPoints({
        australian_patent: true,
        innovation_patent: true,
        plant_breeder_rights: true,
        licensed_technology_from_university: true,
      }),
    );
    expect(scored.points).toBe(50 + 25 + 25 + 25);
    expect(scored.breakdown).toHaveLength(4);
  });

  it("flags trademarks as scoring 0 and hints at patent uplift", () => {
    const scored = scoreEsic100Point(emptyPoints({ trademarks: true }));
    expect(scored.points).toBe(0);
    expect(scored.notes.join(" ")).toMatch(/Trademarks are NOT eligible/);
    expect(scored.notes.join(" ")).toMatch(/s 360-45/);
  });

  it("A$50k threshold: exactly A$50k passes; A$49,999 falls to a note", () => {
    const at = scoreEsic100Point(
      emptyPoints({ third_party_capital_raised_aud: 50_000 }),
    );
    expect(at.points).toBe(50);
    const below = scoreEsic100Point(
      emptyPoints({ third_party_capital_raised_aud: 49_999 }),
    );
    expect(below.points).toBe(0);
    expect(below.notes.join(" ")).toMatch(/A\$50k/);
  });

  it("zero third-party capital emits no note (no field means unanswered)", () => {
    const zero = scoreEsic100Point(
      emptyPoints({ third_party_capital_raised_aud: 0 }),
    );
    expect(zero.points).toBe(0);
    expect(zero.notes).toEqual([]);
  });

  it("R&D >50% scores 75; 15–50% scores 50; <15% scores 0 with a note", () => {
    expect(
      scoreEsic100Point(emptyPoints({ r_and_d_expenditure_pct: 60 })).points,
    ).toBe(75);
    expect(
      scoreEsic100Point(emptyPoints({ r_and_d_expenditure_pct: 50 })).points,
    ).toBe(50);
    expect(
      scoreEsic100Point(emptyPoints({ r_and_d_expenditure_pct: 15 })).points,
    ).toBe(50);
    const low = scoreEsic100Point(
      emptyPoints({ r_and_d_expenditure_pct: 10 }),
    );
    expect(low.points).toBe(0);
    expect(low.notes.join(" ")).toMatch(/15%/);
  });

  it("accelerator alumnus awards 50 points (s 360-45(1)(e))", () => {
    const scored = scoreEsic100Point(emptyPoints({ accelerator_alumni: true }));
    expect(scored.points).toBe(50);
    expect(scored.breakdown[0]?.item).toMatch(/accelerator/i);
  });
});

describe("passesPrinciplesTest — s 360-40(1)(f) alt path", () => {
  it("passes only when all five sub-tests are true", () => {
    expect(passesPrinciplesTest(truePrinciples())).toBe(true);
  });

  it("any single false flips the result", () => {
    const p = truePrinciples();
    p.high_growth_potential = false;
    expect(passesPrinciplesTest(p)).toBe(false);
  });

  it("all false → false", () => {
    expect(
      passesPrinciplesTest({
        is_genuinely_focused_on_developing_new_or_improved: false,
        high_growth_potential: false,
        can_scale_broader_than_local_market: false,
        has_competitive_advantage: false,
        can_demonstrate_broader_than_local_market: false,
      }),
    ).toBe(false);
  });
});

describe("assessESIC — Limb 1 early-stage gates", () => {
  it("standard company: 3-year age cap is enforced (4y old fails)", () => {
    const result = assessESIC(
      baseInput({ company_incorporated_year: 2021, company_incorporated_month: 1 }),
      NOW,
    );
    expect(result.eligible_early_stage).toBe(false);
    expect(result.gaps.join(" ")).toMatch(/3-year Div 360 early-stage cap/);
  });

  it("R&D-heavy company gets the 6-year cap", () => {
    const result = assessESIC(
      baseInput({
        company_incorporated_year: 2021,
        company_incorporated_month: 1,
        has_r_and_d_expenditure: true,
      }),
      NOW,
    );
    expect(result.eligible_early_stage).toBe(true);
  });

  it("turnover >A$200k blocks Limb 1", () => {
    const result = assessESIC(
      baseInput({ turnover_prior_year_aud: 200_001 }),
      NOW,
    );
    expect(result.eligible_early_stage).toBe(false);
    expect(result.gaps.some((g) => /A\$200,000 cap/.test(g))).toBe(true);
  });

  it("expenses >A$1M blocks Limb 1", () => {
    const result = assessESIC(
      baseInput({ total_expenses_prior_year_aud: 1_000_001 }),
      NOW,
    );
    expect(result.eligible_early_stage).toBe(false);
    expect(result.gaps.some((g) => /A\$1,000,000 cap/.test(g))).toBe(true);
  });

  it("listed company blocks Limb 1 with an explicit gap", () => {
    const result = assessESIC(baseInput({ is_listed: true }), NOW);
    expect(result.eligible_early_stage).toBe(false);
    expect(result.gaps.some((g) => /Listed/.test(g))).toBe(true);
  });
});

describe("assessESIC — Limb 2 innovation gates", () => {
  it("100-point pass alone certifies is_esic = true", () => {
    const result = assessESIC(
      baseInput({
        points_100_test: emptyPoints({
          australian_patent: true,
          accelerator_alumni: true,
        }),
      }),
      NOW,
    );
    expect(result.eligible_innovation_100pt).toBe(100);
    expect(result.is_esic).toBe(true);
  });

  it("principles pass alone certifies is_esic = true", () => {
    const result = assessESIC(
      baseInput({ principles_test: truePrinciples() }),
      NOW,
    );
    expect(result.eligible_innovation_principles).toBe(true);
    expect(result.is_esic).toBe(true);
  });

  it("no Limb 2 input at all leaves is_esic=false + prompts self-check", () => {
    const result = assessESIC(baseInput(), NOW);
    expect(result.is_esic).toBe(false);
    expect(result.eligible_innovation_100pt).toBe(0);
    expect(result.eligible_innovation_principles).toBe(false);
    expect(result.recommendations.join(" ")).toMatch(/100-point self-check/);
    expect(result.gaps.some((g) => /Innovation test not met/.test(g))).toBe(true);
  });

  it("100-point shortfall lists the delta plus concrete uplift hints", () => {
    const result = assessESIC(
      baseInput({
        points_100_test: emptyPoints({ innovation_patent: true }), // 25
      }),
      NOW,
    );
    expect(result.eligible_innovation_100pt).toBe(25);
    expect(result.is_esic).toBe(false);
    const recs = result.recommendations.join(" ");
    expect(recs).toMatch(/100-point test: 25 pts/);
    expect(recs).toMatch(/need 75 more/);
    expect(recs).toMatch(/standard patent/);
  });

  it("failed principles test lists the failed sub-tests verbatim", () => {
    const partial = truePrinciples();
    partial.high_growth_potential = false;
    partial.has_competitive_advantage = false;
    const result = assessESIC(
      baseInput({ principles_test: partial }),
      NOW,
    );
    expect(result.is_esic).toBe(false);
    const recs = result.recommendations.join(" ");
    expect(recs).toMatch(/high growth potential/);
    expect(recs).toMatch(/competitive advantage/);
  });
});

describe("assessESIC — combined behaviour", () => {
  it("Limb 1 pass + 100-point pass → full ESIC", () => {
    const result = assessESIC(
      baseInput({
        points_100_test: emptyPoints({
          australian_patent: true,
          third_party_capital_raised_aud: 100_000,
        }),
      }),
      NOW,
    );
    expect(result.is_esic).toBe(true);
    expect(result.gaps).toEqual([]);
  });

  it("Limb 1 fail + Limb 2 pass still fails (both limbs required)", () => {
    const result = assessESIC(
      baseInput({
        is_listed: true,
        principles_test: truePrinciples(),
      }),
      NOW,
    );
    expect(result.is_esic).toBe(false);
    expect(result.eligible_innovation_principles).toBe(true);
    expect(result.eligible_early_stage).toBe(false);
  });

  it("disclaimer round-trips on every result", () => {
    const result = assessESIC(baseInput(), NOW);
    expect(result.disclaimer).toBe(ESIC_DISCLAIMER);
    expect(result.disclaimer).toMatch(/Div 360 ITAA97/);
    expect(result.disclaimer).toMatch(/tax agent/);
  });
});
