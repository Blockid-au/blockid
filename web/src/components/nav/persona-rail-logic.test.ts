// Colocated vitest for `persona-rail-logic.ts` — the pure helpers that
// back `persona-rail.tsx` (§16.2 layer B of the workspace nav spec).
//
// A sibling test at `persona-rail.test.ts` already exercises the wider
// component contract, but the test-gate (scripts/cron/test-gate.mjs)
// only pairs a source file with its **same-name** sibling. Without this
// file, a rewrite of `persona-rail-logic.ts` that shipped a broken
// arrow-key wrap or a stripped icon set would land unguarded.
//
// Behaviours pinned:
//   • PERSONA_ICON_KEYS — order matches the founder-locked persona list
//     and covers every member of the Persona union
//   • PERSONA_LABELS — every persona has a non-empty label
//   • shouldRenderPersonaRail — auto-hide when ≤ 1 persona available
//   • computeNextPersonaIndex — wraps both ends; defensive on total=0
//   • resolveTabbableIndex — falls back to 0 when the active persona is
//     absent (feature-flag drift / mismatched claims)

import { describe, expect, it } from "vitest";

import type { Persona } from "@/components/workspace/nav-groups";

import {
  PERSONA_ICON_KEYS,
  PERSONA_LABELS,
  computeNextPersonaIndex,
  resolveTabbableIndex,
  shouldRenderPersonaRail,
} from "./persona-rail-logic";

const CANONICAL_PERSONAS: readonly Persona[] = [
  "founder",
  "investor",
  "accelerator",
  "reseller",
  "enterprise",
  "admin",
] as const;

describe("PERSONA_ICON_KEYS", () => {
  it("contains exactly the six canonical personas", () => {
    expect(PERSONA_ICON_KEYS.length).toBe(6);
  });

  it("orders personas in the founder-locked sequence", () => {
    expect([...PERSONA_ICON_KEYS]).toEqual([...CANONICAL_PERSONAS]);
  });

  it("has no duplicate entries (Set size matches array length)", () => {
    expect(new Set(PERSONA_ICON_KEYS).size).toBe(PERSONA_ICON_KEYS.length);
  });

  it("covers every member of the Persona union (parity with nav-groups.ts)", () => {
    for (const p of CANONICAL_PERSONAS) {
      expect(PERSONA_ICON_KEYS).toContain(p);
    }
  });
});

describe("PERSONA_LABELS", () => {
  it("has an entry for every persona in PERSONA_ICON_KEYS", () => {
    for (const p of PERSONA_ICON_KEYS) {
      expect(PERSONA_LABELS[p]).toBeTruthy();
    }
  });

  it("uses non-empty, trimmed strings for every label", () => {
    for (const p of PERSONA_ICON_KEYS) {
      const label = PERSONA_LABELS[p];
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
      expect(label).toBe(label.trim());
    }
  });

  it("capitalises each label (first character upper-case)", () => {
    for (const p of PERSONA_ICON_KEYS) {
      const first = PERSONA_LABELS[p][0];
      expect(first).toBe(first.toUpperCase());
    }
  });
});

describe("shouldRenderPersonaRail", () => {
  it("hides when zero personas are available", () => {
    expect(shouldRenderPersonaRail(0)).toBe(false);
  });

  it("hides when only one persona is available (single-persona user)", () => {
    expect(shouldRenderPersonaRail(1)).toBe(false);
  });

  it("renders when the user carries 2+ personas", () => {
    expect(shouldRenderPersonaRail(2)).toBe(true);
    expect(shouldRenderPersonaRail(3)).toBe(true);
    expect(shouldRenderPersonaRail(PERSONA_ICON_KEYS.length)).toBe(true);
  });

  it("is defensive against negative counts (still returns false)", () => {
    expect(shouldRenderPersonaRail(-1)).toBe(false);
    expect(shouldRenderPersonaRail(-99)).toBe(false);
  });
});

describe("computeNextPersonaIndex", () => {
  it("advances by 1 for direction=next in the middle of the list", () => {
    expect(computeNextPersonaIndex(2, 6, "next")).toBe(3);
  });

  it("advances by -1 for direction=prev in the middle of the list", () => {
    expect(computeNextPersonaIndex(2, 6, "prev")).toBe(1);
  });

  it("wraps from the last index to 0 on direction=next", () => {
    expect(computeNextPersonaIndex(5, 6, "next")).toBe(0);
  });

  it("wraps from index 0 to the last index on direction=prev", () => {
    expect(computeNextPersonaIndex(0, 6, "prev")).toBe(5);
  });

  it("returns 0 when total <= 0 (defensive against empty lists)", () => {
    expect(computeNextPersonaIndex(0, 0, "next")).toBe(0);
    expect(computeNextPersonaIndex(3, 0, "prev")).toBe(0);
    expect(computeNextPersonaIndex(0, -1, "next")).toBe(0);
  });

  it("collapses to 0 for a single-element list on either direction", () => {
    expect(computeNextPersonaIndex(0, 1, "next")).toBe(0);
    expect(computeNextPersonaIndex(0, 1, "prev")).toBe(0);
  });

  it("keeps a full sweep of next() cycling back to the start", () => {
    let idx = 0;
    for (let i = 0; i < 6; i++) {
      idx = computeNextPersonaIndex(idx, 6, "next");
    }
    expect(idx).toBe(0);
  });
});

describe("resolveTabbableIndex", () => {
  it("returns the index of the active persona when it is present", () => {
    expect(resolveTabbableIndex(CANONICAL_PERSONAS, "accelerator")).toBe(2);
  });

  it("returns 0 for the first persona in the list", () => {
    expect(resolveTabbableIndex(CANONICAL_PERSONAS, "founder")).toBe(0);
  });

  it("returns the last index for the tail persona", () => {
    expect(resolveTabbableIndex(CANONICAL_PERSONAS, "admin")).toBe(5);
  });

  it("falls back to 0 when the active persona is absent (feature-flag drift)", () => {
    expect(resolveTabbableIndex(["founder", "investor"], "admin")).toBe(0);
  });

  it("falls back to 0 for an empty available list", () => {
    expect(resolveTabbableIndex([], "founder")).toBe(0);
  });

  it("does not mutate the input list", () => {
    const input: Persona[] = ["investor", "founder", "admin"];
    const snapshot = [...input];
    resolveTabbableIndex(input, "founder");
    expect(input).toEqual(snapshot);
  });
});
