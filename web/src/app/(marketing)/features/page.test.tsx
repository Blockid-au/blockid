// Colocated render test for /features (G17 P2-A): one h1, the three
// audience sections, every card anchor + href on the page (the homepage
// links `/features#per-investor-tracked-share-links`), pageMetadata.
// The marketing shell mounts NavV2 → useRouter(), so it is mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/site/page-view-tracker", () => ({ PageViewTracker: () => null }));

import { renderedTitle } from "@/lib/seo/page-meta";
import { EVERYONE_FEATURES, FOUNDER_FEATURES, INVESTOR_FEATURES } from "./features-content";
import FeaturesPage, { metadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const ALL = [...FOUNDER_FEATURES, ...INVESTOR_FEATURES, ...EVERYONE_FEATURES];

describe("/features — template (G17 P2-A)", () => {
  it("eight cards, unique anchors, the tracked-links anchor the homepage deep-links", () => {
    expect(ALL).toHaveLength(8);
    expect(new Set(ALL.map((f) => f.anchor)).size).toBe(8);
    expect(ALL.map((f) => f.anchor)).toContain("per-investor-tracked-share-links");
  });

  it("renders one h1, #founders / #investors / #everyone, every card as an anchored link, the closing CTAs", async () => {
    const out = await html(<FeaturesPage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    for (const id of ["founders", "investors", "everyone"]) expect(out).toMatch(new RegExp(`<section[^>]*id="${id}"`));
    for (const f of ALL) {
      expect(out).toContain(`id="${f.anchor}"`);
      expect(out).toContain(`href="${f.href}"`);
    }
    expect(out).toContain('href="/pricing"');
    expect(out).toContain('href="/tbr/demo"');
  });

  it("pageMetadata: canonical, title ≤ 65 rendered, description ≤ 165", () => {
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/features");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeLessThanOrEqual(165);
  });
});
