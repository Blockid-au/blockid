import { describe, it, expect } from "vitest";
import {
  scoreFundingReadiness,
  type FundingReadinessInput,
} from "./cro-funding-readiness";

const investorReadySeed: FundingReadinessInput = {
  stage: "seed",
  mrrAud: 20_000,
  users: 1200,
  monthlyGrowthPct: 15,
  teamSignal: 80,
  hasTechnicalFounder: true,
  hasFounderVesting: true,
  hasShareholdersAgreement: true,
  esopPoolPct: 12,
  dataRoomPct: 90,
  hasPitchDeck: true,
  hasFinancialModel: true,
  hasUseOfFunds: true,
  hasWarmIntros: true,
};

const earlyPreSeed: FundingReadinessInput = {
  stage: "pre-seed",
  mrrAud: 0,
  users: 5,
  monthlyGrowthPct: 0,
  teamSignal: 30,
  hasTechnicalFounder: false,
  hasFounderVesting: false,
  hasShareholdersAgreement: false,
  esopPoolPct: 0,
  dataRoomPct: 10,
  hasPitchDeck: false,
  hasFinancialModel: false,
  hasUseOfFunds: false,
  hasWarmIntros: false,
};

describe("cro-funding-readiness — CAPITAL scoring", () => {
  it("returns a 0–100 overall score, verdict, and six pillars", () => {
    const r = scoreFundingReadiness(investorReadySeed);
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.overall).toBeLessThanOrEqual(100);
    expect(["investor-ready", "near-ready", "warming-up", "not-ready"]).toContain(r.verdict);
    expect(r.pillars).toHaveLength(6);
  });

  it("rates a well-prepared seed startup as investor-ready or near-ready", () => {
    const r = scoreFundingReadiness(investorReadySeed);
    expect(r.overall).toBeGreaterThanOrEqual(65);
    expect(["investor-ready", "near-ready"]).toContain(r.verdict);
  });

  it("rates an empty pre-seed founder as not-ready and surfaces actions", () => {
    const r = scoreFundingReadiness(earlyPreSeed);
    expect(r.verdict).toBe("not-ready");
    expect(r.overall).toBeLessThan(45);
    expect(r.actions.length).toBeGreaterThan(0);
    // Highest-priority actions surface first
    expect(r.actions[0].priority).toBe(1);
  });

  it("weights traction higher at Series A than at pre-seed", () => {
    const sa = scoreFundingReadiness({ ...investorReadySeed, stage: "series-a" });
    const ps = scoreFundingReadiness({ ...earlyPreSeed, stage: "pre-seed" });
    const saTraction = sa.pillars.find((p) => p.key === "traction")!;
    const psTeam = ps.pillars.find((p) => p.key === "team")!;
    expect(saTraction.weight).toBeGreaterThan(0.3);
    expect(psTeam.weight).toBeGreaterThan(0.25);
  });

  it("penalises stage-fit when ARR is well below the stage minimum", () => {
    const r = scoreFundingReadiness({
      ...investorReadySeed,
      stage: "series-a",
      mrrAud: 5_000, // A$60k ARR — way below A$600k Series A floor
    });
    const sf = r.pillars.find((p) => p.key === "stage_fit")!;
    expect(sf.score).toBeLessThan(60);
  });

  it("identifies the three weakest pillars as topGaps", () => {
    const r = scoreFundingReadiness(earlyPreSeed);
    expect(r.topGaps).toHaveLength(3);
    // topGaps should be sorted ascending by score
    expect(r.topGaps[0].score).toBeLessThanOrEqual(r.topGaps[1].score);
    expect(r.topGaps[1].score).toBeLessThanOrEqual(r.topGaps[2].score);
  });

  it("caps every pillar score in [0,100]", () => {
    const r = scoreFundingReadiness({
      ...investorReadySeed,
      mrrAud: 10_000_000, // intentionally huge
      users: 10_000_000,
      monthlyGrowthPct: 500,
      teamSignal: 9999,
    });
    for (const p of r.pillars) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
    }
    expect(r.overall).toBeLessThanOrEqual(100);
  });

  it("each stage's pillar weights sum to ~1.0", () => {
    for (const stage of ["pre-seed", "seed", "series-a", "series-b"] as const) {
      const r = scoreFundingReadiness({ ...earlyPreSeed, stage });
      const sum = r.pillars.reduce((s, p) => s + p.weight, 0);
      expect(sum).toBeGreaterThan(0.99);
      expect(sum).toBeLessThan(1.01);
    }
  });
});
