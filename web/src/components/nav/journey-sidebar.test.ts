/**
 * Colocated tests for JourneySidebar pure logic (grouping + auto-open)
 * plus a downstream integration check for the v3 §16.4 hide-when-locked
 * gate the component applies before grouping.
 *
 * Pinned invariants:
 *   1. groupItemsByJourney preserves the §16.6 order
 *      onboarding → analysis → maturity → reports → permissions →
 *      hierarchy → ecosystem → settings.
 *   2. Items with no `journeyGroup` fall into "settings" (permissive
 *      fallback for legacy rows not yet annotated).
 *   3. Empty sections are omitted so the sidebar doesn't render blank
 *      disclosures.
 *   4. shouldAutoOpenSection returns true iff the section holds an item
 *      whose growthPhase matches the current phase; false when phase is
 *      undefined.
 *   5. filterHideWhenLocked drops locked v3-default rows and marks
 *      hideWhenLocked=false add-ons with _lockedDim so the sidebar can
 *      render them dimmed.
 */

import { describe, expect, it } from "vitest";
import { Rocket, Zap } from "lucide-react";

import type { NavLeaf } from "@/components/workspace/nav-groups";
import { filterHideWhenLocked } from "@/lib/nav/hide-when-locked";

import {
  JOURNEY_GROUP_ORDER,
  groupItemsByJourney,
  shouldAutoOpenSection,
} from "./journey-sidebar-logic";

// Small helper — builds a NavLeaf without the full lucide overhead.
function leaf(overrides: Partial<NavLeaf>): NavLeaf {
  return {
    href: "/x",
    label: "x",
    icon: Rocket,
    ...overrides,
  };
}

describe("JourneySidebar — JOURNEY_GROUP_ORDER (§16.6 founder-locked)", () => {
  it("matches the founder-locked ordering exactly", () => {
    expect([...JOURNEY_GROUP_ORDER]).toEqual([
      "onboarding",
      "analysis",
      "maturity",
      "reports",
      "permissions",
      "hierarchy",
      "ecosystem",
      "settings",
    ]);
  });
});

describe("JourneySidebar — groupItemsByJourney", () => {
  it("groups items and preserves the §16.6 order", () => {
    const items: NavLeaf[] = [
      leaf({ href: "/report", journeyGroup: "reports" }),
      leaf({ href: "/onboard", journeyGroup: "onboarding" }),
      leaf({ href: "/analyze", journeyGroup: "analysis" }),
      leaf({ href: "/mature", journeyGroup: "maturity" }),
    ];
    const out = groupItemsByJourney(items);
    expect(out.map((s) => s.key)).toEqual([
      "onboarding",
      "analysis",
      "maturity",
      "reports",
    ]);
  });

  it("buckets items with no journeyGroup into 'settings'", () => {
    const items: NavLeaf[] = [
      leaf({ href: "/legacy" }),
      leaf({ href: "/also-legacy" }),
    ];
    const out = groupItemsByJourney(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.key).toBe("settings");
    expect(out[0]!.items.map((i) => i.href)).toEqual([
      "/legacy",
      "/also-legacy",
    ]);
  });

  it("omits empty sections so no blank disclosures render", () => {
    const items: NavLeaf[] = [leaf({ href: "/o", journeyGroup: "onboarding" })];
    const out = groupItemsByJourney(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.key).toBe("onboarding");
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
});

describe("JourneySidebar — shouldAutoOpenSection (§16.3)", () => {
  it("opens the section whose item.growthPhase matches the current phase", () => {
    const section = {
      key: "analysis" as const,
      label: "Analysis",
      items: [
        leaf({ href: "/a", growthPhase: 1 }),
        leaf({ href: "/b", growthPhase: 2 }),
      ],
    };
    expect(shouldAutoOpenSection(section, 1)).toBe(true);
    expect(shouldAutoOpenSection(section, 2)).toBe(true);
  });

  it("does not open when no item matches the phase", () => {
    const section = {
      key: "analysis" as const,
      label: "Analysis",
      items: [leaf({ href: "/a", growthPhase: 1 })],
    };
    expect(shouldAutoOpenSection(section, 3)).toBe(false);
  });

  it("does not open when currentGrowthPhase is undefined", () => {
    const section = {
      key: "onboarding" as const,
      label: "Onboarding",
      items: [leaf({ href: "/a", growthPhase: 0 })],
    };
    expect(shouldAutoOpenSection(section, undefined)).toBe(false);
  });
});

describe("JourneySidebar — hide-when-locked integration (v3 §16.4)", () => {
  const items: NavLeaf[] = [
    leaf({ href: "/free", icon: Zap }),
    leaf({ href: "/growth", icon: Zap, minTier: "growth" }),
    leaf({
      href: "/share-mgmt",
      icon: Zap,
      minTier: "growth",
      hideWhenLocked: false,
    }),
  ];

  it("drops locked v3-default rows and dims add-on rows", () => {
    const out = filterHideWhenLocked(items, (item) => ({
      scopeOk: true,
      flagOk: true,
      // Simulate a free-tier user — anything with minTier is locked.
      tierOk: !item.minTier,
    }));
    expect(out.map((i) => i.href)).toEqual(["/free", "/share-mgmt"]);
    const addOn = out.find((i) => i.href === "/share-mgmt")!;
    expect(addOn._lockedDim).toBe(true);
    const free = out.find((i) => i.href === "/free")!;
    expect(free._lockedDim).toBeUndefined();
  });

  it("keeps every row for a fully-tiered user (all gates pass)", () => {
    const out = filterHideWhenLocked(items, () => ({
      scopeOk: true,
      flagOk: true,
      tierOk: true,
    }));
    expect(out.map((i) => i.href)).toEqual([
      "/free",
      "/growth",
      "/share-mgmt",
    ]);
    expect(out.every((i) => i._lockedDim === undefined)).toBe(true);
  });
});
