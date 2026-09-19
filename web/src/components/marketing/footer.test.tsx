// Colocated guard for the ONE public footer (G13-W5-IA5).
//
// site/footer.tsx is deleted; what it carried that MarketingFooter lacked
// (brand block, Company column, disclaimer line) now renders here, once.
// The entity strings are pinned verbatim per the business-entity rule:
// marketing footer = PPL Food PTY LTD; Auschain PTY LTD is the legal /
// billing entity and must NOT appear here.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { FOOTER_COLUMNS } from "./footer-columns";
import { Footer, FOOTER_DISCLAIMER, FOOTER_ENTITY, FOOTER_LANGUAGES } from "./footer";

const html = renderToStaticMarkup(<Footer />);

describe("Footer — the one public footer", () => {
  it("renders exactly one <footer> landmark, self-scoped dark, with the sr-only heading", () => {
    expect((html.match(/<footer\b/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<footer[^>]*data-theme="dark"/);
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

  it("entity lines are the marketing entity, verbatim, and never the billing entity", () => {
    expect(FOOTER_ENTITY).toBe("PPL Food PTY LTD");
    expect(html).toContain("PPL Food PTY LTD");
    expect(html).toMatch(/© \d{4} PPL Food PTY LTD/);
    expect(html).not.toMatch(/Auschain/i);
  });

  it("keeps the AU support + residency lines and the disclaimer the legacy footer carried", () => {
    expect(html).toContain("support@blockid.au");
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
