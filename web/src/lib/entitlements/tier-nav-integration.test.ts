// Cross-cutting integration test — added by the P07 test-master sweep.
//
// This test ONLY makes sense once ALL of the following branches are merged
// together on master:
//
//   • wf_681392d6-907-6  →  web/src/lib/entitlements/tier-ladder.ts
//   • wf_681392d6-907-7  →  web/src/lib/nav/filter-nav-for-user.ts
//                        →  web/src/lib/nav/nav-schema.ts
//                        →  web/src/lib/entitlements/current-user-tier.ts
//   • wf_681392d6-907-8  →  web/src/lib/entitlements/require-tier-for-page.ts
//   • wf_681392d6-907-9  →  web/src/components/workspace/nav-groups.ts
//                           (nested NAV_GROUPS with subgroups[])
//
// The per-branch tests only exercise their own file in isolation. This file
// wires the real (post-merge) nav-groups.ts catalogue through the real
// filterNavForUser + tier-ladder, then:
//
//   1. Snapshots the visible label→href list per PlanTier to a golden text
//      file (one per tier under __snapshots__/). PRs that change the sidebar
//      shape must update every golden the change touches — a reviewer sees
//      exactly which tiers gained / lost items.
//   2. Verifies the three hard invariants promised by the tier-menu design:
//      • no leaf survives whose minTier out-ranks the user tier;
//      • no group / subgroup survives with zero visible children;
//      • role-scoped subgroups (Investor / Advisor / Accelerator / Reseller
//        / Mentor) only appear when the ctx has a matching role / segment.
//
// If the release agent renames NavGroupV2 or NAV_GROUPS this test flips
// red before the change reaches production, forcing the rename to land
// atomically across the schema, the catalogue, and the sidebar renderer.

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { filterNavForUser } from "@/lib/nav/filter-nav-for-user";
import type { NavGroupV2 } from "@/lib/nav/nav-schema";
import { NAV_GROUPS } from "@/components/workspace/nav-groups";
import {
  planTierRank,
  type AccountType,
  type PlanTier,
  type Segment,
} from "@/lib/segments";

// ---------------------------------------------------------------------------
// Tier matrix — the five founder PlanTiers named in tier-ladder.ts. Kept as
// a literal tuple so the test names are stable and greppable.
// ---------------------------------------------------------------------------
const FOUNDER_TIERS = ["free", "starter", "growth", "scale", "enterprise"] as const;
type FounderTier = (typeof FOUNDER_TIERS)[number];

// NavGroup (from nav-groups.ts) and NavGroupV2 (from nav-schema.ts) are
// structurally compatible for filterNavForUser's read-only field set. The
// release agent may collapse the two definitions; until then we cast once.
const NAV = NAV_GROUPS as unknown as readonly NavGroupV2[];

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = resolve(HERE, "__snapshots__");

interface FlatLeaf {
  group: string;
  subgroup: string | null;
  label: string;
  href: string;
  minTier?: PlanTier;
}

function flattenLeaves(tree: readonly NavGroupV2[]): FlatLeaf[] {
  const out: FlatLeaf[] = [];
  for (const g of tree) {
    const gid = g.id ?? g.label;
    for (const sg of g.subgroups ?? []) {
      for (const l of sg.items) {
        // NAV_GROUPS leaves may carry `minPlan` (legacy) instead of `minTier`.
        const anyLeaf = l as unknown as { minTier?: PlanTier; minPlan?: PlanTier };
        out.push({
          group: gid,
          subgroup: sg.id,
          label: l.label,
          href: l.href,
          minTier: anyLeaf.minTier ?? anyLeaf.minPlan,
        });
      }
    }
    for (const l of g.items ?? []) {
      const anyLeaf = l as unknown as { minTier?: PlanTier; minPlan?: PlanTier };
      out.push({
        group: gid,
        subgroup: null,
        label: l.label,
        href: l.href,
        minTier: anyLeaf.minTier ?? anyLeaf.minPlan,
      });
    }
  }
  return out;
}

