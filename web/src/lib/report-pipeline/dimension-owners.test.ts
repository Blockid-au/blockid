// Colocated tests for the single dimension-ownership table (G13-W1-R1, D8).
// Pins: the owner matrix from the plan, weights sum to 100, chapter order is
// weight order, every criterion in evaluation-criteria.ts reaches at least
// one dimension and its `primaryDimension` agrees with the table, phase
// leads are real growth phases, and the legacy prompt copies stay intact.

import { describe, expect, it } from "vitest";
import { CRITERIA, CRITERION_KEYS } from "@/lib/evaluation-criteria";
import { GROWTH_PHASE_IDS } from "@/lib/growth/phase-taxonomy";
import { ALL_VISUAL_KINDS } from "@/lib/report-visuals/types";
import {
  CROSS_CUTTING_ROLES,
  DIM_LEGACY_ORDER,
  DIM_ORDER,
  DIM_WEIGHTS,
  DIMENSION_OWNERS,
  criteriaForDimension,
  isDimKey,
  legacyStreamDimMeta,
} from "./dimension-owners";
import { AGENT_ROLES } from "./types";

describe("DIMENSION_OWNERS — decision D8 matrix", () => {
  it("assigns the eight owners exactly as decided", () => {
    expect(DIMENSION_OWNERS.tre.primary).toBe("cro");
    expect(DIMENSION_OWNERS.mpc.primary).toBe("cmo");
    expect(DIMENSION_OWNERS.ftv.primary).toBe("chro");
    expect(DIMENSION_OWNERS.ptd.primary).toBe("cto");
    expect(DIMENSION_OWNERS.cgh.primary).toBe("cfo");
    expect(DIMENSION_OWNERS.iri.primary).toBe("clo");
    expect(DIMENSION_OWNERS.lco.primary).toBe("clo");
    expect(DIMENSION_OWNERS.svm.primary).toBe("ceo");
  });

  it("weights sum to 100 and DIM_ORDER is weight-descending", () => {
    const total = Object.values(DIM_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
    const weights = DIM_ORDER.map((k) => DIMENSION_OWNERS[k].weight);
    for (let i = 1; i < weights.length; i++) expect(weights[i]).toBeLessThanOrEqual(weights[i - 1]);
    expect(DIM_ORDER).toEqual(["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"]);
    expect([...DIM_LEGACY_ORDER].sort()).toEqual([...DIM_ORDER].sort());
  });

  it("uses only known agent roles", () => {
    for (const o of Object.values(DIMENSION_OWNERS)) {
      expect(AGENT_ROLES).toContain(o.primary);
      for (const s of o.supporting) expect(AGENT_ROLES).toContain(s);
      expect(o.supporting).not.toContain(o.primary);
    }
    for (const c of Object.values(CROSS_CUTTING_ROLES)) expect(AGENT_ROLES).toContain(c.role);
    expect(CROSS_CUTTING_ROLES.cdo.card).toBe("always_on");
    expect(CROSS_CUTTING_ROLES.ciso.card).toBe("always_on");
    expect(CROSS_CUTTING_ROLES.coo.card).toBe("always_on");
  });

  it("maps every one of the 13 criteria to at least one dimension, and primaries agree with evaluation-criteria.ts", () => {
    const seen = new Set<string>();
    for (const o of Object.values(DIMENSION_OWNERS)) {
      for (const c of criteriaForDimension(o.key)) seen.add(c);
      for (const c of o.primaryCriteria) {
        const def = CRITERIA.find((d) => d.key === c);
        expect(def?.primaryDimension).toBe(o.key);
      }
    }
    for (const key of CRITERION_KEYS) expect(seen.has(key)).toBe(true);
  });

  it("CGH and LCO are scored through lenses (no primary criterion) and keep 13 × 12 stable", () => {
    expect(DIMENSION_OWNERS.cgh.primaryCriteria).toEqual([]);
    expect(DIMENSION_OWNERS.cgh.secondaryCriteria).toEqual(["team", "dataroom", "team_structure"]);
    expect(DIMENSION_OWNERS.lco.primaryCriteria).toEqual([]);
    expect(CRITERION_KEYS).toHaveLength(13);
  });

  it("phase leads are real growth phases and visuals are renderable kinds", () => {
    for (const o of Object.values(DIMENSION_OWNERS)) {
      for (const p of o.phaseLeads) expect(GROWTH_PHASE_IDS).toContain(p);
      expect(ALL_VISUAL_KINDS).toContain(o.primaryVisual);
      expect(ALL_VISUAL_KINDS).toContain(o.secondaryVisual);
      expect(o.allowedVisuals).toContain(o.primaryVisual);
      expect(o.allowedVisuals).toContain(o.secondaryVisual);
      expect(o.frameworks.length).toBeGreaterThanOrEqual(4);
      expect(o.modules.length).toBeGreaterThanOrEqual(2);
      expect(o.connectors.length).toBeGreaterThanOrEqual(1);
      expect(o.researchTopics.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("free tier: chapters 2–5 full, 6–9 cards", () => {
    expect(DIM_ORDER.slice(0, 4).map((k) => DIMENSION_OWNERS[k].freeTier)).toEqual(["full", "full", "full", "full"]);
    expect(DIM_ORDER.slice(4).map((k) => DIMENSION_OWNERS[k].freeTier)).toEqual(["card", "card", "card", "card"]);
  });

  // S-R3: `legacyAnalyzeDimInfo` (DIMENSION_INFO) is deleted — dimension-analyze
  // reads DIMENSION_OWNERS[dim].promptCopy directly. `legacyStreamDimMeta`
  // (DIM_META) stays one release for route.legacy.ts + the wire labels.
  it("legacy stream prompt copy keeps the byte-identical strings the route used", () => {
    const stream = legacyStreamDimMeta();
    expect(Object.keys(stream)).toEqual(["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"]);
    expect(stream.mpc).toEqual({
      label: "Market & Problem Clarity",
      weight: 18,
      description: "Market size (TAM/SAM/SOM), problem severity, customer segment definition, and timing",
    });
    expect(DIMENSION_OWNERS.cgh.promptCopy.analyzeLabel).toBe("Cap Table & Governance Health");
    expect(DIMENSION_OWNERS.ptd.promptCopy.analyzeFocus).toContain("Tech stack maturity");
    for (const k of DIM_ORDER) {
      expect(stream[k].weight).toBe(DIMENSION_OWNERS[k].weight);
    }
  });

  it("isDimKey guards", () => {
    expect(isDimKey("tre")).toBe(true);
    expect(isDimKey("TRE")).toBe(false);
    expect(isDimKey(null)).toBe(false);
  });
});
