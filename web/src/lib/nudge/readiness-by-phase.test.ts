// Unit tests for the per-phase readiness helper (P5a).
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md
//   §P5_investor_readiness_score exit criterion (readiness_by_phase).

import { describe, expect, it } from "vitest";
import {
  computeReadinessByPhase,
  PHASE_CRITERION_SUBSET,
  type ReadinessBand,
} from "./readiness-by-phase";
import { ALL_PHASE_KEYS } from "@/lib/journey-map";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";

describe("readiness-by-phase (P5a)", () => {
  it("returns one entry per PhaseKey (1..12)", () => {
    const out = computeReadinessByPhase({
      sviScores: [],
      dataroomRows: [],
    });
    for (const phase of ALL_PHASE_KEYS) {
      const entry = out[phase];
      expect(entry).toBeDefined();
      expect(entry.criteria_used.length).toBeGreaterThan(0);
      expect(entry.score).toBe(0);
      expect(entry.band).toBe<ReadinessBand>("not-ready");
    }
  });

  it("only references known CriterionKey values in every phase subset", () => {
    const known = new Set<string>(CRITERION_KEYS);
    for (const phase of ALL_PHASE_KEYS) {
      for (const key of PHASE_CRITERION_SUBSET[phase]) {
        expect(known.has(key)).toBe(true);
      }
    }
  });

  it("weighted-averages SVI scores across the phase's criterion subset", () => {
    // Phase 3 subset: market (weight 12), customer_size (10), gtm_strategy (8)
    // Feed scores 90 / 60 / 30 → weighted = (12*90 + 10*60 + 8*30) / 30 = 64
    const out = computeReadinessByPhase({
      sviScores: [
        { criterion_key: "market", score: 90 },
        { criterion_key: "customer_size", score: 60 },
        { criterion_key: "gtm_strategy", score: 30 },
      ],
      dataroomRows: [],
    });
    expect(out[3].score).toBe(64);
    expect(out[3].band).toBe<ReadinessBand>("warming-up");
  });

  it("bands: >=75 investor-ready, >=50 warming-up, else not-ready", () => {
    // All 13 criteria scored at 80 → every phase reads investor-ready.
    const highScores = CRITERION_KEYS.map((k) => ({
      criterion_key: k,
      score: 80,
    }));
    const readyOut = computeReadinessByPhase({
      sviScores: highScores,
      dataroomRows: [],
    });
    for (const phase of ALL_PHASE_KEYS) {
      expect(readyOut[phase].band).toBe<ReadinessBand>("investor-ready");
    }

    // All 13 at 55 → warming-up.
    const mid = CRITERION_KEYS.map((k) => ({ criterion_key: k, score: 55 }));
    const midOut = computeReadinessByPhase({
      sviScores: mid,
      dataroomRows: [],
    });
    for (const phase of ALL_PHASE_KEYS) {
      expect(midOut[phase].band).toBe<ReadinessBand>("warming-up");
    }
  });

  it("accepts dimension key as fallback and normalises 0..1 scores", () => {
    // Phase 4 subset: code_git, website, roadmap — all fed via `dimension`.
    const out = computeReadinessByPhase({
      sviScores: [
        { dimension: "code_git", score: 0.8 }, // → 80
        { dimension: "website", score: 0.8 },
        { dimension: "roadmap", score: 0.8 },
      ],
      dataroomRows: [],
    });
    expect(out[4].score).toBe(80);
    expect(out[4].band).toBe<ReadinessBand>("investor-ready");
  });

  it("scopes missing_top3 to items on or before the phase, raise-blockers first", () => {
    const out = computeReadinessByPhase({
      sviScores: [],
      dataroomRows: [],
    });
    // Phase 1 only surfaces phase-1 items — never phase-2+.
    for (const item of out[1].missing_top3) {
      expect(Number.parseInt(item.phase_slug, 10)).toBeLessThanOrEqual(1);
    }
    // Any list with raise_blocker=true items should have those first.
    const withBlocker = out[9].missing_top3;
    if (withBlocker.length >= 2 && withBlocker.some((m) => m.raise_blocker)) {
      const firstNonBlocker = withBlocker.findIndex((m) => !m.raise_blocker);
      const lastBlocker = withBlocker
        .map((m, i) => (m.raise_blocker ? i : -1))
        .reduce((a, b) => Math.max(a, b), -1);
      if (firstNonBlocker !== -1 && lastBlocker !== -1) {
        expect(lastBlocker).toBeLessThan(firstNonBlocker);
      }
    }
  });

  it("filters out present dataroom rows from missing_top3", () => {
    const baseline = computeReadinessByPhase({
      sviScores: [],
      dataroomRows: [],
    });
    const first = baseline[1].missing_top3[0];
    if (!first) return;
    const withPresent = computeReadinessByPhase({
      sviScores: [],
      dataroomRows: [
        {
          svi_dimension: first.category,
          file_name: first.title,
          status: "present",
        },
      ],
    });
    const stillMissing = withPresent[1].missing_top3.some(
      (m) => m.category === first.category && m.title === first.title,
    );
    expect(stillMissing).toBe(false);
  });

  it("ignores non-finite scores and clamps 0..100", () => {
    // Phase 12 subset: revenue, documents, team_structure, dataroom.
    const out = computeReadinessByPhase({
      sviScores: [
        { criterion_key: "revenue", score: Number.NaN },
        { criterion_key: "documents", score: 250 }, // clamps to 100
        { criterion_key: "team_structure", score: -50 }, // clamps to 0
        { criterion_key: "dataroom", score: 50 },
      ],
      dataroomRows: [],
    });
    const s = out[12].score;
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});
