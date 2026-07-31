// Colocated unit test for the pure role → sidebar-overlay resolver.
//
// Pins the DEFAULT_OVERLAY shape, the role→overlay lookup precedence
// (admin role wins over segment; segment wins over accountType), the
// applySidebarOverlay filter+stable-reorder semantics (hidden groups
// dropped, ranked groups first, unranked kept in catalogue order), and
// the resolveInitialCollapse precedence (overlay.defaultCollapsedGroups
// > catalogue defaultCollapsed > false). Plus a data-quality sweep over
// ROLE_OVERLAY_TABLE so a role config never lists a group as hidden AND
// asks the sidebar to order it — that would be a silent no-op today.

import { describe, it, expect } from "vitest";
import {
  getMenuOverlayForRole,
  applySidebarOverlay,
  resolveInitialCollapse,
  type RoleMenuOverlay,
} from "@/lib/nav/role-menu-overlay";

const CANONICAL_LABELS = [
  "Home",
  "Validate",
  "Build",
  "Fundraise",
  "Scale & Exit",
  "Roles",
  "Account",
] as const;

describe("getMenuOverlayForRole — default overlay", () => {
  it("returns the Founder overlay for a plain founder", () => {
    const o = getMenuOverlayForRole({ accountType: "founder" });
    expect(o.roleLabel).toBe("Founder");
    expect(o.hiddenGroups).toEqual([]);
    expect(o.topNavExtras).toEqual([]);
  });

  it("returns the default overlay when nothing is passed", () => {
    const o = getMenuOverlayForRole({});
    expect(o.roleLabel).toBe("Founder");
  });

  it("returns the default overlay when segment + accountType are null", () => {
    const o = getMenuOverlayForRole({ segment: null, accountType: null });
    expect(o.roleLabel).toBe("Founder");
  });

  it("returns the default overlay for an unknown segment", () => {
    const o = getMenuOverlayForRole({ segment: "not-a-real-role" });
    expect(o.roleLabel).toBe("Founder");
  });

  it("default overlay is frozen — cannot mutate at runtime", () => {
    const o = getMenuOverlayForRole({});
    expect(Object.isFrozen(o)).toBe(true);
  });

  it("default sidebarOrder covers the 7 canonical top-level groups", () => {
    const o = getMenuOverlayForRole({});
    expect(o.sidebarOrder).toEqual([...CANONICAL_LABELS]);
  });
});

describe("getMenuOverlayForRole — role precedence", () => {
  it("role='admin' wins over segment + accountType", () => {
    const o = getMenuOverlayForRole({
      role: "admin",
      segment: "investor_vc",
      accountType: "reseller",
    });
    expect(o.roleLabel).toBe("Admin");
    expect(o.topNavExtras.some((t) => t.href === "/admin")).toBe(true);
  });

  it("segment wins over accountType when both are set + valid", () => {
    const o = getMenuOverlayForRole({
      segment: "investor_angel",
      accountType: "founder",
    });
    expect(o.roleLabel).toBe("Angel investor");
  });

  it("falls back to accountType when segment is missing", () => {
    const o = getMenuOverlayForRole({ accountType: "reseller" });
    expect(o.roleLabel).toBe("Reseller");
  });

  it("falls back to accountType when segment is empty string", () => {
    const o = getMenuOverlayForRole({ segment: "", accountType: "mentor" });
    expect(o.roleLabel).toBe("Program Mentor");
  });

  it("returns the correct overlay for every named role key", () => {
    const cases: Record<string, string> = {
      founder: "Founder",
      investor_angel: "Angel investor",
      investor_vc: "VC investor",
      advisor: "Advisor",
      accelerator: "Accelerator",
      incubator: "Incubator",
      reseller: "Reseller",
      mentor: "Program Mentor",
      innovator: "Corporate Innovator",
      journalist: "Journalist",
    };
    for (const [key, label] of Object.entries(cases)) {
      const o = getMenuOverlayForRole({ accountType: key });
      expect(o.roleLabel, `overlay for ${key}`).toBe(label);
    }
  });

  it("affiliate + investor legacy account types alias to Founder default", () => {
    for (const key of ["affiliate", "investor"] as const) {
      const o = getMenuOverlayForRole({ accountType: key });
      expect(o.roleLabel).toBe("Founder");
    }
  });

  it("does not resolve inherited-prototype keys like 'toString' or '__proto__'", () => {
    // hasOwnProperty gate protects against a caller passing "toString" (which
    // exists on Object.prototype) and getting back a function-shaped overlay.
    expect(getMenuOverlayForRole({ segment: "toString" }).roleLabel).toBe(
      "Founder",
    );
    expect(getMenuOverlayForRole({ segment: "__proto__" }).roleLabel).toBe(
      "Founder",
    );
  });
});

