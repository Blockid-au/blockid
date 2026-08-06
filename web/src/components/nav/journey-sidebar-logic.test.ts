// Colocated vitest for `journey-sidebar-logic.ts` — the pure helpers that
// back `journey-sidebar.tsx` (§16.3 / §16.6 of the workspace nav spec).
//
// A sibling test at `journey-sidebar.test.ts` already exercises the wider
// component contract (including the hide-when-locked pre-filter), but the
// test-gate (scripts/cron/test-gate.mjs) only pairs a source file with its
// **same-name** sibling. Without this file, a rewrite of
// `journey-sidebar-logic.ts` that stripped a group from JOURNEY_GROUP_ORDER
// or reversed the founder-locked ordering would land unguarded — the sidebar
// would silently render its sections in the wrong order and the auto-open
// heuristic would keep every disclosure collapsed by default.
//
// Behaviours pinned:
//   • JOURNEY_GROUP_ORDER — length 8, no duplicates, exact founder-locked
//     order, parity with every JourneyGroup union member
//   • JOURNEY_GROUP_LABELS — entry per group, non-empty trimmed strings,
//     first-char upper-case (so the collapsible summary reads as a title)
//   • groupItemsByJourney — order preserved when populated in any input
//     order, undefined `journeyGroup` buckets into "settings" (permissive
//     fallback), empty sections dropped, per-group insertion order kept,
//     empty input → [], generic parameter widening preserves consumer fields
//   • shouldAutoOpenSection — undefined phase → false, matching phase → true,
//     no match → false, empty items → false, phase 0 (onboarding) counts as
//     a real match (not falsy-coerced), an all-mismatch section stays closed

import { describe, expect, it } from "vitest";
import { Rocket } from "lucide-react";

import type {
  JourneyGroup,
  NavLeaf,
} from "@/components/workspace/nav-groups";
import type { GrowthPhase } from "@/lib/nav/workflow-steps";

import {
  JOURNEY_GROUP_LABELS,
  JOURNEY_GROUP_ORDER,
  groupItemsByJourney,
  shouldAutoOpenSection,
} from "./journey-sidebar-logic";

const CANONICAL_ORDER: readonly JourneyGroup[] = [
  "onboarding",
  "analysis",
  "maturity",
  "reports",
  "permissions",
  "hierarchy",
  "ecosystem",
  "settings",
] as const;

function leaf(overrides: Partial<NavLeaf> = {}): NavLeaf {
  return {
    href: "/x",
    label: "x",
    icon: Rocket,
    ...overrides,
  };
}

describe("JOURNEY_GROUP_ORDER", () => {
  it("contains exactly eight canonical journey groups", () => {
    expect(JOURNEY_GROUP_ORDER.length).toBe(8);
  });

  it("has no duplicate entries (Set size matches array length)", () => {
    expect(new Set(JOURNEY_GROUP_ORDER).size).toBe(JOURNEY_GROUP_ORDER.length);
  });

  it("matches the founder-locked ordering exactly", () => {
    expect([...JOURNEY_GROUP_ORDER]).toEqual([...CANONICAL_ORDER]);
  });

  it("covers every JourneyGroup union member (parity with nav-groups.ts)", () => {
    for (const g of CANONICAL_ORDER) {
      expect(JOURNEY_GROUP_ORDER).toContain(g);
    }
  });

  it("puts 'settings' last so legacy / uncategorised rows sink to the bottom", () => {
    expect(JOURNEY_GROUP_ORDER[JOURNEY_GROUP_ORDER.length - 1]).toBe("settings");
  });

  it("puts 'onboarding' first so the earliest-phase founder lands on it", () => {
    expect(JOURNEY_GROUP_ORDER[0]).toBe("onboarding");
  });
});

