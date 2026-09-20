// Colocated guard for the shared footer columns (G17 D5, 2026-09-19; was
// G11 T0238). The footer is the one place the depth that left the five-entry
// bar still surfaces on every page — the money rail, the free tools, the
// case studies, the docs rows — so every one of those hrefs is pinned here,
// and every href must resolve to a page on disk (D7: nothing may 404).

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { FOOTER_COLUMNS } from "./footer-columns";
import { MENU } from "@/components/landing/nav-v2";

function column(title: string) {
  const col = FOOTER_COLUMNS.find((c) => c.title === title);
  if (!col) throw new Error(`missing footer column ${title}`);
  return col;
}

const APP_DIR = resolve(__dirname, "../../app");

/**
 * Does `src/app/**` hold a page for this path? Route groups are ignored and
 * query/hash stripped; the legal docs are one `[doc]` route whose
 * `generateStaticParams` lists terms / privacy / disclaimers.
 */
function pageExists(href: string): boolean {
  const path = href.split(/[?#]/)[0]!;
  const segs = path.split("/").filter(Boolean);
  const groups = ["", "(marketing)", "(app)"];
  if (groups.some((g) => existsSync(resolve(APP_DIR, g, ...segs, "page.tsx")))) return true;
  const dynamic = [...segs.slice(0, -1), "[doc]"];
  return groups.some((g) => existsSync(resolve(APP_DIR, g, ...dynamic, "page.tsx")));
}

describe("FOOTER_COLUMNS — four columns (G17 D5)", () => {
  it("is exactly Product · For · Company · Legal, in that order", () => {
    expect(FOOTER_COLUMNS.map((c) => c.title)).toEqual(["Product", "For", "Company", "Legal"]);
  });

  it("Product leads with the intro page and the samples, then keeps the money rail, tools, pricing and docs", () => {
    const product = column("Product").items.map((i) => i.href);
    expect(product.slice(0, 2)).toEqual(["/product", "/samples"]);
    expect(product).toEqual(
      expect.arrayContaining([
        "/features",
        "/how-it-works",
        "/methodology",
        "/startup-index",
        "/funding",
        "/funding/grants",
        "/funding/programs",
        "/tools",
        "/pricing",
        "/docs",
      ]),
    );
    // Every entry of the bar (G21 P0-B: seven plain links) is also somewhere
    // in the footer — Product for the product links, For for the personas.
    const everywhere = FOOTER_COLUMNS.flatMap((c) => c.items.map((i) => i.href));
    for (const e of MENU) if (e.kind === "link") expect(everywhere, e.href).toContain(e.href);
  });

  it("For carries the four persona landings (the bar names three; the advisor page lives only here), keeps the pilot (G16-C) and hosts the case studies", () => {
    const forHrefs = column("For").items.map((i) => i.href);
    for (const href of ["/solutions/investor", "/solutions/accelerator", "/solutions/advisor", "/solutions/founder"]) {
      expect(forHrefs, href).toContain(href);
    }
    expect(forHrefs).toEqual(
      expect.arrayContaining(["/pilot", "/showcase/atlassian?step=1", "/showcase", "/compare"]),
    );
    expect(column("For").items.find((i) => i.href === "/showcase/atlassian?step=1")?.label).toMatch(/atlassian/i);
  });

  it("Company carries About · Team · Invest in BlockID (/about/invest, never /investors) · Benchmarks · Insights · Changelog · Roadmap · Status · Contact", () => {
    expect(column("Company").items.map((i) => [i.label, i.href])).toEqual([
      ["About", "/about"],
      ["Team", "/team"],
      ["Invest in BlockID", "/about/invest"],
      ["AU Benchmarks", "/benchmarks"],
      ["Insights", "/insights"],
      ["Changelog", "/changelog"],
      ["Roadmap", "/roadmap"],
      ["Status", "/status"],
      ["Contact", "/contact"],
    ]);
    const all = FOOTER_COLUMNS.flatMap((c) => c.items.map((i) => i.href));
    expect(all).not.toContain("/investors");
  });

  it("Legal keeps the one refund policy (Terms clause 3A) next to Terms, plus the security audit", () => {
    const legal = column("Legal").items.map((i) => i.href);
    expect(legal).toEqual([
      "/legal/terms",
      "/legal/terms#refunds",
      "/legal/privacy",
      "/legal/disclaimers",
      "/security-audit",
    ]);
    expect(column("Legal").items.find((i) => i.href === "/legal/terms#refunds")?.label).toBe("Refunds");
  });

  it("every href resolves to a page.tsx under src/app, is unique, and never needs a session", () => {
    const all = FOOTER_COLUMNS.flatMap((c) => c.items.map((i) => i.href));
    for (const href of all) expect(pageExists(href), href).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(all.some((h) => h.startsWith("/workspace") || h.startsWith("/dashboard"))).toBe(false);
  });
});
