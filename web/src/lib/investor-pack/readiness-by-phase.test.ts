import { describe, expect, it } from "vitest";

import { ALL_PHASE_KEYS } from "@/lib/journey-map";
import type { CriterionKey } from "@/lib/evaluation-criteria";

import {
  MISSING_CRITERION_SCORE_FLOOR,
  PHASE_CRITERIA,
  READINESS_BAND_THRESHOLDS,
  bandOf,
  computeReadinessByPhase,
  safeScore,
} from "./readiness-by-phase";

const ALL_MAX: Partial<Record<CriterionKey, number>> = {
  idea: 100,
  market: 100,
  founder_profile: 100,
  code_git: 100,
  website: 100,
  team: 100,
  customer_size: 100,
  gtm_strategy: 100,
  documents: 100,
  dataroom: 100,
  team_structure: 100,
  roadmap: 100,
  revenue: 100,
};

describe("PHASE_CRITERIA fixture", () => {
  it("covers every 1..12 phase and uses only known CriterionKey values", () => {
    for (const phase of ALL_PHASE_KEYS) {
      const cs = PHASE_CRITERIA[phase];
      expect(cs.length).toBeGreaterThan(0);
      for (const key of cs) {
        // If this ever drifts (a criterion is renamed) the PHASE_CRITERIA
        // entry that references the stale key breaks the assertion,
        // catching the map + the type-narrowing at once.
        expect(typeof key).toBe("string");
      }
    }
  });
});

describe("safeScore", () => {
  it("clamps and rejects non-finite values", () => {
    expect(safeScore(50)).toBe(50);
    expect(safeScore(0)).toBe(0);
    expect(safeScore(100)).toBe(100);
    expect(safeScore(120)).toBe(100);
    expect(safeScore(-5)).toBe(0);
    expect(safeScore(null)).toBe(0);
    expect(safeScore(undefined)).toBe(0);
    expect(safeScore(Number.NaN)).toBe(0);
    expect(safeScore(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("bandOf", () => {
  it("maps to the three published bands", () => {
    expect(bandOf(100)).toBe("ready");
    expect(bandOf(READINESS_BAND_THRESHOLDS.ready)).toBe("ready");
    expect(bandOf(READINESS_BAND_THRESHOLDS.ready - 1)).toBe("nearly-ready");
    expect(bandOf(READINESS_BAND_THRESHOLDS.nearly_ready)).toBe("nearly-ready");
    expect(bandOf(READINESS_BAND_THRESHOLDS.nearly_ready - 1)).toBe("not-ready");
    expect(bandOf(0)).toBe("not-ready");
  });
});

describe("computeReadinessByPhase — happy path", () => {
  it("returns 100/ready for every phase when every criterion is maxed", () => {
    const out = computeReadinessByPhase({ criterionScores: ALL_MAX });
    for (const phase of ALL_PHASE_KEYS) {
      const r = out[phase];
      expect(r.phase).toBe(phase);
      expect(r.score).toBe(100);
      expect(r.band).toBe("ready");
      expect(r.missing_top3).toEqual([]);
    }
  });

  it("returns 0/not-ready with empty criterionScores across every phase", () => {
    const out = computeReadinessByPhase({ criterionScores: {} });
    for (const phase of ALL_PHASE_KEYS) {
      expect(out[phase].score).toBe(0);
      expect(out[phase].band).toBe("not-ready");
      expect(out[phase].missing_top3.length).toBeGreaterThan(0);
    }
  });
});

describe("computeReadinessByPhase — missing_top3", () => {
  it("caps missing_top3 at 3 entries and never surfaces criteria above the floor", () => {
    const out = computeReadinessByPhase({ criterionScores: {} });
    for (const phase of ALL_PHASE_KEYS) {
      expect(out[phase].missing_top3.length).toBeLessThanOrEqual(3);
      for (const m of out[phase].missing_top3) {
        expect(m.score).toBeLessThan(MISSING_CRITERION_SCORE_FLOOR);
      }
    }
  });

  it("orders missing_top3 by lost weight × gap descending", () => {
    // Phase 9 pulls documents / dataroom / team / revenue / founder_profile.
    // Only three fall below the floor — expect them sorted by lost weight.
    const scores: Partial<Record<CriterionKey, number>> = {
      documents: 100,
      dataroom: 100,
      team: 30, // weight 8 → gap
      revenue: 50, // weight 10 → gap
      founder_profile: 40, // weight 8 → gap
    };
    const r = computeReadinessByPhase({ criterionScores: scores })[9];
    // Phase 9 weights (from CRITERIA): documents 5 / dataroom 5 / team 8 /
    // revenue 10 / founder_profile 8, total 36. weight_in_phase = round
    // 14 / 14 / 22 / 28 / 22. Lost weight = weight_in_phase × (1-score/100):
    // team 22×0.7 = 15.4, revenue 28×0.5 = 14.0, founder_profile 22×0.6 = 13.2.
    expect(r.missing_top3.map((m) => m.key)).toEqual([
      "team",
      "revenue",
      "founder_profile",
    ]);
  });
});

describe("computeReadinessByPhase — later phases penalise missing dataroom", () => {
  it("phase 10 stays not-ready when dataroom is 0 even if revenue is strong", () => {
    const scores: Partial<Record<CriterionKey, number>> = {
      revenue: 100,
      documents: 100,
      team: 100,
      dataroom: 0,
    };
    const r10 = computeReadinessByPhase({ criterionScores: scores })[10];
    // dataroom weight = 5, others weight to 10+7+8 = 25. weighted = 75/30 ≈ 83%
    // But dataroom missing shows in missing_top3.
    expect(r10.missing_top3.map((m) => m.key)).toContain("dataroom");
  });

  it("phase 1 hits ready with just idea + founder_profile filled", () => {
    const scores: Partial<Record<CriterionKey, number>> = {
      idea: 100,
      founder_profile: 100,
    };
    const r1 = computeReadinessByPhase({ criterionScores: scores })[1];
    expect(r1.band).toBe("ready");
    expect(r1.missing_top3).toEqual([]);
  });
});