describe("getMenuOverlayForRole — audience-specific shapes", () => {
  it("reseller ships a Reseller top-nav extra pointing at /reseller", () => {
    const o = getMenuOverlayForRole({ accountType: "reseller" });
    const extra = o.topNavExtras.find((t) => t.label === "Reseller");
    expect(extra?.href).toBe("/reseller");
    expect(extra?.badge).toBe("Console");
  });

  it("mentor ships a Mentor top-nav extra pointing at /reseller/mentor", () => {
    const o = getMenuOverlayForRole({ accountType: "mentor" });
    const extra = o.topNavExtras.find((t) => t.label === "Mentor");
    expect(extra?.href).toBe("/reseller/mentor");
    expect(extra?.badge).toBe("Console");
  });

  it("innovator ships an Innovator top-nav extra pointing at /innovator", () => {
    const o = getMenuOverlayForRole({ accountType: "innovator" });
    const extra = o.topNavExtras.find((t) => t.label === "Innovator");
    expect(extra?.href).toBe("/innovator");
    expect(extra?.badge).toBe("Console");
  });

  it("admin ships an Admin top-nav extra with an ariaLabel and no badge", () => {
    const o = getMenuOverlayForRole({ role: "admin" });
    const extra = o.topNavExtras.find((t) => t.label === "Admin");
    expect(extra?.href).toBe("/admin");
    expect(extra?.ariaLabel).toBe("Admin control panel");
    expect(extra?.badge).toBeUndefined();
  });

  it("investor roles hide Validate/Build/Scale & Exit but keep Fundraise + Roles", () => {
    for (const key of ["investor_angel", "investor_vc"] as const) {
      const o = getMenuOverlayForRole({ segment: key });
      expect(o.hiddenGroups).toContain("Validate");
      expect(o.hiddenGroups).toContain("Build");
      expect(o.hiddenGroups).toContain("Scale & Exit");
      expect(o.hiddenGroups).not.toContain("Fundraise");
      expect(o.hiddenGroups).not.toContain("Roles");
    }
  });

  it("journalist hides all founder ops + Roles (read-only shell)", () => {
    const o = getMenuOverlayForRole({ accountType: "journalist" });
    expect(o.hiddenGroups).toEqual(
      expect.arrayContaining([
        "Validate",
        "Build",
        "Fundraise",
        "Scale & Exit",
        "Roles",
      ]),
    );
    expect(o.sidebarOrder).toEqual(["Home", "Account"]);
    expect(o.topNavExtras).toEqual([]);
  });

  it("accelerator + incubator share the same shape (aliased)", () => {
    const a = getMenuOverlayForRole({ accountType: "accelerator" });
    const i = getMenuOverlayForRole({ accountType: "incubator" });
    expect(a.hiddenGroups).toEqual(i.hiddenGroups);
    expect(a.sidebarOrder).toEqual(i.sidebarOrder);
    expect(a.defaultCollapsedGroups).toEqual(i.defaultCollapsedGroups);
  });
});

