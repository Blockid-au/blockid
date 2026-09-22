// Colocated guard for the ONE public footer (G13-W5-IA5).
//
// site/footer.tsx is deleted; what it carried that MarketingFooter lacked
// (brand block, Company column, disclaimer line) now renders here, once.
// Entity lines (G21 P0-A): the brand block names the marketing operator and
// the bottom row renders `marketingLine()` from lib/site/legal-entity, so
// both roles — marketing operator and seller of record with its ABN — are
// explicit on every page. No entity literal is spelled out here; the
// config's own guard test forbids literals outside the config.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { FOOTER_COLUMNS } from "./footer-columns";
import { Footer, FOOTER_DISCLAIMER, FOOTER_ENTITY, FOOTER_LANGUAGES } from "./footer";
import { LEGAL_ENTITY, LEGAL_ENTITY_ABN_LABEL, marketingLine } from "@/lib/site/legal-entity";

const html = renderToStaticMarkup(<Footer />);

describe("Footer — the one public footer", () => {
  it("renders exactly one <footer> landmark on the LIGHT sunken ground (G26 — no dark scope), with the sr-only heading", () => {
    expect((html.match(/<footer\b/g) ?? []).length).toBe(1);
    expect(html).not.toMatch(/<footer[^>]*data-theme=/);
    expect(html).toMatch(/<footer[^>]*data-tone="sunken"[^>]*class="[^"]*bg-surface-sunken/);
    expect(html).not.toMatch(/\[&_img\]:invert/);
    expect(html).toContain('aria-labelledby="marketing-footer-heading"');
    expect(html).toContain("Site footer");
  });

  it("carries every column from footer-columns.ts — the four G17 columns — plus the EN / VI language links", () => {
    for (const col of FOOTER_COLUMNS) {
      expect(html, col.title).toContain(`>${col.title}<`);
      for (const item of col.items) expect(html, item.href).toContain(`href="${item.href}"`);
    }
    expect(FOOTER_COLUMNS.map((c) => c.title)).toEqual(["Product", "For", "Company", "Legal"]);
    expect(FOOTER_LANGUAGES.map((l) => l.href)).toEqual(["/", "/vi"]);
    expect(html).toMatch(/<a[^>]*hrefLang="vi"[^>]*href="\/vi"|<a[^>]*href="\/vi"[^>]*hrefLang="vi"|hreflang="vi"/i);
    expect(html).toContain("Tiếng Việt");
    expect(html).toMatch(/aria-label="Language"/);
  });

  it("entity lines come from the config: marketing operator in the brand block, marketingLine() (both roles) in the bottom row", () => {
    expect(FOOTER_ENTITY).toBe(LEGAL_ENTITY.marketingOperator);
    expect(html).toContain(LEGAL_ENTITY.marketingOperator);
    const year = new Date().getUTCFullYear();
    const line = marketingLine(year);
    expect(html).toContain(line.replace(/&/g, "&amp;"));
    expect(html).toMatch(/data-testid="footer-entity-line"[^>]*>©/);
    // Both roles are explicit — the seller of record with its ABN sits next to the marketing operator.
    expect(html).toContain(LEGAL_ENTITY.operator);
    expect(html).toContain(LEGAL_ENTITY_ABN_LABEL);
  });

  it("carries the Samples, Docs and For Advisors rows (moved out of the top nav by G21 P0-B)", () => {
    for (const href of ["/samples", "/docs", "/solutions/advisor"]) {
      expect(FOOTER_COLUMNS.some((c) => c.items.some((i) => i.href === href)), href).toBe(true);
    }
  });

  it("keeps the AU support + residency lines and the disclaimer the legacy footer carried", () => {
    expect(html).toContain("admin@blockid.au");
    expect(html).toContain("AU-based support");
    expect(html).toContain("AU Privacy Act 1988 compliant · AU data residency");
    expect(html).toContain("AU data residency. AU Privacy Act 1988 compliant.");
    expect(FOOTER_DISCLAIMER).toBe("Not financial advice. BlockID is a software platform — engage a licensed adviser for your raise.");
    expect(html).toContain(FOOTER_DISCLAIMER);
  });

  it("stamps the LIVE version as a changelog link (the legacy footer hard-coded v3.10.0)", () => {
    expect(html).not.toContain("v3.10.0");
    expect(html).toMatch(/aria-label="View changelog for release v\d[^"]*"[^>]*href="\/changelog"/);
  });

  it("the legacy footers are gone from disk", () => {
    const components = resolve(__dirname, "..");
    expect(existsSync(resolve(components, "site/footer.tsx"))).toBe(false);
    expect(existsSync(resolve(components, "marketing/marketing-footer.tsx"))).toBe(false);
    expect(existsSync(resolve(components, "site/navbar.tsx"))).toBe(false);
  });
});
