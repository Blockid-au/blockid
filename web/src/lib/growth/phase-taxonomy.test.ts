import { describe, expect, it } from "vitest";
import { GROWTH_PHASES } from "@/lib/startup-growth-phases";
import {
  GROWTH_PHASE_TO_STAGE,
  PHASE_TO_STAGE,
  type PhaseKey,
} from "@/lib/journey-map";
import {
  deliverablesFor,
  growthPhaseAtLeast,
  growthPhaseOrder,
  GROWTH_PHASE_IDS,
  GROWTH_PHASE_LABELS,
  GROWTH_PHASE_ORDER,
  GROWTH_PHASE_TO_TEMPLATE_PHASE,
  isGrowthPhaseId,
  nextGrowthPhase,
  orderToGrowthPhase,
  templatePhaseFor,
} from "./phase-taxonomy";

describe("growth phase ordering", () => {
  it("matches GROWTH_PHASES[].order exactly", () => {
    for (const phase of GROWTH_PHASES) {
      expect(GROWTH_PHASE_ORDER[phase.id as never]).toBe(phase.order);
    }
  });

  it("covers all 12 phases with contiguous 1..12 orders", () => {
    expect(GROWTH_PHASE_IDS).toHaveLength(12);
    const orders = GROWTH_PHASE_IDS.map((id) => GROWTH_PHASE_ORDER[id]).sort(
      (a, b) => a - b,
    );
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("round-trips order ↔ id", () => {
    for (const id of GROWTH_PHASE_IDS) {
      expect(orderToGrowthPhase(growthPhaseOrder(id))).toBe(id);
    }
  });

  it("clamps out-of-range orders to the ends", () => {
    expect(orderToGrowthPhase(0)).toBe("vision");
    expect(orderToGrowthPhase(-5)).toBe("vision");
    expect(orderToGrowthPhase(99)).toBe("funding");
    expect(orderToGrowthPhase(Number.NaN)).toBe("vision");
    expect(orderToGrowthPhase(null)).toBe("vision");
  });

  it("falls back to vision for unknown ids rather than throwing", () => {
    expect(growthPhaseOrder("not_a_phase")).toBe(1);
    expect(growthPhaseOrder(null)).toBe(1);
    expect(growthPhaseOrder(undefined)).toBe(1);
  });
});

describe("isGrowthPhaseId", () => {
  it("accepts every declared id and rejects everything else", () => {
    for (const id of GROWTH_PHASE_IDS) expect(isGrowthPhaseId(id)).toBe(true);
    // "6" is the numeric taxonomy's key — it must never pass as a growth id.
    for (const bad of ["6", "", "Vision", null, undefined, 6, {}]) {
      expect(isGrowthPhaseId(bad)).toBe(false);
    }
  });
});

describe("nextGrowthPhase / growthPhaseAtLeast", () => {
  it("walks the full sequence and terminates at funding", () => {
    const walked: string[] = ["vision"];
    let cursor = nextGrowthPhase("vision");
    while (cursor) {
      walked.push(cursor);
      cursor = nextGrowthPhase(cursor);
    }
    expect(walked).toEqual([...GROWTH_PHASE_IDS]);
    expect(nextGrowthPhase("funding")).toBeNull();
  });

  it("compares phases by order", () => {
    expect(growthPhaseAtLeast("legal_equity", "vision")).toBe(true);
    expect(growthPhaseAtLeast("legal_equity", "legal_equity")).toBe(true);
    expect(growthPhaseAtLeast("legal_equity", "funding")).toBe(false);
    expect(growthPhaseAtLeast(null, "vision")).toBe(true);
    expect(growthPhaseAtLeast(null, "customer_dev")).toBe(false);
  });
});

describe("labels", () => {
  it("has EN + VI copy for every phase, EN matching GROWTH_PHASES[].title", () => {
    for (const phase of GROWTH_PHASES) {
      const label = GROWTH_PHASE_LABELS[phase.id as never] as
        | { en: string; vi: string }
        | undefined;
      expect(label).toBeTruthy();
      expect(label!.en).toBe(phase.title);
      expect(label!.vi.trim().length).toBeGreaterThan(0);
      expect(label!.vi).not.toBe(label!.en);
    }
  });
});

describe("GROWTH_PHASE_TO_TEMPLATE_PHASE", () => {
  // This is the assertion the module's doc-comment promises: the numeric
  // bridge is only safe because both taxonomies bucket to the same canonical
  // stage at every ordinal. If either is re-ordered, this fails loudly.
  it("only maps across taxonomies where canonical stage buckets agree", () => {
    for (const id of GROWTH_PHASE_IDS) {
      const numeric = GROWTH_PHASE_TO_TEMPLATE_PHASE[id];
      expect(PHASE_TO_STAGE[numeric]).toBe(GROWTH_PHASE_TO_STAGE[id]);
    }
  });

  it("is a bijection onto 1..12", () => {
    const targets = GROWTH_PHASE_IDS.map((id) => GROWTH_PHASE_TO_TEMPLATE_PHASE[id]);
    expect(new Set(targets).size).toBe(12);
    expect([...targets].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ] satisfies PhaseKey[]);
  });

  it("templatePhaseFor falls back to 1 for unknown ids", () => {
    expect(templatePhaseFor("legal_equity")).toBe(6);
    expect(templatePhaseFor("nope")).toBe(1);
    expect(templatePhaseFor(null)).toBe(1);
  });
});

describe("deliverablesFor", () => {
  it("returns the declared deliverables and [] for unknown ids", () => {
    expect(deliverablesFor("vision")).toContain("Vision statement");
    expect(deliverablesFor("nope")).toEqual([]);
    for (const id of GROWTH_PHASE_IDS) {
      expect(deliverablesFor(id).length).toBeGreaterThan(0);
    }
  });
});
