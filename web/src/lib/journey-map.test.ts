// Unit tests for the 12-phase ↔ 8-stage bucket map (H.21).
// Guards the mechanical bridge between the fine-grained internal Growth
// taxonomy stored in the DB and the canonical VC vocabulary displayed to
// founders. Any change to PHASE_TO_STAGE must keep these invariants green.

import { describe, expect, it } from "vitest";

import { CANONICAL_STAGES, type StageKey } from "./journey-vocabulary";
import {
  ALL_PHASE_KEYS,
  PHASE_TO_STAGE,
  phaseToStage,
  phaseToStageLabel,
  STAGE_ORDER,
  stageToPhases,
  type PhaseKey,
} from "./journey-map";
import { PHASE_COUNT, PHASE_LABELS } from "./showcase/gallery";

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
