// Unit tests for the pure helpers behind <InvestorReadinessTile /> (P5).
//
// The tile itself is "use client" (uses React hooks + fetch) so we cover
// its wiring with the sibling Playwright spec in
// web/tests/e2e/founder/investor-readiness-tile.spec.ts. Everything
// deterministic — bands, colours, weakest-picker — lives here.

import { describe, expect, it } from "vitest";
import {
  ALL_PHASE_SLUGS,
  bandOf,
  buildPhaseSeries,
  colourFor,
  PHASE_BAND_CLASS,
  pickPhaseEntry,
  pickWeakest,
  safeScore,
  SUB_SCORE_ORDER,
  type PhaseReadinessLike,
  type SubScoreKey,
} from "./investor-readiness-tile.helpers";

describe("investor-readiness-tile helpers", () => {
  describe("bandOf", () => {
    it("labels 75+ as investor-ready", () => {
      expect(bandOf(75).label).toBe("investor-ready");
      expect(bandOf(90).label).toBe("investor-ready");
      expect(bandOf(100).label).toBe("investor-ready");
    });
    it("labels 50-74 as warming up", () => {
      expect(bandOf(50).label).toBe("warming up");
      expect(bandOf(60).label).toBe("warming up");
      expect(bandOf(74).label).toBe("warming up");
    });
    it("labels < 50 as not ready", () => {
      expect(bandOf(0).label).toBe("not ready");
      expect(bandOf(49).label).toBe("not ready");
    });
    it("returns a non-empty klass for every band", () => {
      for (const s of [10, 55, 88]) {
        expect(bandOf(s).klass.length).toBeGreaterThan(0);
      }
    });
  });

  describe("colourFor", () => {
    it("emits the green / amber / red palette used by the bars", () => {
      expect(colourFor(80)).toBe("#22c55e");
      expect(colourFor(50)).toBe("#eab308");
      expect(colourFor(40)).toBe("#ef4444");
    });
  });

  describe("safeScore", () => {
    it("clamps to 0..100 and rounds", () => {
      expect(safeScore(-10)).toBe(0);
      expect(safeScore(101)).toBe(100);
      expect(safeScore(42.7)).toBe(43);
    });
    it("coerces non-finite / non-numeric to 0", () => {
      expect(safeScore(Number.NaN)).toBe(0);
      expect(safeScore(Number.POSITIVE_INFINITY)).toBe(0);
      expect(safeScore("47" as unknown)).toBe(0);
      expect(safeScore(undefined)).toBe(0);
    });
  });

  describe("pickWeakest", () => {
    it("returns the lowest-scored sub-score", () => {
      const w = pickWeakest({
        market: 80,
        team: 30,
        tech: 60,
        financial: 40,
        compliance: 70,
      });
      expect(w).toBe("team");
    });
    it("breaks ties by SUB_SCORE_ORDER (earliest wins)", () => {
      const w = pickWeakest({
        market: 50,
        team: 50,
        tech: 50,
        financial: 50,
        compliance: 50,
      });
      expect(w).toBe(SUB_SCORE_ORDER[0]); // "market"
    });
    it("ignores missing keys and picks lowest present", () => {
      const w = pickWeakest({
        market: 90,
        // team missing
        tech: 20,
      });
      expect(w).toBe("tech");
    });
    it("falls back to the first key when every value is missing", () => {
      const w = pickWeakest({} as Partial<Record<SubScoreKey, number>>);
      expect(w).toBe(SUB_SCORE_ORDER[0]);
    });
  });

  describe("SUB_SCORE_ORDER", () => {
    it("exposes the five spec dimensions in stable order", () => {
      expect(SUB_SCORE_ORDER).toEqual([
        "market",
        "team",
        "tech",
        "financial",
        "compliance",
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// P5a per-phase helpers
// ---------------------------------------------------------------------------

const SAMPLE_BY_PHASE: Record<string, PhaseReadinessLike> = {
  "1": { score: 82, band: "investor-ready" },
  "3": { score: 55, band: "warming-up" },
  "6": {
    score: 63,
    band: "warming-up",
    missing_top3: [
      {
        category: "11. Tax (AU)",
        title: "ESIC Eligibility Assessment",
        phase_slug: "6",
        why_it_matters: "raise blocker",
        raise_blocker: true,
        cta_url: "/dashboard/data-room?add=11.%20Tax%20(AU)",
      },
      {
        category: "3. Financial Projections",
        title: "Cohort Revenue Analysis",
        phase_slug: "5",
        why_it_matters: "diligence back-up",
        raise_blocker: false,
        cta_url: "/dashboard/data-room?add=3.%20Financial%20Projections",
      },
    ],
    criteria_used: ["revenue", "gtm_strategy", "dataroom"],
  },
};

describe("investor-readiness-tile phase helpers (P5a)", () => {
  describe("ALL_PHASE_SLUGS", () => {
    it("enumerates 12 phases as string ordinals in ascending order", () => {
      expect(ALL_PHASE_SLUGS).toHaveLength(12);
      expect(ALL_PHASE_SLUGS[0]).toBe("1");
      expect(ALL_PHASE_SLUGS[11]).toBe("12");
    });
  });

  describe("PHASE_BAND_CLASS", () => {
    it("assigns a non-empty class pack per band", () => {
      for (const band of ["not-ready", "warming-up", "investor-ready"] as const) {
        expect(PHASE_BAND_CLASS[band].length).toBeGreaterThan(0);
      }
    });
    it("maps investor-ready to an emerald hue and not-ready to rose", () => {
      expect(PHASE_BAND_CLASS["investor-ready"]).toContain("emerald");
      expect(PHASE_BAND_CLASS["not-ready"]).toContain("rose");
      expect(PHASE_BAND_CLASS["warming-up"]).toContain("amber");
    });
  });

  describe("pickPhaseEntry", () => {
    it("returns the entry when phase and slug are present", () => {
      const entry = pickPhaseEntry(SAMPLE_BY_PHASE, "6");
      expect(entry?.score).toBe(63);
      expect(entry?.band).toBe("warming-up");
    });
    it("returns null when the map or slug is missing", () => {
      expect(pickPhaseEntry(undefined, "6")).toBeNull();
      expect(pickPhaseEntry(SAMPLE_BY_PHASE, undefined)).toBeNull();
      expect(pickPhaseEntry(SAMPLE_BY_PHASE, "99")).toBeNull();
    });
    it("returns null when the entry has no numeric score", () => {
      const bad = {
        "6": { score: undefined as unknown as number, band: "warming-up" as const },
      };
      expect(pickPhaseEntry(bad, "6")).toBeNull();
    });
  });

  describe("buildPhaseSeries", () => {
    it("returns 12 points in phase order with the current one flagged", () => {
      const series = buildPhaseSeries(SAMPLE_BY_PHASE, "6");
      expect(series).toHaveLength(12);
      expect(series.map((p) => p.slug)).toEqual(ALL_PHASE_SLUGS);
      const current = series.find((p) => p.isCurrent);
      expect(current?.slug).toBe("6");
      expect(current?.score).toBe(63);
      expect(current?.band).toBe("warming-up");
    });
    it("fills gaps with score=0 / band=not-ready so the chart never has holes", () => {
      const series = buildPhaseSeries(SAMPLE_BY_PHASE, "6");
      const p2 = series.find((p) => p.slug === "2");
      expect(p2?.score).toBe(0);
      expect(p2?.band).toBe("not-ready");
      expect(p2?.isCurrent).toBe(false);
    });
    it("tolerates a null map + null current slug", () => {
      const series = buildPhaseSeries(null, null);
      expect(series).toHaveLength(12);
      expect(series.every((p) => p.score === 0)).toBe(true);
      expect(series.every((p) => p.isCurrent === false)).toBe(true);
    });
    it("clamps out-of-range scores via safeScore", () => {
      const overshoot: Record<string, PhaseReadinessLike> = {
        "4": { score: 250, band: "investor-ready" },
      };
      const series = buildPhaseSeries(overshoot, "4");
      const p4 = series.find((p) => p.slug === "4");
      expect(p4?.score).toBe(100);
    });
  });
});
