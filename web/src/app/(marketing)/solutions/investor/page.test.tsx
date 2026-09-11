// S8-A metadata + JSON-LD test for /solutions/investor. The marketing shell
// is mocked (NavV2 needs an app-router context); rendered through
// renderToReadableStream so the async JSON-LD components resolve.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import SolutionsInvestorPage, { generateMetadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/solutions/investor — SEO (S8-A)", () => {
  it("metadata: ≤ 60 title without a doubled brand, 140–160 description, hreflang pair, OG image", async () => {
    const meta = await generateMetadata();
    expect(String(meta.title)).toBe("Startup due diligence for investors, in minutes");
    expect(`${String(meta.title)} | BlockID.au`.length).toBeLessThanOrEqual(60);
    expect(String(meta.description).length).toBeGreaterThanOrEqual(140);
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
    expect(meta.alternates?.canonical).toBe("https://blockid.au/solutions/investor");
    expect(meta.alternates?.languages).toEqual({
      en: "https://blockid.au/solutions/investor",
      vi: "https://blockid.au/vi/solutions/investor",
      "x-default": "https://blockid.au/solutions/investor",
    });
    expect((meta.openGraph as { images?: unknown[] }).images).toHaveLength(1);
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it("emits one valid FAQPage + one BreadcrumbList and a single H1; no unresolved price tokens", async () => {
    const out = await html(await SolutionsInvestorPage());
    const blocks = extractJsonLd(out);
    expect(blocks.filter((b) => b["@type"] === "FAQPage")).toHaveLength(1);
    expect(blocks.filter((b) => b["@type"] === "BreadcrumbList")).toHaveLength(1);
    for (const b of blocks) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(out).not.toMatch(/\{[a-zA-Z]+\}/);
  });
});
