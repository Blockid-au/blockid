// Colocated vitest for `nav-groups.ts` — the workspace sidebar catalogue
// consumed by workspace-layout, mobile nav, command-palette, and the
// deep-link resolver. A silent id rename, dropped subgroup, reshuffled
// pillar, or lost `flatten()` invariant would leak into every one of
// those surfaces at once (the whole point of extracting this file was
// to share one source of truth), so the catalogue is pinned here.
//
// Pure shape spec — no mocks, no I/O. Grouped by concern:
//   • top-level NAV_GROUPS ordering + pillar/workflow-step bucketing
//   • every leaf has href/label/icon and href is root-relative
//   • `flatten()` semantics — nested `items[]` equals concat(subgroups[].items)
//   • gate aliases (`minTier`/`minPlan`, `requiredFeature`/`feature`) agree
//     when both are set (the sidebar reads either)
//   • persona / segments / addOnKey allow-lists (v3 §16 rules)
//   • ADMIN_NAV_GROUP shape (7 rows, admin persona)
//   • known duplicate hrefs are documented — the two `/reseller/mentor`
//     rows (Reseller subgroup entry + Mentor subgroup Roster) are the
//     expected collisions per the release-plan verbatim-preservation note

import { describe, it, expect } from "vitest";

import { NAV_GROUPS, ADMIN_NAV_GROUP } from "./nav-groups";
import type {
  NavGroup,
  NavLeaf,
  NavSubgroup,
  NavPillar,
  Persona,
  JourneyGroup,
  FeatureLifecycle,
} from "./nav-groups";
import type { PlanTier, Segment } from "@/lib/segments";
import { WORKFLOW_STEPS } from "@/lib/nav/workflow-steps";

const PILLARS: readonly NavPillar[] = [
  "overview",
  "now",
  "coming_up",
  "later",
  "role",
  "account",
];

const PERSONAS: readonly Persona[] = [
  "founder",
  "investor",
  "accelerator",
  "reseller",
  "enterprise",
  "admin",
];

const JOURNEY_GROUPS: readonly JourneyGroup[] = [
  "onboarding",
  "analysis",
  "maturity",
  "reports",
  "permissions",
  "hierarchy",
  "ecosystem",
  "settings",
];

const LIFECYCLES: readonly FeatureLifecycle[] = ["beta", "live", "stable"];

// PlanTier is a union — mirror the shipped values for validation
const PLAN_TIERS: readonly PlanTier[] = [
  "free",
  "starter",
  "growth",
  "scale",
  "enterprise",
  "angel",
  "advisor",
  "vc_small",
  "vc_ent",
  "accel_starter",
  "accel_growth",
  "accel_ent",
];

// Segment union — mirror the shipped values
const SEGMENTS: readonly Segment[] = [
  "founder",
  "investor_angel",
  "investor_vc",
  "advisor",
  "accelerator",
  "lp",
  "admin",
];

const CANONICAL_GROUP_IDS = [
  "home",
  "validate",
  "build",
  "fundraise",
  "scale-exit",
  "roles",
  "account",
] as const;

function walkLeaves(g: NavGroup): NavLeaf[] {
  // Legacy consumers read `items[]`; the nested renderer reads
  // `subgroups`. `flatten()` should keep them in sync — this helper
  // deliberately reads `items[]` so the test can spot a drift between
  // the two views by comparing to the concat(subgroups).
  return g.items;
}

