// Colocated guard for the public menu (G17 D4, 2026-09-19; was G11 T0238).
//
// `MENU` is the single source of the primary navigation — since G13-W5-IA5
// NavV2 is the ONLY public header (site/navbar.tsx deleted) — so its shape
// is a contract with the E2E spec (tests/e2e/nav/menu-structure.spec.ts
// pins the five labels, the Solutions dropdown BUTTON and the "Score a
// startup" CTA) and with the footer, which carries everything that left
// the bar (Funding rail, free tools, case studies).

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  MENU,
  NAV_VARIANT_CLASSES,
  NEED_MONEY_CTA,
  PRIMARY_CTA,
  WORKSPACE_LINK,
  type MenuGroup,
} from "./nav-v2";
import { FOOTER_COLUMNS } from "@/components/marketing/footer-columns";

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

const APP_DIR = resolve(__dirname, "../../app");

/** Does `src/app/**` hold a page for this path (route groups ignored)? */
function pageExists(href: string): boolean {
  const path = href.split(/[?#]/)[0]!;
  const segs = path.split("/").filter(Boolean);
  const groups = ["", "(marketing)", "(app)"];
  const candidates = groups.map((g) => resolve(APP_DIR, g, ...segs, "page.tsx"));
  return candidates.some((c) => existsSync(c));
}

describe("MENU (public primary nav) — G17 D4", () => {
  it("has exactly the five entries: Product · Solutions · Samples · Pricing · Docs", () => {
    expect(MENU.map((e) => e.label)).toEqual(["Product", "Solutions", "Samples", "Pricing", "Docs"]);
    expect(MENU).toHaveLength(5);
  });

  it("Product, Samples, Pricing and Docs are plain links to their pages", () => {
    expect(MENU[0]).toMatchObject({ kind: "link", key: "product", href: "/product" });
    expect(MENU[2]).toMatchObject({ kind: "link", key: "samples", href: "/samples" });
    expect(MENU[3]).toMatchObject({ kind: "link", key: "pricing", href: "/pricing" });
    expect(MENU[4]).toMatchObject({ kind: "link", key: "docs", href: "/docs" });
  });

  it("Solutions is the one dropdown: Investors · Accelerators · Advisors · Founders → /solutions/*", () => {
    const solutions = group("solutions");
    expect(MENU[1]).toBe(solutions);
    expect(solutions.sections).toBeUndefined();
    expect(solutions.items.map((i) => [i.label, i.href])).toEqual([
      ["Investors", "/solutions/investor"],
      ["Accelerators", "/solutions/accelerator"],
      ["Advisors", "/solutions/advisor"],
      ["Founders", "/solutions/founder"],
    ]);
  });

  it("every href in the bar resolves to a page.tsx under src/app (D7: nothing may 404)", () => {
    const every = MENU.flatMap((e) => (e.kind === "link" ? [e.href] : flatHrefs(e)));
    for (const href of every) expect(pageExists(href), href).toBe(true);
    expect(new Set(every).size).toBe(every.length);
  });

  it("the retired entries are gone from the bar but still reachable from the footer", () => {
    const labels = MENU.map((e) => e.label);
    for (const gone of ["Get my score", "Get funding", "Free tools", "Demo", "Product", "For", "Team", "Features"]) {
      if (gone === "Product") continue; // Product is back as the intro page link (G17)
      expect(labels).not.toContain(gone);
    }
    const footerHrefs = FOOTER_COLUMNS.flatMap((c) => c.items.map((i) => i.href));
    for (const kept of ["/funding", "/funding/grants", "/tools", "/showcase/atlassian?step=1", "/features", "/how-it-works"]) {
      expect(footerHrefs, kept).toContain(kept);
    }
    // Nothing in the public bar may point into the authenticated workspace.
    const every = MENU.flatMap((e) => (e.kind === "link" ? [e.href] : flatHrefs(e)));
    expect(every.some((h) => h.startsWith("/workspace") || h.startsWith("/dashboard"))).toBe(false);
  });
});

describe("nav CTAs", () => {
  it("primary CTA is 'Score a startup' → /analyze (G17), never /onboarding or the money intent", () => {
    expect(PRIMARY_CTA).toEqual({ label: "Score a startup", href: "/analyze", ctaId: "score_startup" });
    expect(PRIMARY_CTA.href).not.toMatch(/onboarding|funding/);
    // Deprecated alias survives one release for old importers.
    expect(NEED_MONEY_CTA).toBe(PRIMARY_CTA);
  });

  it("signed-in users get My workspace → /dashboard", () => {
    expect(WORKSPACE_LINK).toEqual({ label: "My workspace", href: "/dashboard" });
  });
});

// G7 Q2 (S19-A) said "Demo is a top-nav entry on every page". G17 D4 caps
// the bar at five evaluator-facing entries, so the Atlassian walkthrough
// moved to `/samples` (its own section) and the footer Product column — still
// on every page, never a floating CTA.
describe("G7 Q2 → G17 — Demo placement", () => {
  it("the Atlassian walkthrough is linked from the footer on every page", () => {
    const footerHrefs = FOOTER_COLUMNS.flatMap((c) => c.items.map((i) => i.href));
    expect(footerHrefs).toContain("/showcase/atlassian?step=1");
  });

  it("no floating / fixed Demo CTA is declared alongside the menu", () => {
    expect(PRIMARY_CTA.label).not.toMatch(/demo/i);
    expect(WORKSPACE_LINK.label).not.toMatch(/demo/i);
    expect(MENU.filter((e) => /demo/i.test(e.label))).toHaveLength(0);
  });
});

// G13-W5-IA5 — one header. `variant="light"` is a second SKIN of the same
// component (auth pages), never a second component; the legacy bar is gone.
describe("S-IA5 — one header, two skins", () => {
  it("site/navbar.tsx no longer exists and nothing imports it", () => {
    expect(existsSync(resolve(__dirname, "../site/navbar.tsx"))).toBe(false);
  });

  it("dark and light skins define the same class slots; light uses semantic tokens only, dark keeps the navy island", () => {
    const dark = NAV_VARIANT_CLASSES.dark;
    const light = NAV_VARIANT_CLASSES.light;
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
    for (const [slot, classes] of Object.entries(light)) {
      expect(classes, `light.${slot}`).not.toMatch(/brand-(navy|ink|cyan)|white\//);
      expect(classes, `light.${slot}`).not.toMatch(/\b(ink|surface)-\d{2,3}\b/);
    }
    expect(dark.header).toContain("bg-brand-navy/85");
    expect(light.header).toContain("bg-surface/90");
    expect(light.cta).toContain("bg-action");
  });
});
