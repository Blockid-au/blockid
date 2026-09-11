// Colocated guard for the public menu (G11 T0238, money-finder plan §3a).
//
// `MENU` is the single source of the primary navigation — site/navbar.tsx
// derives its items from it — so its shape is a contract with the E2E spec
// (tests/e2e/nav/menu-structure.spec.ts pins "<= 7 top-level entries" and a
// Demo dropdown BUTTON whose first item is the Atlassian journey) and with
// the footers, which now carry everything that left the bar.

import { describe, expect, it } from "vitest";
import { MENU, NEED_MONEY_CTA, WORKSPACE_LINK, type MenuGroup } from "./nav-v2";

function group(key: string): MenuGroup {
  const entry = MENU.find((e) => e.key === key);
  if (!entry || entry.kind !== "group") throw new Error(`${key} is not a group`);
  return entry;
}

function flatHrefs(g: MenuGroup): string[] {
  return g.sections
    ? g.sections.flatMap((s) => s.items.map((i) => i.href))
    : g.items.map((i) => i.href);
}

describe("MENU (public primary nav)", () => {
  it("has exactly five entries in founder reading order", () => {
    expect(MENU.map((e) => e.label)).toEqual([
      "Get my score",
      "Get funding",
      "Free tools",
      "Pricing",
      "Demo",
    ]);
    expect(MENU.length).toBeLessThanOrEqual(7);
  });

  it("Get my score and Pricing are plain links", () => {
    expect(MENU[0]).toMatchObject({ kind: "link", href: "/analyze" });
    expect(MENU.find((e) => e.key === "pricing")).toMatchObject({
      kind: "link",
      href: "/pricing",
    });
  });

  it("Get funding is the money rail with the five agreed targets", () => {
    const funding = group("funding");
    expect(funding.items.map((i) => [i.label, i.href])).toEqual([
      ["Grants for my startup", "/funding/grants"],
      ["Startup programs by city", "/funding/programs"],
      ["Do you need money?", "/funding"],
      ["Investor readiness", "/tools/funding-plan"],
      ["R&D Tax & ESIC", "/tools/rnd-tax"],
    ]);
  });

  it("Free tools is trimmed to eight tools plus the /tools catalogue link", () => {
    const tools = group("tools");
    const hrefs = flatHrefs(tools);
    const toolPages = hrefs.filter((h) => h.startsWith("/tools/"));
    expect(toolPages).toHaveLength(8);
    expect(new Set(toolPages).size).toBe(8);
    expect(toolPages).toEqual(
      expect.arrayContaining([
        "/tools/idea-valuation",
        "/tools/idea-lab",
        "/tools/safe-calculator",
        "/tools/cap-table",
        "/tools/dilution",
        "/tools/funding-plan",
        "/tools/esic",
        "/tools/rnd-tax",
      ]),
    );
    const last = tools.sections!.at(-1)!.items.at(-1)!;
    expect(last.href).toBe("/tools");
    expect(last.label).toMatch(/all 16 tools/i);
  });

  it("Demo stays a dropdown group led by the Atlassian journey", () => {
    const demo = MENU.at(-1)!;
    expect(demo.kind).toBe("group");
    expect(demo.label).toBe("Demo");
    const items = group("demo").items;
    expect(items[0]).toEqual({
      label: "Atlassian journey (live)",
      href: "/showcase/atlassian?step=1",
    });
    expect(items.at(-1)).toEqual({ label: "All case studies", href: "/showcase" });
  });

  it("no longer carries the entries that moved to the footer", () => {
    const labels = MENU.map((e) => e.label);
    for (const gone of ["Product", "For", "Startup Index", "Docs", "Team", "Features"]) {
      expect(labels).not.toContain(gone);
    }
    // Nothing in the public bar may point into the authenticated workspace.
    const every = MENU.flatMap((e) => (e.kind === "link" ? [e.href] : flatHrefs(e)));
    expect(every.some((h) => h.startsWith("/workspace") || h.startsWith("/dashboard"))).toBe(false);
  });
});

describe("nav CTAs", () => {
  it("primary CTA is 'Do you need money?' with the money intent, not /onboarding", () => {
    expect(NEED_MONEY_CTA).toEqual({
      label: "Do you need money?",
      href: "/funding?intent=money",
      ctaId: "need_money",
    });
  });

  it("signed-in users get My workspace → /dashboard", () => {
    expect(WORKSPACE_LINK).toEqual({ label: "My workspace", href: "/dashboard" });
  });
});

// G7 Q2 (S19-A, decision adopted 2026-09-11): Demo is a top-nav entry on
// every page — never a floating CTA. `MENU` is rendered by NavV2 (public
// MarketingShell) and site/navbar (app + docs), and the workspace topbar
// carries its own Demo link (pinned by tests/e2e/nav/menu-structure.spec.ts),
// so pinning the entry here covers the whole site.
describe("G7 Q2 — Demo placement", () => {
  it("Demo is a top-nav entry linking to the Atlassian walkthrough", () => {
    const demo = MENU.find((e) => e.key === "demo");
    expect(demo).toBeDefined();
    expect(demo!.kind).toBe("group");
    expect(group("demo").items[0].href).toBe("/showcase/atlassian?step=1");
  });

  it("no floating / fixed Demo CTA is declared alongside the menu", () => {
    // Only the two CTAs the nav knows about exist; a floating Demo CTA
    // would need a new export here first (Q2: "ship top-nav link first").
    expect(NEED_MONEY_CTA.label).not.toMatch(/demo/i);
    expect(WORKSPACE_LINK.label).not.toMatch(/demo/i);
    expect(MENU.filter((e) => e.label === "Demo")).toHaveLength(1);
  });
});