function renderGolden(tree: readonly NavGroupV2[]): string {
  // Stable, human-readable text — one row per visible leaf. Ordering follows
  // the catalogue's declared order so the diff surfaces reordering too.
  const lines: string[] = [];
  for (const leaf of flattenLeaves(tree)) {
    const path = leaf.subgroup
      ? `${leaf.group} / ${leaf.subgroup}`
      : leaf.group;
    lines.push(`${path}\t${leaf.label}\t${leaf.href}`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// 1. Golden snapshot per tier — one file per PlanTier under __snapshots__/.
// ---------------------------------------------------------------------------
describe("tier-nav integration — golden snapshot per PlanTier", () => {
  for (const tier of FOUNDER_TIERS) {
    it(`golden for tier=${tier} matches __snapshots__/tier-${tier}.golden.txt`, async () => {
      const filtered = filterNavForUser(NAV, {
        tier,
        role: "founder" as AccountType,
        segment: "founder" as Segment,
        growthPhase: 3,
        features: new Set<string>(),
      });
      await expect(renderGolden(filtered)).toMatchFileSnapshot(
        resolve(GOLDEN_DIR, `tier-${tier}.golden.txt`),
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Invariants that must hold for every tier.
// ---------------------------------------------------------------------------
describe("tier-nav integration — invariants", () => {
  for (const tier of FOUNDER_TIERS) {
    it(`tier=${tier}: no leaf survives whose minTier > user.tier`, () => {
      const filtered = filterNavForUser(NAV, {
        tier,
        role: "founder" as AccountType,
        segment: "founder" as Segment,
        growthPhase: 5,
        features: new Set<string>(),
      });
      const userRank = planTierRank(tier);
      for (const leaf of flattenLeaves(filtered)) {
        if (!leaf.minTier) continue;
        expect(
          planTierRank(leaf.minTier),
          `${leaf.href} has minTier=${leaf.minTier} (rank ${planTierRank(leaf.minTier)}) but user tier=${tier} (rank ${userRank})`,
        ).toBeLessThanOrEqual(userRank);
      }
    });

    it(`tier=${tier}: every surviving group + subgroup has ≥1 visible child`, () => {
      const filtered = filterNavForUser(NAV, {
        tier,
        role: "founder" as AccountType,
        segment: "founder" as Segment,
        growthPhase: 5,
        features: new Set<string>(),
      });
      for (const g of filtered) {
        const subChildren = (g.subgroups ?? []).reduce(
          (n, sg) => n + sg.items.length,
          0,
        );
        const flatChildren = (g.items ?? []).length;
        expect(
          subChildren + flatChildren,
          `group "${g.id ?? g.label}" survived with zero visible children`,
        ).toBeGreaterThan(0);
        for (const sg of g.subgroups ?? []) {
          expect(
            sg.items.length,
            `subgroup "${sg.id}" of "${g.id ?? g.label}" survived empty`,
          ).toBeGreaterThan(0);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Role-scoped groups appear only for the matching role / segment.
// ---------------------------------------------------------------------------
describe("tier-nav integration — role-scoped subgroups", () => {
  const ROLE_SUBGROUP_IDS = [
    "roles.investor",
    "roles.advisor",
    "roles.accelerator",
    "roles.reseller",
    "roles.mentor",
  ];

  function rolesSubgroupIds(tree: readonly NavGroupV2[]): string[] {
    const roles = tree.find((g) => (g.id ?? g.label).toLowerCase().includes("role"));
    return (roles?.subgroups ?? []).map((s) => s.id);
  }

  it("plain founder (no investor/reseller/etc.): every role-scoped subgroup is pruned", () => {
    const filtered = filterNavForUser(NAV, {
      tier: "enterprise",
      role: "founder" as AccountType,
      segment: "founder" as Segment,
      growthPhase: 5,
      features: new Set<string>(),
    });
    const ids = rolesSubgroupIds(filtered);
    for (const rid of ROLE_SUBGROUP_IDS) {
      expect(ids, `founder should not see ${rid}`).not.toContain(rid);
    }
  });

  it("investor_angel segment: Investor subgroup is visible", () => {
    const filtered = filterNavForUser(NAV, {
      tier: "angel",
      role: "investor_angel" as AccountType,
      segment: "investor_angel" as Segment,
      growthPhase: 5,
      features: new Set<string>(),
    });
    expect(rolesSubgroupIds(filtered)).toContain("roles.investor");
  });

  it("advisor segment: Advisor subgroup is visible", () => {
    const filtered = filterNavForUser(NAV, {
      tier: "advisor",
      role: "advisor" as AccountType,
      segment: "advisor" as Segment,
      growthPhase: 5,
      features: new Set<string>(),
    });
    expect(rolesSubgroupIds(filtered)).toContain("roles.advisor");
  });

  it("accelerator segment: Accelerator subgroup is visible", () => {
    const filtered = filterNavForUser(NAV, {
      tier: "accel_starter",
      role: "accelerator" as AccountType,
      segment: "accelerator" as Segment,
      growthPhase: 5,
      features: new Set<string>(),
    });
    expect(rolesSubgroupIds(filtered)).toContain("roles.accelerator");
  });

  it("reseller role with reseller.console feature: Reseller + Mentor subgroups are visible", () => {
    const filtered = filterNavForUser(NAV, {
      tier: "enterprise",
      role: "reseller" as AccountType,
      segment: "founder" as Segment,
      growthPhase: 5,
      features: new Set<string>(["reseller.console"]),
    });
    const ids = rolesSubgroupIds(filtered);
    expect(ids).toContain("roles.reseller");
    expect(ids).toContain("roles.mentor");
  });
});
