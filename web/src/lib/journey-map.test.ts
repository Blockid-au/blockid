// Unit tests for the 12-phase ↔ 8-stage bucket map (H.21).
// Guards the mechanical bridge between the fine-grained internal Growth
// taxonomy stored in the DB and the canonical VC vocabulary displayed to
// founders. Any change to PHASE_TO_STAGE must keep these invariants green.

import { describe, expect, it } from "vitest";

import { CANONICAL_STAGES, type StageKey } from "./journey-vocabulary";
import {
  ALL_PHASE_KEYS,
  GROWTH_PHASE_IDS,
  GROWTH_PHASE_TO_STAGE,
  growthPhaseToStage,
  growthPhaseToStageLabel,
  PHASE_TO_STAGE,
  phaseToStage,
  phaseToStageLabel,
  STAGE_ORDER,
  stageToGrowthPhases,
  stageToPhases,
  type GrowthPhaseId,
  type PhaseKey,
} from "./journey-map";
import { PHASE_COUNT, PHASE_LABELS } from "./showcase/gallery";
import { GROWTH_PHASES } from "./startup-growth-phases";

const CANONICAL_SET = new Set<StageKey>(CANONICAL_STAGES);

describe("journey-map — forward mapping (12-phase → 8-stage)", () => {
  it("covers every PhaseKey 1..PHASE_COUNT from the gallery taxonomy", () => {
    for (let phase = 1; phase <= PHASE_COUNT; phase += 1) {
      expect(PHASE_TO_STAGE[phase as PhaseKey]).toBeDefined();
      expect(PHASE_LABELS[phase]).toBeDefined();
    }
    expect(ALL_PHASE_KEYS).toHaveLength(PHASE_COUNT);
  });

  it("maps every PhaseKey to a canonical StageKey", () => {
    for (const phase of ALL_PHASE_KEYS) {
      const stage = PHASE_TO_STAGE[phase];
      expect(CANONICAL_SET.has(stage)).toBe(true);
    }
  });

  it("phaseToStage handles null / undefined / out-of-range as 'idea'", () => {
    expect(phaseToStage(null)).toBe("idea");
    expect(phaseToStage(undefined)).toBe("idea");
    expect(phaseToStage(0)).toBe("idea");
    expect(phaseToStage(13)).toBe("idea");
    expect(phaseToStage(-1)).toBe("idea");
  });

  it("phaseToStage matches PHASE_TO_STAGE for every valid ordinal", () => {
    for (const phase of ALL_PHASE_KEYS) {
      expect(phaseToStage(phase)).toBe(PHASE_TO_STAGE[phase]);
    }
  });

  it("is deterministic — same input yields same output on repeat calls", () => {
    for (const phase of ALL_PHASE_KEYS) {
      const first = phaseToStage(phase);
      const second = phaseToStage(phase);
      const third = phaseToStage(phase);
      expect(first).toBe(second);
      expect(second).toBe(third);
    }
  });
});

describe("journey-map — reverse mapping (8-stage → 12-phase)", () => {
  it("contains no orphaned canonical stages — every stage owns >=1 phase", () => {
    for (const stage of CANONICAL_STAGES) {
      const phases = stageToPhases(stage);
      expect(phases.length).toBeGreaterThan(0);
    }
  });

  it("reverse lookup returns phases in ascending order (deterministic)", () => {
    for (const stage of CANONICAL_STAGES) {
      const phases = stageToPhases(stage);
      const sorted = [...phases].sort((a, b) => a - b);
      expect(phases).toEqual(sorted);
    }
  });

  it("is a proper inverse — every phase appears in exactly one reverse bucket", () => {
    const seen = new Map<PhaseKey, StageKey>();
    for (const stage of CANONICAL_STAGES) {
      for (const phase of stageToPhases(stage)) {
        expect(seen.has(phase)).toBe(false);
        seen.set(phase, stage);
      }
    }
    expect(seen.size).toBe(PHASE_COUNT);
    for (const phase of ALL_PHASE_KEYS) {
      expect(seen.get(phase)).toBe(PHASE_TO_STAGE[phase]);
    }
  });

  it("unknown stage strings return an empty phase list (type-cast escape hatch)", () => {
    const result = stageToPhases("not_a_stage" as StageKey);
    expect(result).toEqual([]);
  });
});

