// Colocated test for /dataset (G20-F2 page sweep, 2026-09-20): every link to
// the JSON/CSV API is a plain <a>, never next/link. A <Link href="/api/…">
// prefetches the route with `?…&_rsc=` on hover/viewport, the API answers 400
// and every visitor's console shows a failed request (page-sweep
// failed_requests_1 on /dataset). Also pins the template basics the sweep
// asserts: one h1, a <main>.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/landing/nav-v2", () => ({ NavV2: () => null }));
vi.mock("@/components/marketing/footer", () => ({ Footer: () => null }));
vi.mock("@/lib/svi-index-aggregates", () => ({
  getOverallAggregates: async () => ({ count: 92, medianSvi: 36, mean: 42.7, p10: 30, p25: 30, p50: 36, p75: 41.3, p90: 66.8, updatedAt: "2026-09-08T00:00:00.000Z" }),
  getSectorAggregates: async () => [{ sector: "saas", count: 20, medianSvi: 40, p25: 33, p75: 48, updatedAt: "2026-09-08T00:00:00.000Z" }],
  getStageAggregates: async () => [{ stage: "seed", count: 30, medianSvi: 38, p25: 31, p75: 45, updatedAt: "2026-09-08T00:00:00.000Z" }],
}));

import DatasetPage from "./page";

describe("/dataset", () => {
  it("links to /api/index/svi with plain anchors (no RSC prefetch), one h1, a main", async () => {
    const html = renderToStaticMarkup(await DatasetPage());
    const apiHrefs = html.match(/href="\/api\/index\/svi[^"]*"/g) ?? [];
    expect(apiHrefs.length).toBeGreaterThanOrEqual(4);
    // next/link renders <a … href> too, but it would carry no `download`/plain
    // anchors and the page source must not import it at all.
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<main[\s>]/);
  });
  it("the page source never imports next/link (API routes must not be prefetched)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/from "next\/link"/);
  });
});