describe("NAV_GROUPS — top-level shape", () => {
  it("ships exactly the 7 canonical top-level groups", () => {
    expect(NAV_GROUPS).toHaveLength(CANONICAL_GROUP_IDS.length);
  });

  it("preserves the canonical top-level id order", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([...CANONICAL_GROUP_IDS]);
  });

  it("gives every top-level group a non-empty label", () => {
    for (const g of NAV_GROUPS) {
      expect(typeof g.label).toBe("string");
      expect(g.label.length).toBeGreaterThan(0);
    }
  });

  it("gives every top-level group a non-empty items[]", () => {
    for (const g of NAV_GROUPS) {
      expect(Array.isArray(g.items)).toBe(true);
      expect(g.items.length).toBeGreaterThan(0);
    }
  });

  it("assigns every top-level group's `pillar` to the shipped allow-list", () => {
    for (const g of NAV_GROUPS) {
      if (g.pillar === undefined) continue;
      expect(PILLARS).toContain(g.pillar);
    }
  });

  it("assigns every top-level group's `workflowStep` to WORKFLOW_STEPS when set", () => {
    for (const g of NAV_GROUPS) {
      if (g.workflowStep === undefined) continue;
      expect(WORKFLOW_STEPS as readonly string[]).toContain(g.workflowStep);
    }
  });

  it("leaves Home / Roles / Account without a workflowStep (utility pillars)", () => {
    const utility = NAV_GROUPS.filter((g) =>
      ["home", "roles", "account"].includes(g.id ?? ""),
    );
    for (const g of utility) {
      expect(g.workflowStep).toBeUndefined();
    }
  });

  it("marks Validate / Build / Fundraise / Scale & Exit with the matching workflowStep", () => {
    const journey: Record<string, string> = {
      validate: "validate",
      build: "build",
      fundraise: "fundraise",
      "scale-exit": "grow",
    };
    for (const [id, step] of Object.entries(journey)) {
      const g = NAV_GROUPS.find((x) => x.id === id);
      expect(g?.workflowStep).toBe(step);
    }
  });

  it("puts Home in the `overview` pillar with defaultCollapsed=false", () => {
    const home = NAV_GROUPS.find((g) => g.id === "home");
    expect(home?.pillar).toBe("overview");
    expect(home?.defaultCollapsed).toBe(false);
  });

  it("puts Validate / Build / Fundraise / Scale & Exit in the `now` pillar", () => {
    for (const id of ["validate", "build", "fundraise", "scale-exit"]) {
      const g = NAV_GROUPS.find((x) => x.id === id);
      expect(g?.pillar).toBe("now");
    }
  });

  it("puts Roles in the `role` pillar and Account in the `account` pillar", () => {
    expect(NAV_GROUPS.find((g) => g.id === "roles")?.pillar).toBe("role");
    expect(NAV_GROUPS.find((g) => g.id === "account")?.pillar).toBe("account");
  });

  it("gives every top-level group a stable string `id`", () => {
    const ids = new Set<string>();
    for (const g of NAV_GROUPS) {
      expect(typeof g.id).toBe("string");
      expect(g.id).toBeTruthy();
      expect(ids.has(g.id!)).toBe(false);
      ids.add(g.id!);
    }
  });

  it("assigns monotonic `minPhase` across the Now-pillar journey", () => {
    // Validate < Build < Fundraise < Scale & Exit
    const nowGroups = ["validate", "build", "fundraise", "scale-exit"].map(
      (id) => NAV_GROUPS.find((g) => g.id === id)!,
    );
    const phases = nowGroups.map((g) => g.minPhase!);
    for (let i = 1; i < phases.length; i += 1) {
      expect(phases[i]).toBeGreaterThan(phases[i - 1]);
    }
  });
});

describe("NAV_GROUPS — subgroup structure", () => {
  it("gives every subgroup a stable string `id` and non-empty label", () => {
    const seen = new Set<string>();
    for (const g of NAV_GROUPS) {
      if (!g.subgroups) continue;
      for (const sg of g.subgroups) {
        expect(typeof sg.id).toBe("string");
        expect(sg.id.length).toBeGreaterThan(0);
        expect(typeof sg.label).toBe("string");
        expect(sg.label.length).toBeGreaterThan(0);
        // subgroup ids are unique across the whole catalogue — the
        // collapse-store keys off them, so a collision would silently
        // yoke two subgroups' open/closed state together.
        expect(seen.has(sg.id)).toBe(false);
        seen.add(sg.id);
      }
    }
  });

  it("gives every subgroup a non-empty items[]", () => {
    for (const g of NAV_GROUPS) {
      if (!g.subgroups) continue;
      for (const sg of g.subgroups) {
        expect(Array.isArray(sg.items)).toBe(true);
        expect(sg.items.length).toBeGreaterThan(0);
      }
    }
  });

  it("flattens subgroups into `items[]` — items.length === sum(subgroups[].items.length)", () => {
    for (const g of NAV_GROUPS) {
      if (!g.subgroups) continue;
      const expected = g.subgroups.reduce(
        (sum: number, sg: NavSubgroup) => sum + sg.items.length,
        0,
      );
      expect(g.items).toHaveLength(expected);
    }
  });

  it("preserves subgroup insertion order in the flattened items[]", () => {
    for (const g of NAV_GROUPS) {
      if (!g.subgroups) continue;
      const expected: NavLeaf[] = [];
      for (const sg of g.subgroups) expected.push(...sg.items);
      // Reference-identity — flatten() spreads the subgroup arrays into
      // one, so each item in items[] should be the same object reference
      // as the source subgroup item (no defensive copy).
      expect(g.items.length).toBe(expected.length);
      for (let i = 0; i < expected.length; i += 1) {
        expect(g.items[i]).toBe(expected[i]);
      }
    }
  });

  it("marks Home + Admin as flat (no subgroups) — the two flat groups", () => {
    const home = NAV_GROUPS.find((g) => g.id === "home")!;
    expect(home.subgroups).toBeUndefined();
    expect(ADMIN_NAV_GROUP.subgroups).toBeUndefined();
  });
});

