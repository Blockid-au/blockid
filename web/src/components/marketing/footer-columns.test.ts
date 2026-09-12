// Colocated guard for the shared footer columns (G11 T0238). The footers
// are now the only public surface for Product / For / Docs / Startup Index,
// and the Funding column must mirror the "Get funding" dropdown.

import { describe, expect, it } from "vitest";
import { FOOTER_COLUMNS } from "./footer-columns";
import { MENU } from "@/components/landing/nav-v2";

function column(title: string) {
  const col = FOOTER_COLUMNS.find((c) => c.title === title);
  if (!col) throw new Error(`missing footer column ${title}`);
  return col;
}

describe("FOOTER_COLUMNS", () => {
  it("leads with a Funding column that mirrors the Get funding dropdown", () => {
    expect(FOOTER_COLUMNS[0].title).toBe("Funding");
    const hrefs = column("Funding").items.map((i) => i.href);
    expect(hrefs).toEqual([
      "/funding/grants",
      "/funding/programs",
      "/funding",
      "/tools/rnd-tax",
      "/tools/esic",
      "/insights/non-dilutive-funding-strategies-australia",
    ]);
    const funding = MENU.find((e) => e.key === "funding");
    expect(funding?.kind).toBe("group");
    if (funding?.kind === "group") {
      for (const h of ["/funding/grants", "/funding/programs", "/funding", "/tools/rnd-tax"]) {
        expect(funding.items.map((i) => i.href)).toContain(h);
      }
    }
  });

  it("absorbs the entries that left the top nav", () => {
    const product = column("Product").items.map((i) => i.href);
    expect(product).toEqual(
      expect.arrayContaining(["/features", "/startup-index", "/solutions/founder#captable"]),
    );
    expect(column("For").items.map((i) => i.href)).toEqual([
      "/solutions/founder",
      "/solutions/investor",
      "/solutions/advisor",
      "/solutions/accelerator",
    ]);
    expect(column("Docs").items.map((i) => i.href)).toEqual(
      expect.arrayContaining(["/changelog", "/roadmap", "/team", "/status", "/security-audit"]),
    );
  });

  it("links the comparison page from the Docs column (T0274)", () => {
    const compare = column("Docs").items.find((i) => i.href === "/compare");
    expect(compare?.label).toBe("Compare");
  });

  it("links nowhere that needs a session", () => {
    const all = FOOTER_COLUMNS.flatMap((c) => c.items.map((i) => i.href));
    expect(all.some((h) => h.startsWith("/workspace") || h.startsWith("/dashboard"))).toBe(false);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("FOOTER_COLUMNS — Legal column (QA-3, 2026-09-12)", () => {
  it("links the one refund policy (Terms clause 3A) next to Terms", () => {
    const legal = column("Legal").items.map((i) => i.href);
    expect(legal).toEqual([
      "/legal/terms",
      "/legal/terms#refunds",
      "/legal/privacy",
      "/legal/disclaimers",
    ]);
    expect(column("Legal").items.find((i) => i.href === "/legal/terms#refunds")?.label).toBe("Refunds");
  });
});
