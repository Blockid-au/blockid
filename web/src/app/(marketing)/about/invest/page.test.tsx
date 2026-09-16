// /about/invest — the invest-in-BlockID pitch after the S-IA5 public rename
// (spec §A.4 / §C.2, founder decision F2). Pins: own canonical, title ≤ 65
// rendered, description 70–165, one WebPage JSON-LD with the About →
// Invest breadcrumb, a single H1, and that the page mounts inside the
// MarketingShell (one header, one footer) with no link back to /investors.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";
import { renderedTitle } from "@/lib/seo/page-meta";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <div data-marketing-shell>{children}</div>,
}));

import InvestInBlockIdPage, { INVEST_PATH, metadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/about/invest — invest in BlockID (S-IA5)", () => {
  it("metadata: canonical /about/invest, rendered title ≤ 65, description 70–165, indexable", () => {
    expect(INVEST_PATH).toBe("/about/invest");
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/about/invest");
    const title = renderedTitle(metadata.title);
    expect(title).toMatch(/^Invest in BlockID/);
    expect(title.length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeGreaterThanOrEqual(70);
    expect(String(metadata.description).length).toBeLessThanOrEqual(165);
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect((metadata.openGraph as { url?: string }).url).toBe("https://blockid.au/about/invest");
  });

  it("renders inside the MarketingShell with one H1, a WebPage JSON-LD carrying the About › Invest breadcrumb, and no /investors links", async () => {
    const out = await html(<InvestInBlockIdPage />);
    expect(out).toContain("data-marketing-shell");
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    const blocks = extractJsonLd(out);
    const webPage = blocks.find((b) => b["@type"] === "WebPage");
    expect(webPage).toBeDefined();
    expect(validateJsonLd(webPage)).toEqual({ ok: true, errors: [] });
    expect(webPage!.url).toBe("https://blockid.au/about/invest");
    const crumbs = (webPage!.breadcrumb as { itemListElement: Array<{ item: string }> }).itemListElement.map((c) => c.item);
    expect(crumbs).toEqual(["https://blockid.au/about", "https://blockid.au/about/invest"]);
    expect(out).not.toMatch(/href="\/investors"/);
    // The pitch keeps its live price ladder (T0274) and the contact CTA.
    expect(out).toContain("Trusted Business Report");
    expect(out).toContain('href="/contact"');
  });
});
