/**
 * SVI Completeness — Integration Smoke Tests
 *
 * Pure unit tests that exercise the three core library functions
 * from src/lib/svi-completeness.ts without hitting the DB or network.
 *
 * Day 10-11 sprint: evidence completeness backfill & integration verification.
 */

import { describe, it, expect } from "vitest";
import {
  calculateDimensionCompleteness,
  generateFixRoadmap,
  forecastRoadmapImpact,
  EVIDENCE_CATALOG,
} from "@/lib/svi-completeness";

// ─── calculateDimensionCompleteness ───────────────────────────────────────────

describe("calculateDimensionCompleteness", () => {
  it("returns 0% completeness for an empty evidence set", () => {
    for (const dim of Object.keys(EVIDENCE_CATALOG)) {
      const result = calculateDimensionCompleteness(dim, new Set());
      expect(result.completenessPercent).toBe(0);
      expect(result.totalPresent).toBe(0);
      expect(result.totalPossible).toBeGreaterThan(0);
      expect(result.missingEvidence.length).toBe(result.totalPossible);
      expect(result.presentEvidence.length).toBe(0);
    }
  });

  it("returns 100% completeness when all evidence types are present", () => {
    const dim = "ftv";
    const allCodes = new Set(EVIDENCE_CATALOG[dim].map((e) => e.code));
    const result = calculateDimensionCompleteness(dim, allCodes);
    expect(result.completenessPercent).toBe(100);
    expect(result.totalPresent).toBe(result.totalPossible);
    expect(result.missingEvidence.length).toBe(0);
  });

  it("counts partial evidence correctly for mpc dimension", () => {
    const dim = "mpc";
    const catalog = EVIDENCE_CATALOG[dim];
    // Provide the first two items only
    const partialCodes = new Set(catalog.slice(0, 2).map((e) => e.code));
    const result = calculateDimensionCompleteness(dim, partialCodes);
    expect(result.totalPresent).toBe(2);
    expect(result.totalPossible).toBe(catalog.length);
    expect(result.completenessPercent).toBe(
      Math.round((2 / catalog.length) * 100)
    );
    expect(result.missingEvidence.length).toBe(catalog.length - 2);
  });

  it("handles unknown dimension gracefully (returns 0%)", () => {
    const result = calculateDimensionCompleteness("unknown_dim", new Set());
    expect(result.completenessPercent).toBe(0);
    expect(result.totalPossible).toBe(0);
  });

  it("dimension field in result matches the input dimension string", () => {
    const result = calculateDimensionCompleteness("tre", new Set());
    expect(result.dimension).toBe("tre");
  });
});

// ─── generateFixRoadmap ───────────────────────────────────────────────────────

describe("generateFixRoadmap", () => {
  it("returns items sorted by bang-for-buck descending", () => {
    // Build completeness results for all 8 dimensions with no evidence
    const dimResults = Object.keys(EVIDENCE_CATALOG).map((dim) =>
      calculateDimensionCompleteness(dim, new Set())
    );

    const roadmap = generateFixRoadmap(dimResults);
    expect(roadmap.length).toBeGreaterThan(0);

    for (let i = 1; i < roadmap.length; i++) {
      expect(roadmap[i - 1].bangForBuck).toBeGreaterThanOrEqual(
        roadmap[i].bangForBuck
      );
    }
  });

  it("returns an empty roadmap when all dimensions are 100% complete", () => {
    const dimResults = Object.keys(EVIDENCE_CATALOG).map((dim) => {
      const allCodes = new Set(EVIDENCE_CATALOG[dim].map((e) => e.code));
      return calculateDimensionCompleteness(dim, allCodes);
    });
    const roadmap = generateFixRoadmap(dimResults);
    expect(roadmap.length).toBe(0);
  });

  it("assigns all items to weeks 1-4", () => {
    const dimResults = Object.keys(EVIDENCE_CATALOG).map((dim) =>
      calculateDimensionCompleteness(dim, new Set())
    );
    const roadmap = generateFixRoadmap(dimResults);
    for (const item of roadmap) {
      expect(item.roadmapWeek).toBeGreaterThanOrEqual(1);
      expect(item.roadmapWeek).toBeLessThanOrEqual(4);
    }
  });

  it("each roadmap item has a positive estimatedSviImpact and bangForBuck", () => {
    const dimResults = Object.keys(EVIDENCE_CATALOG).map((dim) =>
      calculateDimensionCompleteness(dim, new Set())
    );
    const roadmap = generateFixRoadmap(dimResults);
    for (const item of roadmap) {
      expect(item.estimatedSviImpact).toBeGreaterThan(0);
      expect(item.bangForBuck).toBeGreaterThan(0);
    }
  });

  it("roadmap items carry the correct dimension and urgencyTier", () => {
    const ftv = calculateDimensionCompleteness("ftv", new Set());
    const roadmap = generateFixRoadmap([ftv]);
    for (const item of roadmap) {
      expect(item.dimension).toBe("ftv");
      // FTV is critical — urgency tier 1
      expect(item.urgencyTier).toBe(1);
      expect(item.urgencyLabel).toBe("critical");
    }
  });
});

// ─── forecastRoadmapImpact ────────────────────────────────────────────────────

describe("forecastRoadmapImpact", () => {
  it("returns same currentSvi as baseline when roadmap is empty", () => {
    const forecast = forecastRoadmapImpact([], 75);
    expect(forecast.currentSvi).toBe(75);
    expect(forecast.potentialSviGain).toBe(0);
    expect(forecast.projectedSvi).toBe(75);
    expect(forecast.week1Impact).toBe(0);
    expect(forecast.week4Impact).toBe(0);
  });

  it("returns same projectedSvi as currentSvi when 0 items are completed", () => {
    const forecast = forecastRoadmapImpact([], 50, 0.0);
    expect(forecast.projectedSvi).toBe(50);
    expect(forecast.week1Impact).toBe(0);
  });

  it("projectedSvi is currentSvi + round(totalGain * completionRate)", () => {
    const dimResults = [calculateDimensionCompleteness("mpc", new Set())];
    const roadmap = generateFixRoadmap(dimResults);
    const currentSvi = 40;
    const completionRate = 0.5;
    const forecast = forecastRoadmapImpact(roadmap, currentSvi, completionRate);

    const totalGain = roadmap.reduce((s, r) => s + r.estimatedSviImpact, 0);
    const expectedGain = Math.round(totalGain * completionRate);

    expect(forecast.potentialSviGain).toBe(totalGain);
    expect(forecast.projectedSvi).toBe(currentSvi + expectedGain);
    expect(forecast.completionRateAssumption).toBe(completionRate);
  });

  it("week4Impact >= week1Impact (more work done = more impact)", () => {
    const dimResults = Object.keys(EVIDENCE_CATALOG).map((dim) =>
      calculateDimensionCompleteness(dim, new Set())
    );
    const roadmap = generateFixRoadmap(dimResults);
    const forecast = forecastRoadmapImpact(roadmap, 30, 0.6);
    expect(forecast.week4Impact).toBeGreaterThanOrEqual(forecast.week1Impact);
  });

  it("forecast with completion rate 0 produces zero gain", () => {
    const dimResults = [calculateDimensionCompleteness("tre", new Set())];
    const roadmap = generateFixRoadmap(dimResults);
    const forecast = forecastRoadmapImpact(roadmap, 60, 0);
    expect(forecast.projectedSvi).toBe(60);
    expect(forecast.week1Impact).toBe(0);
    expect(forecast.week4Impact).toBe(0);
  });
});
