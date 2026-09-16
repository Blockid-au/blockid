// Colocated guard for the shared signed-in menu (G13-W5-IA5).
//
//   • the six-row contract: New analysis · My score · My reports · Dashboard
//     · Settings (+ Sign out rendered by the caller)
//   • New analysis goes straight to /analyze (no /score hop)
//   • Dashboard is the persona landing; admin → founder landing
//   • the two renderers (nav-v2 UserMenu, workspace HeaderAccountMenu) both
//     consume this list — pinned by their own tests against the same rows

import { describe, expect, it } from "vitest";
import { PERSONAS, PERSONA_KEYS } from "./persona";
import { USER_MENU_ITEMS, USER_MENU_SIGN_OUT_LABEL, dashboardHrefFor, userMenuItems } from "./user-menu";

describe("userMenuItems — the one signed-in menu", () => {
  it("renders the five agreed rows in order, then the caller adds Sign out", () => {
    expect(userMenuItems("founder").map((i) => [i.label, i.href])).toEqual([
      ["New analysis", "/analyze"],
      ["My score", "/workspace/score"],
      ["My reports", "/workspace/reports"],
      ["Dashboard", "/dashboard"],
      ["Settings", "/workspace/settings"],
    ]);
    expect(USER_MENU_SIGN_OUT_LABEL).toBe("Sign out");
  });

  it("New analysis no longer hops through /score", () => {
    expect(userMenuItems().find((i) => i.key === "new-analysis")?.href).toBe("/analyze");
    expect(userMenuItems().some((i) => i.href === "/score")).toBe(false);
  });

  it("Dashboard is the persona landing (PERSONAS), admin → founder landing, unknown → founder", () => {
    for (const key of PERSONA_KEYS) {
      const expected = key === "admin" ? PERSONAS.founder.landingHref : PERSONAS[key].landingHref;
      expect(dashboardHrefFor(key), key).toBe(expected);
      expect(userMenuItems(key).find((i) => i.key === "dashboard")?.href, key).toBe(expected);
    }
    expect(dashboardHrefFor(null)).toBe("/dashboard");
    expect(dashboardHrefFor(undefined)).toBe("/dashboard");
    expect(userMenuItems("investor_vc").find((i) => i.key === "dashboard")?.href).toBe("/workspace/investor");
    expect(userMenuItems("accelerator").find((i) => i.key === "dashboard")?.href).toBe("/workspace/accelerator");
  });

  it("keys, icons and hrefs are unique and rooted; every row has an icon key its renderers map", () => {
    const items = userMenuItems("advisor");
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
    for (const i of items) {
      expect(i.href.startsWith("/"), i.href).toBe(true);
      expect(i.icon).toBe(i.key);
    }
  });

  it("USER_MENU_ITEMS is the frozen founder default (static headers before the persona resolves)", () => {
    expect(Object.isFrozen(USER_MENU_ITEMS)).toBe(true);
    expect([...USER_MENU_ITEMS]).toEqual(userMenuItems("founder"));
  });
});
