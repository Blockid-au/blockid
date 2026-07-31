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
import { GROWTH_PHASE_IDS } from "@/lib/growth/phase-taxonomy";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";

describe("readiness-by-phase (P5a)", () => {
  it("returns one entry per GrowthPhaseId (vision..funding)", () => {
    const out = computeReadinessByPhase({
      sviScores: [],
      dataroomRows: [],
    });
    for (const phase of GROWTH_PHASE_IDS) {
      const entry = out[phase];
      expect(entry).toBeDefined();
      expect(entry.criteria_used.length).toBeGreaterThan(0);
      expect(entry.score).toBe(0);
      expect(entry.band).toBe<ReadinessBand>("not-ready");
    }
  });

  it("only references known CriterionKey values in every phase subset", () => {
    const known = new Set<string>(CRITERION_KEYS);
    for (const phase of GROWTH_PHASE_IDS) {
      for (const key of PHASE_CRITERION_SUBSET[phase]) {
        expect(known.has(key)).toBe(true);
      }
    }
  });

  it("weighted-averages SVI scores across the phase's criterion subset", () => {
    // `revenue_model` subset: revenue (weight 10), gtm_strategy (8), market (12)
    // Feed 90 / 60 / 30 → (10*90 + 8*60 + 12*30) / 30 = 58
    const out = computeReadinessByPhase({
      sviScores: [
        { criterion_key: "revenue", score: 90 },
        { criterion_key: "gtm_strategy", score: 60 },
        { criterion_key: "market", score: 30 },
      ],
      dataroomRows: [],
    });
    expect(out.revenue_model.score).toBe(58);
    expect(out.revenue_model.band).toBe<ReadinessBand>("warming-up");
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
    for (const phase of GROWTH_PHASE_IDS) {
      expect(readyOut[phase].band).toBe<ReadinessBand>("investor-ready");
    }

    // All 13 at 55 → warming-up.
    const mid = CRITERION_KEYS.map((k) => ({ criterion_key: k, score: 55 }));
    const midOut = computeReadinessByPhase({
      sviScores: mid,
      dataroomRows: [],
    });
    for (const phase of GROWTH_PHASE_IDS) {
      expect(midOut[phase].band).toBe<ReadinessBand>("warming-up");
    }
  });

  it("accepts dimension key as fallback and normalises 0..1 scores", () => {
    // `product_dev` subset: code_git, website, roadmap — all fed via `dimension`.
    const out = computeReadinessByPhase({
      sviScores: [
        { dimension: "code_git", score: 0.8 }, // → 80
        { dimension: "website", score: 0.8 },
        { dimension: "roadmap", score: 0.8 },
      ],
      dataroomRows: [],
    });
    expect(out.product_dev.score).toBe(80);
    expect(out.product_dev.band).toBe<ReadinessBand>("investor-ready");
  });

  it("scopes missing_top3 to items on or before the phase, raise-blockers first", () => {
    const out = computeReadinessByPhase({
      sviScores: [],
      dataroomRows: [],
    });
    // `vision` only surfaces phase-1 template items — never phase-2+.
    for (const item of out.vision.missing_top3) {
      expect(Number.parseInt(item.phase_slug, 10)).toBeLessThanOrEqual(1);
    }
    // Any list with raise_blocker=true items should have those first.
    const withBlocker = out.investor_review.missing_top3;
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
    const first = baseline.vision.missing_top3[0];
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
    const stillMissing = withPresent.vision.missing_top3.some(
      (m) => m.category === first.category && m.title === first.title,
    );
    expect(stillMissing).toBe(false);
  });

  it("ignores non-finite scores and clamps 0..100", () => {
    // `funding` subset: revenue, documents, dataroom, team_structure.
    const out = computeReadinessByPhase({
      sviScores: [
        { criterion_key: "revenue", score: Number.NaN },
        { criterion_key: "documents", score: 250 }, // clamps to 100
        { criterion_key: "team_structure", score: -50 }, // clamps to 0
        { criterion_key: "dataroom", score: 50 },
      ],
      dataroomRows: [],
    });
    const s = out.funding.score;
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});
