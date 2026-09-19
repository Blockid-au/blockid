// Colocated test for /solutions (G17 P2-A): one h1, the five persona cards
// as links to pages on disk, evaluators first (D1), no A$ strings (prices
// live on /pricing), pageMetadata. The marketing shell is mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { renderedTitle } from "@/lib/seo/page-meta";
import { SOLUTION_CARDS } from "./solutions-content";
import SolutionsIndexPage, { metadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/solutions — persona index (G17 P2-A)", () => {
  it("five cards, each a page on disk, evaluators before founders", () => {
    expect(SOLUTION_CARDS).toHaveLength(5);
    for (const c of SOLUTION_CARDS) {
      expect(existsSync(resolve(__dirname, c.href.replace("/solutions/", ""), "page.tsx")), c.href).toBe(true);
    }
    expect(SOLUTION_CARDS.slice(0, 3).map((c) => c.href)).toEqual([
      "/solutions/investor",
      "/solutions/accelerator",
      "/solutions/advisor",
    ]);
  });

  it("renders one h1, #personas, every card href, the evaluator pricing link and no A$ price string", async () => {
    const out = await html(<SolutionsIndexPage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(out).toMatch(/<section[^>]*id="personas"/);
    for (const c of SOLUTION_CARDS) expect(out).toContain(`href="${c.href}"`);
    expect(out).toContain('href="/pricing?segment=evaluator"');
    expect(out).not.toMatch(/A\$\d/);
  });

  it("pageMetadata: canonical, rendered title ≤ 65, description ≤ 165", () => {
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/solutions");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeLessThanOrEqual(165);
  });
});
