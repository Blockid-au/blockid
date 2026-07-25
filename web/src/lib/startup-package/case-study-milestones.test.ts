import { describe, expect, it } from "vitest";

import { GROWTH_PHASE_IDS } from "../journey-map";
import {
  ALL_MILESTONES,
  ATLASSIAN_TIMELINE,
  CANVA_TIMELINE,
  SAFETYCULTURE_TIMELINE,
  XERO_TIMELINE,
  caseStudiesForPhase,
  type Milestone,
} from "./case-study-milestones";

describe("case-study timelines", () => {
  it("CANVA_TIMELINE preserves the 11 hand-typed rows", () => {
    expect(CANVA_TIMELINE.length).toBe(11);
    expect(CANVA_TIMELINE.every((m) => m.company === "canva")).toBe(true);
  });

  it("XERO_TIMELINE preserves the 11 hand-typed rows", () => {
    expect(XERO_TIMELINE.length).toBe(11);
    expect(XERO_TIMELINE.every((m) => m.company === "xero")).toBe(true);
  });

  it("SAFETYCULTURE_TIMELINE preserves the 8 hand-typed rows", () => {
    expect(SAFETYCULTURE_TIMELINE.length).toBe(8);
    expect(SAFETYCULTURE_TIMELINE.every((m) => m.company === "safetyculture")).toBe(true);
  });

  it("ATLASSIAN_TIMELINE re-exports at least the 20 fixture milestones", () => {
    expect(ATLASSIAN_TIMELINE.length).toBeGreaterThanOrEqual(20);
    expect(ATLASSIAN_TIMELINE.every((m) => m.company === "atlassian")).toBe(true);
  });

  it("every milestone has non-empty headline + detail", () => {
    for (const m of ALL_MILESTONES) {
      expect(m.headline.trim().length).toBeGreaterThan(0);
      expect(m.detail.trim().length).toBeGreaterThan(0);
    }
  });

  it("every milestone's phase is a known GrowthPhaseId", () => {
    const known = new Set<string>(GROWTH_PHASE_IDS);
    for (const m of ALL_MILESTONES) {
      expect(known.has(m.phase)).toBe(true);
    }
  });

  it("every milestone's year (if present) is a plausible year 1990-2035", () => {
    for (const m of ALL_MILESTONES) {
      if (m.year === undefined) continue;
      expect(Number.isFinite(m.year)).toBe(true);
      expect(m.year).toBeGreaterThanOrEqual(1990);
      expect(m.year).toBeLessThanOrEqual(2035);
    }
  });
});

describe("caseStudiesForPhase", () => {
  it("returns at most 2 rows", () => {
    for (const phase of GROWTH_PHASE_IDS) {
      expect(caseStudiesForPhase(phase).length).toBeLessThanOrEqual(2);
    }
  });

  it("only returns rows matching the requested phase", () => {
    for (const phase of GROWTH_PHASE_IDS) {
      const rows = caseStudiesForPhase(phase);
      expect(rows.every((r: Milestone) => r.phase === phase)).toBe(true);
    }
  });

  it("prefers cross-company diversity when 2+ companies have rows in the phase", () => {
    // "vision" has founding-year rows from every company mapped to it (year
    // 2007 Canva Fusion Yearbooks, 2006 Xero, 2004 SafetyCulture, plus
    // Atlassian's 2002 phaseSlug=1 row).
    const rows = caseStudiesForPhase("vision");
    expect(rows.length).toBe(2);
    const companies = new Set(rows.map((r) => r.company));
    expect(companies.size).toBe(2);
  });

  it("returns an empty array for phases no case study touches", () => {
    // If we ever add a growth phase no case study touches, this remains safe;
    // for now we assert the shape rather than a specific phase.
    const emptyPhases = GROWTH_PHASE_IDS.filter(
      (p) => ALL_MILESTONES.every((m) => m.phase !== p),
    );
    for (const phase of emptyPhases) {
      expect(caseStudiesForPhase(phase)).toEqual([]);
    }
  });
});
