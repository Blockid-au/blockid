// Unit tests for filterNavForUser — the pure hide-not-lock nav filter.
//
// Coverage matrix per CTO acceptance criteria (§04-cto-hide-engine.md):
//   • free / starter / growth / scale / enterprise tier ladder
//   • investor_angel segment scoping
//   • reseller_admin + mentor role scoping
//   • phase-locked groups (growthPhase / minPhase)
//   • empty-group + empty-subgroup pruning
//   • submenu-of-submenu (nested subgroups)
//   • immutability of the input tree

import { describe, it, expect } from "vitest";
import { Briefcase, PieChart, Rocket, Users } from "lucide-react";
import { filterNavForUser } from "@/lib/nav/filter-nav-for-user";
import type { NavGroupV2 } from "@/lib/nav/nav-schema";

function tree(): NavGroupV2[] {
  return [
    {
      id: "home",
      label: "Home",
      pillar: "overview",
      items: [
        { href: "/workspace/projects", label: "My Startups", icon: Briefcase },
      ],
    },
    {
      id: "build",
      label: "Build",
      pillar: "now",
      minPhase: 1,
      subgroups: [
        {
          id: "equity",
          label: "Equity",
          items: [
            { href: "/workspace/cap-table", label: "Cap Table", icon: PieChart, minTier: "starter" },
            { href: "/workspace/wallet", label: "Wallet", icon: PieChart, minTier: "scale" },
          ],
        },
      ],
    },
    {
      id: "roles",
      label: "Roles",
      pillar: "role",
      subgroups: [
        {
          id: "investor",
          label: "Investor",
          segments: ["investor_angel", "investor_vc"],
          items: [
            { href: "/workspace/deal-flow", label: "Deal Flow", icon: Rocket, segments: ["investor_angel", "investor_vc"] },
          ],
        },
        {
          id: "reseller",
          label: "Reseller",
          role: ["reseller"],
          items: [
            { href: "/reseller", label: "Console", icon: Users, role: ["reseller"] },
          ],
        },
        {
          id: "mentor",
          label: "Mentor",
          role: ["reseller", "advisor"],
          items: [
            { href: "/reseller/mentor", label: "Mentees", icon: Users, role: ["reseller", "advisor"] },
          ],
        },
      ],
    },
    {
      id: "enterprise-only",
      label: "Enterprise",
      pillar: "account",
      minTier: "enterprise",
      items: [{ href: "/workspace/sso", label: "SSO", icon: Users }],
    },
  ];
}

describe("filterNavForUser — tier ladder", () => {
  const base = tree();

  it("free tier: hides everything above starter; Overview still renders", () => {
    const out = filterNavForUser(base, { tier: "free", features: new Set(), growthPhase: 5 });
    const labels = out.map((g) => g.label);
    expect(labels).toContain("Home");
    // Build group is pruned because Cap Table + Wallet both require higher tiers
    expect(labels).not.toContain("Build");
    expect(labels).not.toContain("Enterprise");
  });

  it("starter tier: unlocks Cap Table but not Wallet (scale)", () => {
    const out = filterNavForUser(base, { tier: "starter", features: new Set(), growthPhase: 5 });
    const build = out.find((g) => g.id === "build");
    expect(build).toBeTruthy();
    const leaves = build!.subgroups![0].items.map((l) => l.href);
    expect(leaves).toEqual(["/workspace/cap-table"]);
  });

  it("growth tier: unlocks Cap Table but still hides Wallet + Enterprise", () => {
    const out = filterNavForUser(base, { tier: "growth", features: new Set(), growthPhase: 5 });
    const build = out.find((g) => g.id === "build")!;
    expect(build.subgroups![0].items.map((l) => l.href)).toEqual(["/workspace/cap-table"]);
    expect(out.find((g) => g.id === "enterprise-only")).toBeUndefined();
  });

  it("scale tier: unlocks Wallet", () => {
    const out = filterNavForUser(base, { tier: "scale", features: new Set(), growthPhase: 5 });
    const build = out.find((g) => g.id === "build")!;
    expect(build.subgroups![0].items.map((l) => l.href).sort()).toEqual([
      "/workspace/cap-table",
      "/workspace/wallet",
    ]);
  });

  it("enterprise tier: unlocks the Enterprise group + everything else", () => {
    const out = filterNavForUser(base, { tier: "enterprise", features: new Set(), growthPhase: 5 });
    expect(out.some((g) => g.id === "enterprise-only")).toBe(true);
  });
});

