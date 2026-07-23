import { describe, expect, it } from "vitest";

import {
  CANONICAL_STAGES,
  CANONICAL_STAGE_LABELS,
  STAGE_ENTRY_CRITERIA,
  STAGE_EXIT_CRITERIA,
  STAGE_REFERENCE_CASE,
  sviStageToCanonical,
  type StageKey,
} from "./journey-vocabulary";
import { LEGACY_SVI_STAGE_LABELS } from "./svi-analysis";

describe("journey-vocabulary — canonical shape", () => {
  it("declares exactly 8 canonical stages in the documented order", () => {
    expect(CANONICAL_STAGES).toEqual([
      "idea",
      "validation",
      "mvp_early_revenue",
      "seed",
      "series_a",
      "series_b_c",
      "late_stage",
      "public_exit",
    ]);
  });

  it("every stage has non-empty EN + VI labels", () => {
    for (const stage of CANONICAL_STAGES) {
      const labels = CANONICAL_STAGE_LABELS[stage];
      expect(labels, `labels missing for ${stage}`).toBeDefined();
      expect(labels.label_en.trim().length).toBeGreaterThan(0);
      expect(labels.label_vi.trim().length).toBeGreaterThan(0);
    }
  });

  it("every stage has >= 2 entry criteria and >= 2 exit criteria", () => {
    for (const stage of CANONICAL_STAGES) {
      const entry = STAGE_ENTRY_CRITERIA[stage];
      const exit = STAGE_EXIT_CRITERIA[stage];
      expect(entry, `entry criteria missing for ${stage}`).toBeDefined();
      expect(exit, `exit criteria missing for ${stage}`).toBeDefined();
      expect(entry.length).toBeGreaterThanOrEqual(2);
      expect(exit.length).toBeGreaterThanOrEqual(2);
      for (const bullet of entry) {
        expect(bullet.trim().length).toBeGreaterThan(0);
      }
      for (const bullet of exit) {
        expect(bullet.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("every stage has a real-world reference-case anchor", () => {
    const allowedCompanies = new Set([
      "Atlassian",
      "Canva",
      "Airwallex",
      "Xero",
      "Culture Amp",
    ]);
    for (const stage of CANONICAL_STAGES) {
      const anchor = STAGE_REFERENCE_CASE[stage];
      expect(anchor, `reference case missing for ${stage}`).toBeDefined();
      expect(anchor.company.trim().length).toBeGreaterThan(0);
      expect(
        allowedCompanies.has(anchor.company),
        `unexpected company ${anchor.company} — must be one of the audit's 5 reference cases`,
      ).toBe(true);
      expect(anchor.milestone.trim().length).toBeGreaterThan(10);
      expect(anchor.year_or_range.trim().length).toBeGreaterThan(0);
      expect(anchor.citation_hint.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("journey-vocabulary — legacy migration", () => {
  it("sviStageToCanonical maps every legacy SVI index to a canonical stage", () => {
    expect(LEGACY_SVI_STAGE_LABELS).toHaveLength(8);
    const seen = new Set<StageKey>();
    for (let i = 0; i < LEGACY_SVI_STAGE_LABELS.length; i += 1) {
      const canonical = sviStageToCanonical(i);
      expect(CANONICAL_STAGES).toContain(canonical);
      seen.add(canonical);
    }
    // The 8-to-8 mapping is bijective, so every canonical stage should be
    // reached by exactly one legacy SVI index.
    expect(seen.size).toBe(CANONICAL_STAGES.length);
  });

  it("sviStageToCanonical falls back to 'idea' for out-of-range indices", () => {
    expect(sviStageToCanonical(-1)).toBe("idea");
    expect(sviStageToCanonical(99)).toBe("idea");
    expect(sviStageToCanonical(Number.NaN)).toBe("idea");
  });
});