describe("JOURNEY_GROUP_LABELS", () => {
  it("has an entry for every group in JOURNEY_GROUP_ORDER", () => {
    for (const g of JOURNEY_GROUP_ORDER) {
      expect(JOURNEY_GROUP_LABELS[g]).toBeTruthy();
    }
  });

  it("uses non-empty, trimmed strings for every label", () => {
    for (const g of JOURNEY_GROUP_ORDER) {
      const label = JOURNEY_GROUP_LABELS[g];
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
      expect(label).toBe(label.trim());
    }
  });

  it("capitalises each label (first char upper-case, no punctuation)", () => {
    for (const g of JOURNEY_GROUP_ORDER) {
      const label = JOURNEY_GROUP_LABELS[g];
      expect(label[0]).toBe(label[0].toUpperCase());
      // §37 collapsible summary uses these bare — no trailing colon / dot.
      expect(label.endsWith(":")).toBe(false);
      expect(label.endsWith(".")).toBe(false);
    }
  });

  it("has no duplicate labels (each group is visually distinct)", () => {
    const values = JOURNEY_GROUP_ORDER.map((g) => JOURNEY_GROUP_LABELS[g]);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("groupItemsByJourney — ordering + fallback", () => {
  it("returns [] for an empty input (no blank disclosures)", () => {
    expect(groupItemsByJourney([])).toEqual([]);
  });

  it("emits sections in JOURNEY_GROUP_ORDER regardless of input order", () => {
    const items: NavLeaf[] = [
      leaf({ href: "/eco", journeyGroup: "ecosystem" }),
      leaf({ href: "/onb", journeyGroup: "onboarding" }),
      leaf({ href: "/rep", journeyGroup: "reports" }),
      leaf({ href: "/ana", journeyGroup: "analysis" }),
      leaf({ href: "/set", journeyGroup: "settings" }),
    ];
    const out = groupItemsByJourney(items);
    expect(out.map((s) => s.key)).toEqual([
      "onboarding",
      "analysis",
      "reports",
      "ecosystem",
      "settings",
    ]);
  });

  it("emits every populated section when every group is present", () => {
    const items: NavLeaf[] = CANONICAL_ORDER.map((g) =>
      leaf({ href: `/${g}`, journeyGroup: g }),
    );
    const out = groupItemsByJourney(items);
    expect(out.map((s) => s.key)).toEqual([...CANONICAL_ORDER]);
  });

  it("omits empty sections so the sidebar never renders blank disclosures", () => {
    const items: NavLeaf[] = [
      leaf({ href: "/only", journeyGroup: "reports" }),
    ];
    const out = groupItemsByJourney(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.key).toBe("reports");
  });

  it("buckets items with no journeyGroup into 'settings' (permissive fallback)", () => {
    const items: NavLeaf[] = [leaf({ href: "/a" }), leaf({ href: "/b" })];
    const out = groupItemsByJourney(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.key).toBe("settings");
    expect(out[0]!.items.map((i) => i.href)).toEqual(["/a", "/b"]);
  });

  it("merges undefined-journeyGroup rows with explicit 'settings' rows in insertion order", () => {
    const items: NavLeaf[] = [
      leaf({ href: "/legacy" }),
      leaf({ href: "/explicit", journeyGroup: "settings" }),
      leaf({ href: "/also-legacy" }),
    ];
    const out = groupItemsByJourney(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.key).toBe("settings");
    expect(out[0]!.items.map((i) => i.href)).toEqual([
      "/legacy",
      "/explicit",
      "/also-legacy",
    ]);
  });

  it("preserves in-group insertion order for deterministic rendering", () => {
    const items: NavLeaf[] = [
      leaf({ href: "/o1", journeyGroup: "onboarding" }),
      leaf({ href: "/o2", journeyGroup: "onboarding" }),
      leaf({ href: "/o3", journeyGroup: "onboarding" }),
    ];
    const out = groupItemsByJourney(items);
    expect(out[0]!.items.map((i) => i.href)).toEqual(["/o1", "/o2", "/o3"]);
  });

  it("emits each populated section with the label from JOURNEY_GROUP_LABELS", () => {
    const items: NavLeaf[] = [
      leaf({ href: "/onb", journeyGroup: "onboarding" }),
      leaf({ href: "/eco", journeyGroup: "ecosystem" }),
    ];
    const out = groupItemsByJourney(items);
    expect(out.map((s) => s.label)).toEqual([
      JOURNEY_GROUP_LABELS.onboarding,
      JOURNEY_GROUP_LABELS.ecosystem,
    ]);
  });

  it("does not mutate the input array", () => {
    const items: NavLeaf[] = [
      leaf({ href: "/b", journeyGroup: "reports" }),
      leaf({ href: "/a", journeyGroup: "onboarding" }),
    ];
    const snapshot = items.map((i) => i.href);
    groupItemsByJourney(items);
    expect(items.map((i) => i.href)).toEqual(snapshot);
  });

  it("accepts a widened NavLeaf and returns rows carrying every extra field", () => {
    // The generic <T extends NavLeaf> lets consumers pass a widened leaf
    // (e.g. carrying a `_lockedDim` marker stamped by filterHideWhenLocked).
    // A rewrite that drops the generic would type-check but silently lose
    // the extra fields at runtime — pin the round-trip here.
    interface Widened extends NavLeaf {
      _lockedDim?: boolean;
    }
    const items: Widened[] = [
      { ...leaf({ href: "/dim", journeyGroup: "reports" }), _lockedDim: true },
      { ...leaf({ href: "/lit", journeyGroup: "reports" }) },
    ];
    const out = groupItemsByJourney(items);
    expect(out[0]!.items[0]!._lockedDim).toBe(true);
    expect(out[0]!.items[1]!._lockedDim).toBeUndefined();
  });
});

describe("shouldAutoOpenSection (§16.3)", () => {
  const mkSection = (items: NavLeaf[]) => ({
    key: "analysis" as const,
    label: "Analysis",
    items,
  });

  it("returns false when currentGrowthPhase is undefined (defensive)", () => {
    const section = mkSection([leaf({ href: "/a", growthPhase: 1 })]);
    expect(shouldAutoOpenSection(section, undefined)).toBe(false);
  });

  it("returns true when at least one item's growthPhase matches", () => {
    const section = mkSection([
      leaf({ href: "/a", growthPhase: 1 }),
      leaf({ href: "/b", growthPhase: 2 }),
    ]);
    expect(shouldAutoOpenSection(section, 1)).toBe(true);
    expect(shouldAutoOpenSection(section, 2)).toBe(true);
  });

  it("returns false when no item matches the phase", () => {
    const section = mkSection([
      leaf({ href: "/a", growthPhase: 1 }),
      leaf({ href: "/b", growthPhase: 2 }),
    ]);
    expect(shouldAutoOpenSection(section, 3)).toBe(false);
    expect(shouldAutoOpenSection(section, 5)).toBe(false);
  });

  it("returns false for an empty section (no items ⇒ nothing to match)", () => {
    const section = mkSection([]);
    for (const p of [0, 1, 2, 3, 4, 5] as GrowthPhase[]) {
      expect(shouldAutoOpenSection(section, p)).toBe(false);
    }
  });

  it("treats phase 0 as a real match (not falsy-coerced to 'no phase')", () => {
    // §16.6 growthPhase 0 is the onboarding bucket. A `if (item.growthPhase)`
    // regression would silently drop this — pin it explicitly.
    const section = mkSection([leaf({ href: "/o", growthPhase: 0 })]);
    expect(shouldAutoOpenSection(section, 0)).toBe(true);
  });

  it("returns false when items have no growthPhase set at all", () => {
    const section = mkSection([leaf({ href: "/a" }), leaf({ href: "/b" })]);
    for (const p of [0, 1, 2, 3, 4, 5] as GrowthPhase[]) {
      expect(shouldAutoOpenSection(section, p)).toBe(false);
    }
  });

  it("returns true for every phase 0..5 when the section holds one leaf per phase", () => {
    const section = mkSection(
      ([0, 1, 2, 3, 4, 5] as GrowthPhase[]).map((p) =>
        leaf({ href: `/p${p}`, growthPhase: p }),
      ),
    );
    for (const p of [0, 1, 2, 3, 4, 5] as GrowthPhase[]) {
      expect(shouldAutoOpenSection(section, p)).toBe(true);
    }
  });
});
