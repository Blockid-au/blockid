// Colocated test for /how-it-works — G14-S36: the eight dimension cards are
// rendered from DIMENSION_OWNERS, so the public names equal the engine's
// (the page used to carry its own array with different titles). The
// marketing shell mounts NavV2 → useRouter(), so it is mocked to a
// pass-through (same pattern as ../compare/page.test.tsx).

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { DIMENSION_OWNERS, DIM_LEGACY_ORDER } from "@/lib/report-pipeline/dimension-owners";
import { renderedTitle } from "@/lib/seo/page-meta";
import { HOW_IT_WORKS_DIMENSIONS, HOW_IT_WORKS_STEPS } from "./how-it-works-content";
import HowItWorksPage, { metadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;");

describe("/how-it-works — dimension cards read the engine table", () => {
  it("HOW_IT_WORKS_DIMENSIONS titles === DIMENSION_OWNERS[*].title, eight of them, legacy order", () => {
    expect(HOW_IT_WORKS_DIMENSIONS).toHaveLength(8);
    expect(HOW_IT_WORKS_DIMENSIONS.map((d) => d.key)).toEqual([...DIM_LEGACY_ORDER]);
    for (const d of HOW_IT_WORKS_DIMENSIONS) {
      expect(d.title).toBe(DIMENSION_OWNERS[d.key].title);
      expect(d.code).toBe(d.key.toUpperCase());
      expect(d.body.length).toBeGreaterThan(20);
    }
    // The pre-S36 private names must be gone.
    const titles = HOW_IT_WORKS_DIMENSIONS.map((d) => d.title);
    expect(titles).not.toContain("Technology-Readiness Evidence (TRE)");
    expect(titles).toContain(DIMENSION_OWNERS.tre.title);
  });

  it("renders every engine title once and links to /methodology", async () => {
    const out = await html(<HowItWorksPage />);
    for (const key of DIM_LEGACY_ORDER) {
      expect(out).toContain(esc(DIMENSION_OWNERS[key].title));
    }
    expect(out).toContain('href="/methodology"');
    expect(out).not.toContain("Technology-Readiness Evidence");
    expect(out).not.toContain("Founder-Team Value (FTV)");
  });
});

describe("/how-it-works — template (G17 P2-A)", () => {
  it("one h1, the four steps as a numbered list under #how, #dimensions, the CTA hrefs, pageMetadata", async () => {
    const out = await html(<HowItWorksPage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(out).toMatch(/<section[^>]*id="how"/);
    expect(out).toMatch(/<section[^>]*id="dimensions"/);
    expect(HOW_IT_WORKS_STEPS).toHaveLength(4);
    for (const s of HOW_IT_WORKS_STEPS) expect(out).toContain(esc(s.title));
    expect(out).toMatch(/Step (<!-- -->)?4/);
    for (const href of ["/analyze", "/guide/01-vision", "/samples"]) expect(out).toContain(`href="${href}"`);
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/how-it-works");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeLessThanOrEqual(165);
  });
});
