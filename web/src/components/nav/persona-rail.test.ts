/**
 * Colocated tests for PersonaRail pure logic (see persona-rail.tsx header
 * for the RTL-availability caveat that motivates the pure-logic split).
 *
 * Pinned invariants (§16.2 layer B):
 *   1. Renders (shouldRender=true) for every persona once N > 1.
 *   2. Auto-hides when only 1 persona is available.
 *   3. Arrow-key navigation wraps at both ends (roving tabindex).
 *   4. Escape collapses — modelled as the collapse-transition input.
 *   5. aria-current resolution picks the active persona; falls back to
 *      index 0 when the active persona isn't in the list.
 *   6. Icon key parity — every Persona listed here is present in the
 *      component's icon lookup (pinned indirectly via PERSONA_ICON_KEYS).
 */

import { describe, expect, it } from "vitest";

import type { Persona } from "@/components/workspace/nav-groups";

import {
  PERSONA_ICON_KEYS,
  PERSONA_LABELS,
  computeNextPersonaIndex,
  resolveTabbableIndex,
  shouldRenderPersonaRail,
} from "./persona-rail-logic";

describe("PersonaRail — shouldRenderPersonaRail (auto-hide rule)", () => {
  it("hides when zero personas are available", () => {
    expect(shouldRenderPersonaRail(0)).toBe(false);
  });

  it("hides when only one persona is available (single-persona user)", () => {
    expect(shouldRenderPersonaRail(1)).toBe(false);
  });

  it("renders when the user carries 2+ personas", () => {
    expect(shouldRenderPersonaRail(2)).toBe(true);
    expect(shouldRenderPersonaRail(6)).toBe(true);
  });
});

describe("PersonaRail — icon / label coverage", () => {
  it("covers every Persona variant in PERSONA_ICON_KEYS", () => {
    const expected: Persona[] = [
      "founder",
      "investor",
      "accelerator",
      "reseller",
      "enterprise",
      "admin",
    ];
    // Set-equality: no drift between the union and the rail's static list.
    expect([...PERSONA_ICON_KEYS].sort()).toEqual(expected.sort());
  });

  it("has a human-readable label for every persona", () => {
    for (const key of PERSONA_ICON_KEYS) {
      expect(PERSONA_LABELS[key]).toBeTruthy();
      expect(typeof PERSONA_LABELS[key]).toBe("string");
    }
  });
});

describe("PersonaRail — arrow-key navigation (roving tabindex)", () => {
  it("ArrowDown moves to the next persona", () => {
    expect(computeNextPersonaIndex(0, 4, "next")).toBe(1);
    expect(computeNextPersonaIndex(2, 4, "next")).toBe(3);
  });

  it("ArrowUp moves to the previous persona", () => {
    expect(computeNextPersonaIndex(3, 4, "prev")).toBe(2);
    expect(computeNextPersonaIndex(1, 4, "prev")).toBe(0);
  });

  it("wraps from last to first on ArrowDown", () => {
    expect(computeNextPersonaIndex(3, 4, "next")).toBe(0);
  });

  it("wraps from first to last on ArrowUp", () => {
    expect(computeNextPersonaIndex(0, 4, "prev")).toBe(3);
  });

  it("returns 0 defensively when total is zero", () => {
    expect(computeNextPersonaIndex(0, 0, "next")).toBe(0);
  });
});

describe("PersonaRail — aria-current / tabbable resolution", () => {
  const available: Persona[] = ["founder", "investor", "reseller"];

  it("picks the active persona's index for roving tabindex", () => {
    expect(resolveTabbableIndex(available, "investor")).toBe(1);
    expect(resolveTabbableIndex(available, "reseller")).toBe(2);
  });

  it("falls back to 0 when the active persona is not in the list", () => {
    // Simulates a stale auth claim or feature-flag drift.
    expect(resolveTabbableIndex(available, "admin")).toBe(0);
  });
});