describe("journey-map — STAGE_ORDER and label helper", () => {
  it("STAGE_ORDER matches CANONICAL_STAGES exactly", () => {
    expect(STAGE_ORDER).toEqual(CANONICAL_STAGES);
  });

  it("phaseToStageLabel returns null for null/undefined/out-of-range", () => {
    expect(phaseToStageLabel(null)).toBeNull();
    expect(phaseToStageLabel(undefined)).toBeNull();
    expect(phaseToStageLabel(0)).toBeNull();
    expect(phaseToStageLabel(13)).toBeNull();
  });

  it("phaseToStageLabel returns both English + Vietnamese copy for valid phases", () => {
    for (const phase of ALL_PHASE_KEYS) {
      const badge = phaseToStageLabel(phase);
      expect(badge).not.toBeNull();
      expect(badge!.stage).toBe(PHASE_TO_STAGE[phase]);
      expect(badge!.label_en.length).toBeGreaterThan(0);
      expect(badge!.label_vi.length).toBeGreaterThan(0);
    }
  });
});

// ─── Second 12-phase taxonomy: startup-growth-phases string ids ────────────

describe("journey-map — growth-phase (string id) forward mapping", () => {
  it("covers every id declared in startup-growth-phases:GROWTH_PHASES", () => {
    const sourceIds = GROWTH_PHASES.map((p) => p.id);
    expect(sourceIds).toHaveLength(GROWTH_PHASE_IDS.length);
    for (const id of sourceIds) {
      expect(GROWTH_PHASE_TO_STAGE).toHaveProperty(id);
    }
  });

  it("maps every GrowthPhaseId to a canonical StageKey", () => {
    for (const id of GROWTH_PHASE_IDS) {
      const stage = GROWTH_PHASE_TO_STAGE[id];
      expect(CANONICAL_SET.has(stage)).toBe(true);
    }
  });

  it("growthPhaseToStage handles null / undefined / unknown as 'idea'", () => {
    expect(growthPhaseToStage(null)).toBe("idea");
    expect(growthPhaseToStage(undefined)).toBe("idea");
    expect(growthPhaseToStage("")).toBe("idea");
    expect(growthPhaseToStage("not_a_phase")).toBe("idea");
  });

  it("growthPhaseToStage matches GROWTH_PHASE_TO_STAGE for every valid id", () => {
    for (const id of GROWTH_PHASE_IDS) {
      expect(growthPhaseToStage(id)).toBe(GROWTH_PHASE_TO_STAGE[id]);
    }
  });

  it("is deterministic — same input yields same output on repeat calls", () => {
    for (const id of GROWTH_PHASE_IDS) {
      const first = growthPhaseToStage(id);
      const second = growthPhaseToStage(id);
      const third = growthPhaseToStage(id);
      expect(first).toBe(second);
      expect(second).toBe(third);
    }
  });
});

describe("journey-map — growth-phase reverse mapping (8-stage → string ids)", () => {
  it("contains no orphaned canonical stages — every stage owns >=1 phase id", () => {
    for (const stage of CANONICAL_STAGES) {
      const ids = stageToGrowthPhases(stage);
      expect(ids.length).toBeGreaterThan(0);
    }
  });

  it("reverse lookup returns ids in declaration order (deterministic)", () => {
    for (const stage of CANONICAL_STAGES) {
      const ids = stageToGrowthPhases(stage);
      const declarationOrder = [...ids].sort(
        (a, b) => GROWTH_PHASE_IDS.indexOf(a) - GROWTH_PHASE_IDS.indexOf(b),
      );
      expect(ids).toEqual(declarationOrder);
    }
  });

  it("is a proper inverse — every id appears in exactly one reverse bucket", () => {
    const seen = new Map<GrowthPhaseId, StageKey>();
    for (const stage of CANONICAL_STAGES) {
      for (const id of stageToGrowthPhases(stage)) {
        expect(seen.has(id)).toBe(false);
        seen.set(id, stage);
      }
    }
    expect(seen.size).toBe(GROWTH_PHASE_IDS.length);
    for (const id of GROWTH_PHASE_IDS) {
      expect(seen.get(id)).toBe(GROWTH_PHASE_TO_STAGE[id]);
    }
  });

  it("unknown stage strings return an empty phase id list (type-cast escape hatch)", () => {
    const result = stageToGrowthPhases("not_a_stage" as StageKey);
    expect(result).toEqual([]);
  });
});

describe("journey-map — growthPhaseToStageLabel", () => {
  it("returns null for null / undefined / unknown ids", () => {
    expect(growthPhaseToStageLabel(null)).toBeNull();
    expect(growthPhaseToStageLabel(undefined)).toBeNull();
    expect(growthPhaseToStageLabel("")).toBeNull();
    expect(growthPhaseToStageLabel("not_a_phase")).toBeNull();
  });

  it("returns both English + Vietnamese copy for every declared id", () => {
    for (const id of GROWTH_PHASE_IDS) {
      const badge = growthPhaseToStageLabel(id);
      expect(badge).not.toBeNull();
      expect(badge!.stage).toBe(GROWTH_PHASE_TO_STAGE[id]);
      expect(badge!.label_en.length).toBeGreaterThan(0);
      expect(badge!.label_vi.length).toBeGreaterThan(0);
    }
  });
});