describe("NAV_GROUPS — per-leaf contract", () => {
  it("gives every leaf a non-empty href, label, and callable icon", () => {
    for (const g of NAV_GROUPS) {
      for (const leaf of walkLeaves(g)) {
        expect(typeof leaf.href).toBe("string");
        expect(leaf.href.length).toBeGreaterThan(0);
        expect(typeof leaf.label).toBe("string");
        expect(leaf.label.length).toBeGreaterThan(0);
        // lucide-react icons resolve as either forwardRef objects
        // (react components) or plain functions depending on bundler
        // transform — both are truthy and non-primitive, so pin that.
        expect(leaf.icon).toBeTruthy();
        expect(["function", "object"]).toContain(typeof leaf.icon);
      }
    }
  });

  it("keeps every leaf href root-relative (starts with `/`)", () => {
    for (const g of NAV_GROUPS) {
      for (const leaf of walkLeaves(g)) {
        expect(leaf.href.startsWith("/")).toBe(true);
      }
    }
  });

  it("keeps every gate value inside its declared allow-list", () => {
    for (const g of NAV_GROUPS) {
      for (const leaf of walkLeaves(g)) {
        if (leaf.minPlan) expect(PLAN_TIERS).toContain(leaf.minPlan);
        if (leaf.minTier) expect(PLAN_TIERS).toContain(leaf.minTier);
        if (leaf.persona) expect(PERSONAS).toContain(leaf.persona);
        if (leaf.journeyGroup)
          expect(JOURNEY_GROUPS).toContain(leaf.journeyGroup);
        if (leaf.lifecycle) expect(LIFECYCLES).toContain(leaf.lifecycle);
        if (leaf.segments) {
          for (const s of leaf.segments) expect(SEGMENTS).toContain(s);
        }
      }
    }
  });

  it("keeps `minTier` and `minPlan` in sync when both are set (they are aliases)", () => {
    for (const g of NAV_GROUPS) {
      for (const leaf of walkLeaves(g)) {
        if (leaf.minTier !== undefined && leaf.minPlan !== undefined) {
          expect(leaf.minTier).toBe(leaf.minPlan);
        }
      }
    }
  });

  it("keeps `feature` and `requiredFeature` in sync when both are set (they are aliases)", () => {
    for (const g of NAV_GROUPS) {
      for (const leaf of walkLeaves(g)) {
        if (leaf.feature !== undefined && leaf.requiredFeature !== undefined) {
          expect(leaf.feature).toBe(leaf.requiredFeature);
        }
      }
    }
  });

  it("restricts `addOnKey` to the single documented value `share_management`", () => {
    for (const g of NAV_GROUPS) {
      for (const leaf of walkLeaves(g)) {
        if (leaf.addOnKey !== undefined) {
          expect(leaf.addOnKey).toBe("share_management");
        }
      }
    }
  });

  it("keeps every `growthPhase` in the 0..5 domain when set", () => {
    for (const g of NAV_GROUPS) {
      for (const leaf of walkLeaves(g)) {
        if (leaf.growthPhase === undefined) continue;
        expect(leaf.growthPhase).toBeGreaterThanOrEqual(0);
        expect(leaf.growthPhase).toBeLessThanOrEqual(5);
        expect(Number.isInteger(leaf.growthPhase)).toBe(true);
      }
    }
  });
});

