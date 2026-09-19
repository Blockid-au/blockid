// Colocated test for /roadmap + /changelog + /insights (G17 P2-A): each on
// the template with one h1, stable section ids, the "Recently landed"
// heading the post-deploy smoke asserts on /roadmap, the closing CTAs, and
// pageMetadata. The marketing shell + trackers are mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/site/page-view-tracker", () => ({ PageViewTracker: () => null }));

import { renderedTitle } from "@/lib/seo/page-meta";
import RoadmapPage, { metadata as roadmapMeta } from "./page";
import ChangelogPage, { metadata as changelogMeta } from "../changelog/page";
import InsightsPage, { metadata as insightsMeta } from "../insights/page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/roadmap — template (G17 P2-A)", () => {
  it("one h1, the seven section ids, the 'Recently landed' h2 (post-deploy smoke), the CTAs", async () => {
    const out = await html(<RoadmapPage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    for (const id of ["milestone", "landed", "next", "gated", "journey", "stages", "quarter", "cta"]) {
      expect(out, id).toMatch(new RegExp(`<section[^>]*id="${id}"`));
    }
    expect(out).toMatch(/<h2[^>]*>Recently landed<\/h2>/);
    expect(out).toContain('href="/changelog"');
    expect(out).toContain('href="/security-audit"');
    expect(roadmapMeta.alternates?.canonical).toBe("https://blockid.au/roadmap");
    expect(renderedTitle(roadmapMeta.title).length).toBeLessThanOrEqual(65);
  });
});

describe("/changelog — template (G17 P2-A)", () => {
  it("one h1, #releases, the releases aside, the CTAs", async () => {
    const out = await html(<ChangelogPage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(out).toMatch(/<section[^>]*id="releases"/);
    expect(out).toContain('aria-label="Jump to release"');
    expect(out).toContain('href="/roadmap"');
    expect(changelogMeta.alternates?.canonical).toBe("https://blockid.au/changelog");
    expect(renderedTitle(changelogMeta.title).length).toBeLessThanOrEqual(65);
  });
});

describe("/insights — template (G17 P2-A)", () => {
  it("one h1, #articles + #benchmarks, the article grid, the CTAs, no nested <main>", async () => {
    const out = await html(await InsightsPage());
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(out).toMatch(/<section[^>]*id="articles"/);
    expect(out).toMatch(/<section[^>]*id="benchmarks"/);
    expect(out).not.toContain("<main");
    expect(out).toContain('href="/benchmarks"');
    expect(out).toContain('href="/analyze"');
    expect(out).toContain('href="/pricing"');
    expect((out.match(/href="\/insights\/[a-z0-9-]+"/g) ?? []).length).toBeGreaterThan(0);
    expect(insightsMeta.alternates?.canonical).toBe("https://blockid.au/insights");
    expect(renderedTitle(insightsMeta.title).length).toBeLessThanOrEqual(65);
  });
});
