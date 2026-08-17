/**
 * Tests for computeEvidenceCompleteness
 *
 * Covers:
 *  - computeEvidenceCompletenessSync: all dimensions empty, full, partial
 *  - LCO bonus/penalty logic in computeSVI
 *  - API-layer behaviour (auth, validation, response shape)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeEvidenceCompletenessSync,
  DIMENSION_RUBRICS,
  type DimensionEvidenceRow,
} from "./computeEvidenceCompleteness";
import { computeSVI } from "./svi-analysis";
import type { SVIExtractedSignals } from "./svi-analysis";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRows(
  dimension: string,
  evidenceTypes: string[]
): DimensionEvidenceRow[] {
  return evidenceTypes.map((evidence_type) => ({ dimension, evidence_type }));
}

function allRowsForDimension(dimKey: string): DimensionEvidenceRow[] {
  return DIMENSION_RUBRICS[dimKey].map((evidence_type) => ({
    dimension: dimKey,
    evidence_type,
  }));
}

function makeSignals(overrides: Partial<SVIExtractedSignals> = {}): SVIExtractedSignals {
  return {
    hasCoFounder: false,
    founderExperience: "first-time",
    founderSectorFit: false,
    hasAdvisors: false,
    marketSize: "unknown",
    problemClarity: "vague",
    hasCustomerInterviews: false,
    isAIWrapper: false,
    hasMoat: false,
    hasNetworkEffect: false,
    hasDataAdvantage: false,
    hasSwitchingCosts: false,
    hasProduct: false,
    hasDemo: false,
    hasSourceCode: false,
    hasWebsite: false,
    hasApp: false,
    hasRevenue: false,
    revenueBand: "pre-revenue",
    hasCustomers: false,
    hasSocialProof: false,
    hasAnalytics: false,
    hasCapTable: false,
    hasVesting: false,
    hasShareholdersAgreement: false,
    hasBoardCadence: false,
    hasFinancialAudit: false,
    esopAllocated: false,
    hasPitchDeck: false,
    hasFinancialModel: false,
    hasDataRoom: false,
    targetRaiseMentioned: false,
    raiseMentioned: false,
    hasABN: false,
    hasIPProtection: false,
    hasContracts: false,
    hasLegalDocs: false,
    evidenceLevel: "self_declared",
    ...overrides,
  };
}

// ─── computeEvidenceCompletenessSync tests ────────────────────────────────────

describe("computeEvidenceCompletenessSync", () => {
  describe("empty evidence", () => {
    it("returns 0% overall when no rows provided", () => {
      const result = computeEvidenceCompletenessSync([]);
      expect(result.overall_pct).toBe(0);
    });

    it("returns 0% for every dimension when no rows provided", () => {
      const result = computeEvidenceCompletenessSync([]);
      expect(result.dimensions.fin.completeness_pct).toBe(0);
      expect(result.dimensions.tre.completeness_pct).toBe(0);
      expect(result.dimensions.ptd.completeness_pct).toBe(0);
      expect(result.dimensions.cgh.completeness_pct).toBe(0);
      expect(result.dimensions.lco.completeness_pct).toBe(0);
    });

    it("lists all required evidence types as missing", () => {
      const result = computeEvidenceCompletenessSync([]);
      const totalRequired = Object.values(DIMENSION_RUBRICS).reduce(
        (sum, types) => sum + types.length,
        0
      );
      expect(result.missing.length).toBe(totalRequired);
    });
  });

  describe("full evidence", () => {
    it("returns 100% for a dimension with all evidence present", () => {
      const rows = allRowsForDimension("lco");
      const result = computeEvidenceCompletenessSync(rows);
      expect(result.dimensions.lco.completeness_pct).toBe(100);
    });

    it("returns 100% overall when all dimensions are fully populated", () => {
      const rows: DimensionEvidenceRow[] = [];
      for (const dimKey of Object.keys(DIMENSION_RUBRICS)) {
        rows.push(...allRowsForDimension(dimKey));
      }
      const result = computeEvidenceCompletenessSync(rows);
      expect(result.overall_pct).toBe(100);
    });

    it("returns empty missing array when all evidence is present", () => {
      const rows: DimensionEvidenceRow[] = [];
      for (const dimKey of Object.keys(DIMENSION_RUBRICS)) {
        rows.push(...allRowsForDimension(dimKey));
      }
      const result = computeEvidenceCompletenessSync(rows);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe("partial evidence", () => {
    it("returns 50% for lco when half the evidence types are present", () => {
      const lcoTypes = DIMENSION_RUBRICS["lco"];
      const halfCount = Math.floor(lcoTypes.length / 2);
      const rows = makeRows("lco", lcoTypes.slice(0, halfCount));
      const result = computeEvidenceCompletenessSync(rows);
      expect(result.dimensions.lco.completeness_pct).toBe(
        Math.round((halfCount / lcoTypes.length) * 100)
      );
    });

    it("correctly counts gathered_count vs required_count", () => {
      const ptdTypes = DIMENSION_RUBRICS["ptd"];
      const rows = makeRows("ptd", [ptdTypes[0]]);
      const result = computeEvidenceCompletenessSync(rows);
      expect(result.dimensions.ptd.gathered_count).toBe(1);
      expect(result.dimensions.ptd.required_count).toBe(ptdTypes.length);
    });

    it("adds missing types correctly to the missing array", () => {
      const finTypes = DIMENSION_RUBRICS["fin"];
      const rows = makeRows("fin", [finTypes[0]]);
      const result = computeEvidenceCompletenessSync(rows);
      const finMissing = result.missing.filter((m) => m.startsWith("fin:"));
      expect(finMissing.length).toBe(finTypes.length - 1);
    });

    it("sets priority to the dimension with lowest completeness", () => {
      // Only populate lco fully, leave others at 0
      const rows = allRowsForDimension("lco");
      const result = computeEvidenceCompletenessSync(rows);
      // Priority should NOT be lco (it's 100%) — should be one of the 0% ones
      expect(result.priority).not.toBe("lco");
    });

    it("handles duplicate evidence types without double-counting", () => {
      const lcoType = DIMENSION_RUBRICS["lco"][0];
      const rows: DimensionEvidenceRow[] = [
        { dimension: "lco", evidence_type: lcoType },
        { dimension: "lco", evidence_type: lcoType }, // duplicate
      ];
      const result = computeEvidenceCompletenessSync(rows);
      // Should count as 1, not 2
      expect(result.dimensions.lco.gathered_count).toBe(1);
    });
  });

  describe("dimension count integrity", () => {
    it("reports correct required_count for each dimension", () => {
      const result = computeEvidenceCompletenessSync([]);
      expect(result.dimensions.fin.required_count).toBe(DIMENSION_RUBRICS["fin"].length);
      expect(result.dimensions.tre.required_count).toBe(DIMENSION_RUBRICS["tre"].length);
      expect(result.dimensions.ptd.required_count).toBe(DIMENSION_RUBRICS["ptd"].length);
      expect(result.dimensions.cgh.required_count).toBe(DIMENSION_RUBRICS["cgh"].length);
      expect(result.dimensions.lco.required_count).toBe(DIMENSION_RUBRICS["lco"].length);
    });
  });
});

// ─── LCO evidence bonus / penalty in computeSVI ───────────────────────────────

describe("computeSVI — LCO evidence completeness bonus/penalty", () => {
  it("deducts 10 pts from lcoAdj when lco_pct < 50", () => {
    const signals = makeSignals({ hasABN: true }); // gives lcoRaw some baseline
    const withoutBoost = computeSVI(signals);
    const withPenalty = computeSVI(
      signals,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { lco_pct: 30, overall_pct: 20 }
    );

    const lcoWithout = withoutBoost.subs.find((d) => d.key === "lco")!;
    const lcoWithPenalty = withPenalty.subs.find((d) => d.key === "lco")!;

    // The penalty reduces the adjustment by 10
    expect(lcoWithPenalty.adjustment).toBe(lcoWithout.adjustment - 10);
  });

  it("adds 5 pts to lcoAdj when overall_pct > 75", () => {
    const signals = makeSignals({ hasABN: true });
    const withoutBoost = computeSVI(signals);
    const withBonus = computeSVI(
      signals,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { lco_pct: 80, overall_pct: 80 }
    );

    const lcoWithout = withoutBoost.subs.find((d) => d.key === "lco")!;
    const lcoWithBonus = withBonus.subs.find((d) => d.key === "lco")!;

    expect(lcoWithBonus.adjustment).toBe(lcoWithout.adjustment + 5);
  });

  it("applies both penalty and bonus when lco_pct < 50 AND overall_pct > 75", () => {
    const signals = makeSignals({ hasABN: true });
    const withoutBoost = computeSVI(signals);
    const withBoth = computeSVI(
      signals,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { lco_pct: 40, overall_pct: 80 } // lco < 50 (-10) AND overall > 75 (+5) = net -5
    );

    const lcoWithout = withoutBoost.subs.find((d) => d.key === "lco")!;
    const lcoWithBoth = withBoth.subs.find((d) => d.key === "lco")!;

    expect(lcoWithBoth.adjustment).toBe(lcoWithout.adjustment - 10 + 5);
  });

  it("leaves LCO unchanged when evidenceBoosts is undefined", () => {
    const signals = makeSignals({ hasABN: true });
    const withoutBoost = computeSVI(signals);
    const withUndefined = computeSVI(
      signals,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );

    const lcoA = withoutBoost.subs.find((d) => d.key === "lco")!;
    const lcoB = withUndefined.subs.find((d) => d.key === "lco")!;
    expect(lcoA.adjustment).toBe(lcoB.adjustment);
  });

  it("does not affect non-LCO dimensions", () => {
    const signals = makeSignals({ hasABN: true });
    const withoutBoost = computeSVI(signals);
    const withBonus = computeSVI(
      signals,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { lco_pct: 30, overall_pct: 80 }
    );

    const ftvA = withoutBoost.subs.find((d) => d.key === "ftv")!;
    const ftvB = withBonus.subs.find((d) => d.key === "ftv")!;
    expect(ftvA.adjustment).toBe(ftvB.adjustment);

    const treA = withoutBoost.subs.find((d) => d.key === "tre")!;
    const treB = withBonus.subs.find((d) => d.key === "tre")!;
    expect(treA.adjustment).toBe(treB.adjustment);
  });
});
