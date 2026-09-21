// Colocated test for /product (G17 D4). The homepage's old depth lives here
// under the SAME section ids, so `/product#worth` etc. resolve; the page is
// built from the template primitives (one h1, Section h2s, CtaBand) and
// carries `pageMetadata` within the sweep budgets.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { renderedTitle } from "@/lib/seo/page-meta";
import { PRODUCT_SECTION_IDS, productAnchor } from "./product-content";
import ProductPage, { metadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/product — the intro page", () => {
  it("metadata: canonical /product, title ≤ 60 with the brand, description 140–160", () => {
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/product");
    const title = renderedTitle(metadata.title);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toMatch(/BlockID\.au$/);
    const d = String(metadata.description);
    expect(d.length).toBeGreaterThanOrEqual(140);
    expect(d.length).toBeLessThanOrEqual(160);
  });

  it("renders exactly one h1 and every legacy homepage section id (worth, state, journey, next, unlock) with its h2", async () => {
    const out = await html(<ProductPage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(PRODUCT_SECTION_IDS).toEqual(["worth", "state", "journey", "next", "unlock"]);
    for (const id of PRODUCT_SECTION_IDS) {
      expect(out, id).toMatch(new RegExp(`<section[^>]*id="${id}"`));
      expect(out, `${id}-heading`).toContain(`id="${id}-heading"`);
    }
    expect(productAnchor("worth")).toBe("/product#worth");
  });

  it("re-homes the homepage components: valuation ranges, radar + table, journey path, data-room build, unlock preview", async () => {
    const out = await html(<ProductPage />);
    expect(out).toContain("One range, not one number.");
    expect(out).toContain("Eight dimensions, against Australian companies at your stage.");
    expect(out).toContain("Twelve phases. A run tells you which one you are in.");
    expect(out).toContain("The room an investor asks to see.");
    expect(out).toContain('data-testid="unlock-preview"');
    expect(out).toMatch(/<svg/); // the radar / ranges are inline SVG
    expect(out).not.toMatch(/data-theme="dark"/); // G26: no dark punctuation — the journey band is sunken
    expect(out).toMatch(/<section[^>]*id="journey"[^>]*data-tone="sunken"/);
  });

  it("links: /analyze, /samples, /one-click-report, /guide/scn, the growth-phases walkthrough, /pricing", async () => {
    const out = await html(<ProductPage />);
    for (const href of ["/analyze", "/samples", "/one-click-report", "/guide/scn", "/showcase/atlassian/growth-phases", "/pricing"]) {
      expect(out, href).toContain(`href="${href}"`);
    }
  });
});