describe("applySidebarOverlay — filter + reorder", () => {
  const baseGroups = [
    { label: "Home" },
    { label: "Validate" },
    { label: "Build" },
    { label: "Fundraise" },
    { label: "Scale & Exit" },
    { label: "Roles" },
    { label: "Account" },
  ];

  it("hides groups whose label is in overlay.hiddenGroups", () => {
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: ["Validate", "Build"],
      topNavExtras: [],
      sidebarOrder: [],
      defaultCollapsedGroups: [],
    };
    const out = applySidebarOverlay(baseGroups, overlay);
    expect(out.map((g) => g.label)).toEqual([
      "Home",
      "Fundraise",
      "Scale & Exit",
      "Roles",
      "Account",
    ]);
  });

  it("reorders ranked groups to the front in overlay.sidebarOrder order", () => {
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: [],
      topNavExtras: [],
      sidebarOrder: ["Roles", "Home", "Fundraise"],
      defaultCollapsedGroups: [],
    };
    const out = applySidebarOverlay(baseGroups, overlay);
    expect(out.map((g) => g.label).slice(0, 3)).toEqual([
      "Roles",
      "Home",
      "Fundraise",
    ]);
  });

  it("keeps unranked groups in original catalogue order after ranked ones", () => {
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: [],
      topNavExtras: [],
      sidebarOrder: ["Roles"],
      defaultCollapsedGroups: [],
    };
    const out = applySidebarOverlay(baseGroups, overlay).map((g) => g.label);
    expect(out[0]).toBe("Roles");
    expect(out.slice(1)).toEqual([
      "Home",
      "Validate",
      "Build",
      "Fundraise",
      "Scale & Exit",
      "Account",
    ]);
  });

  it("empty sidebarOrder skips the reorder step entirely", () => {
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: ["Validate"],
      topNavExtras: [],
      sidebarOrder: [],
      defaultCollapsedGroups: [],
    };
    const out = applySidebarOverlay(baseGroups, overlay).map((g) => g.label);
    expect(out).toEqual([
      "Home",
      "Build",
      "Fundraise",
      "Scale & Exit",
      "Roles",
      "Account",
    ]);
  });

  it("does not mutate the input array", () => {
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: ["Build"],
      topNavExtras: [],
      sidebarOrder: ["Roles", "Home"],
      defaultCollapsedGroups: [],
    };
    const snapshot = baseGroups.map((g) => g.label);
    applySidebarOverlay(baseGroups, overlay);
    expect(baseGroups.map((g) => g.label)).toEqual(snapshot);
  });

  it("returns a fresh array (not the same reference)", () => {
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: [],
      topNavExtras: [],
      sidebarOrder: ["Home"],
      defaultCollapsedGroups: [],
    };
    const out = applySidebarOverlay(baseGroups, overlay);
    expect(out).not.toBe(baseGroups);
  });

  it("ignores sidebarOrder labels not present in the input groups", () => {
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: [],
      topNavExtras: [],
      // "Ghost" is not a catalogue label — the resolver must NOT invent a row.
      sidebarOrder: ["Ghost", "Home"],
      defaultCollapsedGroups: [],
    };
    const out = applySidebarOverlay(baseGroups, overlay);
    expect(out.some((g) => g.label === "Ghost")).toBe(false);
    expect(out).toHaveLength(baseGroups.length);
    // "Home" ranked; every other label unranked so falls to end. "Ghost" is a
    // no-op — Home still lands at index 0.
    expect(out[0].label).toBe("Home");
  });

  it("hides groups before ordering (a hidden group in sidebarOrder is a no-op)", () => {
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: ["Build"],
      topNavExtras: [],
      sidebarOrder: ["Build", "Home"],
      defaultCollapsedGroups: [],
    };
    const out = applySidebarOverlay(baseGroups, overlay).map((g) => g.label);
    expect(out).not.toContain("Build");
    // Home is the only surviving ranked label so it lands first.
    expect(out[0]).toBe("Home");
  });

  it("returns [] when every group is hidden", () => {
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: baseGroups.map((g) => g.label),
      topNavExtras: [],
      sidebarOrder: [],
      defaultCollapsedGroups: [],
    };
    expect(applySidebarOverlay(baseGroups, overlay)).toEqual([]);
  });
});

describe("resolveInitialCollapse", () => {
  it("collapses groups listed in overlay.defaultCollapsedGroups", () => {
    const groups = [{ label: "Home" }, { label: "Build" }];
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: [],
      topNavExtras: [],
      sidebarOrder: [],
      defaultCollapsedGroups: ["Build"],
    };
    expect(resolveInitialCollapse(groups, overlay)).toEqual({
      Home: false,
      Build: true,
    });
  });

  it("falls back to group.defaultCollapsed when the overlay is silent", () => {
    const groups = [
      { label: "Home", defaultCollapsed: false },
      { label: "Build", defaultCollapsed: true },
    ];
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: [],
      topNavExtras: [],
      sidebarOrder: [],
      defaultCollapsedGroups: [],
    };
    expect(resolveInitialCollapse(groups, overlay)).toEqual({
      Home: false,
      Build: true,
    });
  });

  it("defaults to false when neither overlay nor catalogue specifies", () => {
    const groups = [{ label: "Home" }];
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: [],
      topNavExtras: [],
      sidebarOrder: [],
      defaultCollapsedGroups: [],
    };
    expect(resolveInitialCollapse(groups, overlay)).toEqual({ Home: false });
  });

  it("overlay.defaultCollapsedGroups overrides catalogue defaultCollapsed=false", () => {
    // A group that the catalogue wants expanded but the role wants collapsed.
    const groups = [{ label: "Fundraise", defaultCollapsed: false }];
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: [],
      topNavExtras: [],
      sidebarOrder: [],
      defaultCollapsedGroups: ["Fundraise"],
    };
    expect(resolveInitialCollapse(groups, overlay)).toEqual({
      Fundraise: true,
    });
  });

  it("returns an empty map for an empty group list", () => {
    const overlay: RoleMenuOverlay = {
      roleLabel: "test",
      hiddenGroups: [],
      topNavExtras: [],
      sidebarOrder: [],
      defaultCollapsedGroups: ["Anything"],
    };
    expect(resolveInitialCollapse([], overlay)).toEqual({});
  });

  it("keeps every group as a key (no filtering step)", () => {
    const groups = CANONICAL_LABELS.map((label) => ({ label }));
    const overlay = getMenuOverlayForRole({ accountType: "founder" });
    const out = resolveInitialCollapse(groups, overlay);
    expect(Object.keys(out).sort()).toEqual([...CANONICAL_LABELS].sort());
  });
});

