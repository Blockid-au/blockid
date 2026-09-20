// Colocated guard for the public menu (G21 P0-B, 2026-09-20; was G17 D4 /
// G11 T0238).
//
// `MENU` is the single source of the primary navigation — since G13-W5-IA5
// NavV2 is the ONLY public header (site/navbar.tsx deleted) — so its shape
// is a contract with the E2E spec (tests/e2e/nav/menu-structure.spec.ts
// pins the seven labels, no dropdown, and the "Run a cohort pilot" CTA)
// and with the footer, which carries everything that left the bar
// (Samples, Docs, the advisor landing, Funding rail, free tools, case
// studies).

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

const G21_MENU: ReadonlyArray<[string, string, string]> = [
  ["product", "Product", "/product"],
  ["programs", "For Programs", "/solutions/accelerator"],
  ["investors", "For Investors", "/solutions/investor"],
  ["founders", "For Founders", "/solutions/founder"],
  ["methodology", "Methodology", "/methodology"],
  ["startup-index", "Startup Index", "/startup-index"],
  ["pricing", "Pricing", "/pricing"],
];

describe("MENU (public primary nav) — G21 P0-B", () => {
  it("has exactly the seven entries, in order: Product · For Programs · For Investors · For Founders · Methodology · Startup Index · Pricing", () => {
    expect(MENU.map((e) => e.label)).toEqual(G21_MENU.map(([, label]) => label));
    expect(MENU).toHaveLength(7);
  });

  it("every entry is a plain link to its page — no dropdown in the bar", () => {
    expect(MENU.every((e) => e.kind === "link")).toBe(true);
    for (const [i, [key, label, href]] of G21_MENU.entries()) {
      expect(MENU[i], label).toMatchObject({ kind: "link", key, label, href });
    }
  });

  it("the three personas are named in the bar (programs / investors / founders); the advisor landing moved to the footer", () => {
    const hrefs = MENU.map((e) => (e.kind === "link" ? e.href : ""));
    expect(hrefs).toContain("/solutions/accelerator");
    expect(hrefs).toContain("/solutions/investor");
    expect(hrefs).toContain("/solutions/founder");
    expect(hrefs).not.toContain("/solutions/advisor");
    const footerHrefs = FOOTER_COLUMNS.flatMap((c) => c.items.map((i) => i.href));
    expect(footerHrefs).toContain("/solutions/advisor");
  });

  it("every href in the bar resolves to a page.tsx under src/app (D7: nothing may 404)", () => {
    const every = MENU.flatMap((e) => (e.kind === "link" ? [e.href] : flatHrefs(e)));
    for (const href of every) expect(pageExists(href), href).toBe(true);
    expect(new Set(every).size).toBe(every.length);
  });

  it("the retired entries are gone from the bar but still reachable from the footer", () => {
    const labels = MENU.map((e) => e.label);
    for (const gone of ["Get my score", "Get funding", "Free tools", "Demo", "For", "Team", "Features", "Solutions", "Samples", "Docs"]) {
      expect(labels).not.toContain(gone);
    }
    const footerHrefs = FOOTER_COLUMNS.flatMap((c) => c.items.map((i) => i.href));
    for (const kept of ["/samples", "/docs", "/funding", "/funding/grants", "/tools", "/showcase/atlassian?step=1", "/features", "/how-it-works"]) {
      expect(footerHrefs, kept).toContain(kept);
    }
    // Nothing in the public bar may point into the authenticated workspace.
    const every = MENU.flatMap((e) => (e.kind === "link" ? [e.href] : flatHrefs(e)));
    expect(every.some((h) => h.startsWith("/workspace") || h.startsWith("/dashboard"))).toBe(false);
    // No price anchor anywhere in the bar (G21 rule: no A$ in hero / nav / OG).
    expect(JSON.stringify(MENU)).not.toMatch(/A\$/);
    expect(JSON.stringify(PRIMARY_CTA)).not.toMatch(/A\$/);
  });
});

describe("nav CTAs", () => {
  it("primary CTA is 'Run a cohort pilot' → /solutions/accelerator#pilot (G21 P0-B), never /onboarding or the money intent", () => {
    expect(PRIMARY_CTA).toEqual({ label: "Run a cohort pilot", href: "/solutions/accelerator#pilot", ctaId: "run_cohort_pilot" });
    expect(PRIMARY_CTA.href).not.toMatch(/onboarding|funding/);
    expect(pageExists(PRIMARY_CTA.href)).toBe(true);
    // Deprecated alias survives one release for old importers.
    expect(NEED_MONEY_CTA).toBe(PRIMARY_CTA);
  });

  it("signed-in users get My workspace → /dashboard", () => {
    expect(WORKSPACE_LINK).toEqual({ label: "My workspace", href: "/dashboard" });
  });
});

// G7 Q2 (S19-A) said "Demo is a top-nav entry on every page". G17 D4 capped
// the bar (G21 P0-B: seven persona-facing links), so the Atlassian
// walkthrough lives on `/samples` (its own section) and in the footer Product
// column — still on every page, never a floating CTA.
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