describe("filterNavForUser — segment / role scoping", () => {
  const base = tree();

  it("investor_angel: Roles group shows ONLY the Investor subgroup", () => {
    const out = filterNavForUser(base, {
      tier: "angel",
      segment: "investor_angel",
      features: new Set(),
      growthPhase: 5,
    });
    const roles = out.find((g) => g.id === "roles");
    expect(roles).toBeTruthy();
    const subLabels = roles!.subgroups!.map((s) => s.id);
    expect(subLabels).toContain("investor");
    expect(subLabels).not.toContain("reseller");
    expect(subLabels).not.toContain("mentor");
  });

  it("reseller role: shows Reseller + Mentor subgroups; hides Investor", () => {
    const out = filterNavForUser(base, {
      tier: "enterprise",
      role: "reseller",
      features: new Set(),
      growthPhase: 5,
    });
    const roles = out.find((g) => g.id === "roles")!;
    const subIds = roles.subgroups!.map((s) => s.id).sort();
    expect(subIds).toEqual(["mentor", "reseller"]);
  });

  it("advisor role: mentor subgroup renders (multi-role allow-list)", () => {
    const out = filterNavForUser(base, {
      tier: "advisor",
      role: "advisor",
      features: new Set(),
      growthPhase: 5,
    });
    const roles = out.find((g) => g.id === "roles")!;
    expect(roles.subgroups!.map((s) => s.id)).toContain("mentor");
  });

  it("plain founder: Roles group is pruned entirely (all subgroups mismatch)", () => {
    const out = filterNavForUser(base, {
      tier: "starter",
      segment: "founder",
      role: "founder",
      features: new Set(),
      growthPhase: 5,
    });
    expect(out.find((g) => g.id === "roles")).toBeUndefined();
  });
});

describe("filterNavForUser — phase gates", () => {
  it("phase 0 founder: Build group (minPhase 1) is hidden", () => {
    const out = filterNavForUser(tree(), {
      tier: "growth",
      features: new Set(),
      growthPhase: 0,
    });
    expect(out.find((g) => g.id === "build")).toBeUndefined();
  });

  it("leaf-level growthPhase gate hides a single row without dropping its group", () => {
    const t: NavGroupV2[] = [{
      id: "g",
      label: "G",
      pillar: "now",
      items: [
        { href: "/a", label: "Always", icon: Briefcase },
        { href: "/late", label: "Late", icon: Briefcase, growthPhase: 4 },
      ],
    }];
    const out = filterNavForUser(t, { tier: "free", features: new Set(), growthPhase: 2 });
    expect(out).toHaveLength(1);
    expect(out[0].items!.map((i) => i.href)).toEqual(["/a"]);
  });
});

describe("filterNavForUser — feature gates + empty pruning", () => {
  it("required feature missing ⇒ leaf hidden", () => {
    const t: NavGroupV2[] = [{
      id: "g",
      label: "G",
      pillar: "now",
      items: [
        { href: "/premium", label: "Premium", icon: Briefcase, requiredFeature: "term_sheet.ai" },
      ],
    }];
    expect(filterNavForUser(t, { tier: "growth", features: new Set(), growthPhase: 5 })).toEqual([]);
    const out = filterNavForUser(t, {
      tier: "growth",
      features: new Set(["term_sheet.ai"]),
      growthPhase: 5,
    });
    expect(out).toHaveLength(1);
  });

  it("empty subgroup + empty group pruning cascades", () => {
    const t: NavGroupV2[] = [{
      id: "g",
      label: "G",
      pillar: "now",
      subgroups: [
        {
          id: "sg",
          label: "SG",
          items: [{ href: "/x", label: "X", icon: Briefcase, minTier: "enterprise" }],
        },
      ],
    }];
    expect(filterNavForUser(t, { tier: "free", features: new Set(), growthPhase: 5 })).toEqual([]);
  });
});

describe("filterNavForUser — immutability", () => {
  it("does not mutate the input tree or its nested arrays", () => {
    const t = tree();
    const snapshot = JSON.stringify(t, (_k, v) =>
      typeof v === "function" ? v.name : v,
    );
    filterNavForUser(t, { tier: "free", features: new Set(), growthPhase: 0 });
    filterNavForUser(t, { tier: "enterprise", features: new Set(["x"]), growthPhase: 5, role: "reseller" });
    const after = JSON.stringify(t, (_k, v) =>
      typeof v === "function" ? v.name : v,
    );
    expect(after).toEqual(snapshot);
  });
});