describe("NAV_GROUPS — group-specific pins", () => {
  it("gives every Home row growthPhase=0 (landing surfaces)", () => {
    const home = NAV_GROUPS.find((g) => g.id === "home")!;
    for (const leaf of home.items) {
      expect(leaf.growthPhase).toBe(0);
    }
  });

  it("puts the Startup Package row in Validate → get-investor-ready, founder-gated, free tier", () => {
    const validate = NAV_GROUPS.find((g) => g.id === "validate")!;
    const investor = validate.subgroups!.find(
      (sg) => sg.id === "validate.get-investor-ready",
    )!;
    expect(investor.items).toHaveLength(1);
    const pkg = investor.items[0];
    expect(pkg.href).toBe("/startup-package");
    expect(pkg.segments).toEqual(["founder"]);
    expect(pkg.minPlan).toBe("free");
    expect(pkg.persona).toBe("founder");
    expect(pkg.journeyGroup).toBe("onboarding");
  });

  it("marks every Build → Equity Setup row with addOnKey=share_management", () => {
    const build = NAV_GROUPS.find((g) => g.id === "build")!;
    const equity = build.subgroups!.find((sg) => sg.id === "build.equity-setup")!;
    for (const leaf of equity.items) {
      expect(leaf.addOnKey).toBe("share_management");
    }
  });

  it("gates every Roles subgroup on a segments filter or a required-feature", () => {
    const roles = NAV_GROUPS.find((g) => g.id === "roles")!;
    for (const sg of roles.subgroups!) {
      const hasSegments = Array.isArray(sg.segments) && sg.segments.length > 0;
      const hasFeature = typeof sg.requiredFeature === "string";
      expect(hasSegments || hasFeature).toBe(true);
    }
  });

  it("gates the Reseller + Mentor subgroups on `reseller.console`", () => {
    const roles = NAV_GROUPS.find((g) => g.id === "roles")!;
    for (const id of ["roles.reseller", "roles.mentor"]) {
      const sg = roles.subgroups!.find((x) => x.id === id)!;
      expect(sg.requiredFeature).toBe("reseller.console");
      // Every leaf inside must also carry the feature gate (defense in
      // depth against a renderer that only reads leaf-level gates).
      for (const leaf of sg.items) {
        expect(leaf.feature).toBe("reseller.console");
        expect(leaf.requiredFeature).toBe("reseller.console");
      }
    }
  });

  it("gates the Investor subgroup on the two investor segments", () => {
    const roles = NAV_GROUPS.find((g) => g.id === "roles")!;
    const investor = roles.subgroups!.find((sg) => sg.id === "roles.investor")!;
    expect(investor.segments).toEqual(["investor_angel", "investor_vc"]);
    for (const leaf of investor.items) {
      expect(leaf.segments).toEqual(["investor_angel", "investor_vc"]);
    }
  });

  it("keeps Account subgroups (Profile / Billing / Enterprise) in shipped order", () => {
    const account = NAV_GROUPS.find((g) => g.id === "account")!;
    expect(account.subgroups!.map((sg) => sg.id)).toEqual([
      "account.profile",
      "account.billing",
      "account.enterprise",
    ]);
  });

  it("keeps Roles subgroups in shipped order (Investor → Advisor → Accelerator → Reseller → Mentor)", () => {
    const roles = NAV_GROUPS.find((g) => g.id === "roles")!;
    expect(roles.subgroups!.map((sg) => sg.id)).toEqual([
      "roles.investor",
      "roles.advisor",
      "roles.accelerator",
      "roles.reseller",
      "roles.mentor",
    ]);
  });
});

describe("NAV_GROUPS — href uniqueness (documented duplicates only)", () => {
  it("keeps hrefs unique across the whole catalogue except the two known Reseller/Mentor collisions", () => {
    const seen = new Map<string, number>();
    for (const g of NAV_GROUPS) {
      for (const leaf of walkLeaves(g)) {
        seen.set(leaf.href, (seen.get(leaf.href) ?? 0) + 1);
      }
    }
    const duplicates = Array.from(seen.entries())
      .filter(([, count]) => count > 1)
      .map(([href, count]) => `${href} (${count}x)`)
      .sort();
    // `/reseller/mentor` is intentionally listed twice — once as the
    // Roster row of the Mentor subgroup, once as the Mentor row of the
    // Reseller subgroup (per release-plan verbatim-preservation note).
    // Nothing else should be duplicated.
    expect(duplicates).toEqual(["/reseller/mentor (2x)"]);
  });
});

describe("ADMIN_NAV_GROUP — shape", () => {
  it("ships exactly 7 admin nav rows", () => {
    expect(ADMIN_NAV_GROUP.items).toHaveLength(7);
  });

  it("labels the group 'Admin' with id 'admin'", () => {
    expect(ADMIN_NAV_GROUP.id).toBe("admin");
    expect(ADMIN_NAV_GROUP.label).toBe("Admin");
  });

  it("leads with the /admin panel row", () => {
    expect(ADMIN_NAV_GROUP.items[0].href).toBe("/admin");
    expect(ADMIN_NAV_GROUP.items[0].label).toBe("Admin Panel");
  });

  it("keeps every admin href root-relative and every icon truthy", () => {
    for (const leaf of ADMIN_NAV_GROUP.items) {
      expect(leaf.href.startsWith("/")).toBe(true);
      expect(leaf.icon).toBeTruthy();
      expect(typeof leaf.label).toBe("string");
      expect(leaf.label.length).toBeGreaterThan(0);
    }
  });

  it("pins the admin href set (source-of-truth for the admin sidebar)", () => {
    expect(ADMIN_NAV_GROUP.items.map((l) => l.href).sort()).toEqual(
      [
        "/admin",
        "/admin/goals",
        "/admin/listings",
        "/dashboard/admin/content-pillars",
        "/dashboard/admin/pricing-test",
        "/dashboard/admin/stripe-sync",
        "/dashboard/admin/svi-exchange",
      ].sort(),
    );
  });
});