describe("ROLE_OVERLAY_TABLE — data-quality invariants", () => {
  // Data-quality sweep — every named role must pass these to survive as a
  // shipped overlay. If a role adds a hiddenGroup that also appears in
  // sidebarOrder (a silent no-op) or lists a defaultCollapsedGroup that
  // never gets rendered, it belongs in this test's failure log.
  const roles = [
    "founder",
    "investor_angel",
    "investor_vc",
    "advisor",
    "accelerator",
    "incubator",
    "reseller",
    "mentor",
    "innovator",
    "journalist",
    "admin",
  ] as const;

  it("every named role has a non-empty roleLabel", () => {
    for (const key of roles) {
      const o =
        key === "admin"
          ? getMenuOverlayForRole({ role: "admin" })
          : getMenuOverlayForRole({ accountType: key });
      expect(o.roleLabel.length, `${key}.roleLabel`).toBeGreaterThan(0);
    }
  });

  it("no role lists a group as hidden AND in sidebarOrder", () => {
    for (const key of roles) {
      const o =
        key === "admin"
          ? getMenuOverlayForRole({ role: "admin" })
          : getMenuOverlayForRole({ accountType: key });
      const hidden = new Set(o.hiddenGroups);
      for (const label of o.sidebarOrder) {
        expect(
          hidden.has(label),
          `${key} lists ${label} as both hidden and ordered — silent no-op`,
        ).toBe(false);
      }
    }
  });

  it("every role's defaultCollapsedGroups is a subset of sidebarOrder", () => {
    // A collapsed group that never renders is a copy bug — either drop it
    // from defaultCollapsedGroups or add it to sidebarOrder.
    for (const key of roles) {
      const o =
        key === "admin"
          ? getMenuOverlayForRole({ role: "admin" })
          : getMenuOverlayForRole({ accountType: key });
      const ordered = new Set(o.sidebarOrder);
      for (const label of o.defaultCollapsedGroups) {
        expect(
          ordered.has(label),
          `${key} collapses ${label} but never orders it`,
        ).toBe(true);
      }
    }
  });

  it("no role's sidebarOrder contains duplicates", () => {
    for (const key of roles) {
      const o =
        key === "admin"
          ? getMenuOverlayForRole({ role: "admin" })
          : getMenuOverlayForRole({ accountType: key });
      expect(new Set(o.sidebarOrder).size, `${key}.sidebarOrder dup`).toBe(
        o.sidebarOrder.length,
      );
    }
  });

  it("no role's hiddenGroups contains duplicates", () => {
    for (const key of roles) {
      const o =
        key === "admin"
          ? getMenuOverlayForRole({ role: "admin" })
          : getMenuOverlayForRole({ accountType: key });
      expect(new Set(o.hiddenGroups).size, `${key}.hiddenGroups dup`).toBe(
        o.hiddenGroups.length,
      );
    }
  });

  it("every topNavExtra has a non-empty href + label", () => {
    for (const key of roles) {
      const o =
        key === "admin"
          ? getMenuOverlayForRole({ role: "admin" })
          : getMenuOverlayForRole({ accountType: key });
      for (const extra of o.topNavExtras) {
        expect(extra.href.length, `${key} extra.href`).toBeGreaterThan(0);
        expect(extra.href.startsWith("/"), `${key} extra.href absolute`).toBe(
          true,
        );
        expect(extra.label.length, `${key} extra.label`).toBeGreaterThan(0);
      }
    }
  });
});
