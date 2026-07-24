// Unit tests for the pure helpers behind <InvestorReadinessTile /> (P5).
//
// The tile itself is "use client" (uses React hooks + fetch) so we cover
// its wiring with the sibling Playwright spec in
// web/tests/e2e/founder/investor-readiness-tile.spec.ts. Everything
// deterministic — bands, colours, weakest-picker — lives here.

import { describe, expect, it } from "vitest";
import {
  bandOf,
  colourFor,
  pickWeakest,
  safeScore,
  SUB_SCORE_ORDER,
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
