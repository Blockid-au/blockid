import { describe, expect, it } from "vitest";

import {
  EvidenceStateSchema,
  EvidenceTransitionSchema,
  nextEvidenceState,
  type EvidenceState,
  type EvidenceTransition,
} from "./state-machine";

const ALL_STATES: readonly EvidenceState[] = EvidenceStateSchema.options;
const ALL_TRANSITIONS: readonly EvidenceTransition[] =
  EvidenceTransitionSchema.options;

// The full expected transition table. Any (state, transition) pair
// NOT in this map must return null.
const LEGAL: ReadonlyArray<
  readonly [EvidenceState, EvidenceTransition, EvidenceState]
> = [
  ["uploaded", "start_processing", "processing"],
  ["processing", "extraction_complete", "classified"],
  ["classified", "classify_high_confidence", "verified"],
  ["classified", "classify_low_confidence", "validation_required"],
  ["validation_required", "human_approve", "verified"],
  ["validation_required", "human_reject", "rejected"],
  // expire is legal from every state that is still "live".
  ["uploaded", "expire", "expired"],
  ["processing", "expire", "expired"],
  ["classified", "expire", "expired"],
  ["validation_required", "expire", "expired"],
  ["verified", "expire", "expired"],
  ["verified", "archive", "archived"],
  ["expired", "archive", "archived"],
];

describe("nextEvidenceState — full transition matrix", () => {
  for (const [from, transition, to] of LEGAL) {
    it(`${from} --${transition}--> ${to}`, () => {
      expect(nextEvidenceState(from, transition)).toBe(to);
    });
  }

  it("every (state, transition) pair NOT in the legal table returns null", () => {
    const legalKey = new Set(
      LEGAL.map(([from, t]) => `${from}::${t}`),
    );
    const illegal: Array<[EvidenceState, EvidenceTransition]> = [];
    for (const state of ALL_STATES) {
      for (const transition of ALL_TRANSITIONS) {
        if (!legalKey.has(`${state}::${transition}`)) {
          illegal.push([state, transition]);
        }
      }
    }
    // Sanity: the matrix has 8 states * 8 transitions = 64 cells, of
    // which 13 are legal, so 51 must be illegal. If the counts drift
    // this test fails loudly and forces us to reconcile the table.
    expect(illegal.length).toBe(ALL_STATES.length * ALL_TRANSITIONS.length - LEGAL.length);

    for (const [state, transition] of illegal) {
      expect(
        nextEvidenceState(state, transition),
        `illegal transition ${state} --${transition}--> should be null`,
      ).toBeNull();
    }
  });
});

describe("nextEvidenceState — illegal transition guards", () => {
  it("uploaded --classify_high_confidence--> is illegal (must not skip processing)", () => {
    expect(nextEvidenceState("uploaded", "classify_high_confidence")).toBeNull();
  });

  it("archived is terminal — expire from archived is illegal", () => {
    expect(nextEvidenceState("archived", "expire")).toBeNull();
  });

  it("rejected is terminal — expire from rejected is illegal", () => {
    expect(nextEvidenceState("rejected", "expire")).toBeNull();
  });

  it("expired --expire--> is a no-op (illegal), returns null", () => {
    expect(nextEvidenceState("expired", "expire")).toBeNull();
  });

  it("rejected cannot be archived directly (must expire first per policy)", () => {
    expect(nextEvidenceState("rejected", "archive")).toBeNull();
  });

  it("uploaded cannot be archived — only verified/expired can", () => {
    expect(nextEvidenceState("uploaded", "archive")).toBeNull();
  });
});

describe("Zod schemas", () => {
  it("EvidenceStateSchema accepts all 8 declared states", () => {
    for (const s of ALL_STATES) {
      expect(EvidenceStateSchema.parse(s)).toBe(s);
    }
  });

  it("EvidenceStateSchema rejects unknown state strings", () => {
    expect(() => EvidenceStateSchema.parse("pending")).toThrow();
  });

  it("EvidenceTransitionSchema accepts all 8 declared transitions", () => {
    for (const t of ALL_TRANSITIONS) {
      expect(EvidenceTransitionSchema.parse(t)).toBe(t);
    }
  });
});
