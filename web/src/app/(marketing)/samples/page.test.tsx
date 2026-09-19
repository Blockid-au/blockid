// Colocated test for /samples (G17 D4): the sample-runs gallery. Every card
// must link to a page on disk (D7), the run comparison moved here from the
// home, and the Atlassian walkthrough (G7 Q2) leads the journeys.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { renderedTitle } from "@/lib/seo/page-meta";
import { SAMPLE_DOSSIERS, SAMPLE_JOURNEYS } from "./samples-content";
import SamplesPage, { metadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const APP_DIR = resolve(__dirname, "..", "..");
function pageExists(href: string): boolean {
  const segs = href.split(/[?#]/)[0]!.split("/").filter(Boolean);
  return ["", "(marketing)", "(app)"].some((g) => existsSync(resolve(APP_DIR, g, ...segs, "page.tsx")));
}

describe("/samples — the sample results gallery", () => {
  it("metadata: canonical /samples, title ≤ 65 with the brand, description 140–160", () => {
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/samples");
    const title = renderedTitle(metadata.title);
    expect(title.length).toBeLessThanOrEqual(65);
    expect(title).toMatch(/BlockID\.au$/);
    const d = String(metadata.description);
    expect(d.length).toBeGreaterThanOrEqual(140);
    expect(d.length).toBeLessThanOrEqual(160);
  });

  it("every sample card links to a page that exists (D7), hrefs unique, the dossier + TBR + Atlassian lead", () => {
    const all = [...SAMPLE_DOSSIERS, ...SAMPLE_JOURNEYS].map((c) => c.href);
    for (const href of all) expect(pageExists(href), href).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(SAMPLE_DOSSIERS[0]!.href).toBe("/tbr/demo");
    expect(SAMPLE_DOSSIERS[1]!.href).toBe("/sample-business-report");
    expect(SAMPLE_JOURNEYS[0]!.href).toBe("/showcase/atlassian?step=1");
  });

  it("renders one h1, the run comparison + legend under #runs, and every card as a link", async () => {
    const out = await html(<SamplesPage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(out).toMatch(/<section[^>]*id="runs"/);
    expect(out).toContain("Idea stage");
    expect(out).toContain("Revenue stage");
    for (const c of [...SAMPLE_DOSSIERS, ...SAMPLE_JOURNEYS]) {
      expect(out, c.href).toContain(`href="${c.href.replace(/&/g, "&amp;")}"`);
    }
    expect(out).toContain('href="/showcase"');
    expect(out).toContain('href="/analyze"');
  });
});
