import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// G20-sweep (2026-09-20): /workspace/projects/compare rendered its route
// error boundary for the founder persona (React #441 — a Server Components
// throw). Root cause: `getPortfolioRows` reached `./projects` through a
// `webpackIgnore` dynamic import that the standalone server chunk could not
// resolve. The aggregator now lives in `@/lib/portfolio-rows` (static
// imports); this test renders the page with the aggregator mocked and pins
// one h1, the empty state, and the table + chart when rows exist.

const rowsState = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@/lib/portfolio-rows", () => ({ getPortfolioRows: async () => rowsState.rows }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "u-1", email: "f@x.au", displayName: "F", role: "user", plan: "founder_free" }),
}));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => (
    <main data-shell>{children}</main>
  ),
}));
vi.mock("@/components/portfolio/comparison-chart", () => ({
  PortfolioComparisonChart: ({ rows }: { rows: unknown[] }) => <div data-chart data-series={rows.length} />,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { renderPage } from "@/test/founder-page-harness";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page());
}

const ROW = {
  id: "p-1",
  slug: "acme",
  name: "Acme",
  current_svi_score: 64,
  canonical_stage: "seed",
  credits_used_mtd: 2.5,
  last_activity_at: new Date().toISOString(),
  next_action: { label: "Set up equity", url: "/workspace/equity/setup" },
  svi_history: [{ date: "2026-09-01", score: 60 }, { date: "2026-09-10", score: 64 }],
};

describe("/workspace/projects/compare", () => {
  beforeEach(() => {
    rowsState.rows = [];
  });

  it("empty portfolio: one h1, the empty state, no chart", async () => {
    const out = await html();
    expect((out.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(out).toContain("Your startups, side-by-side");
    expect(out).toContain("haven&#x27;t created any startups yet");
    expect(out).not.toContain("data-chart");
    expect(out).toContain("<main");
  });

  it("with rows: still one h1, the row link, the chart and the next action", async () => {
    rowsState.rows = [ROW, { ...ROW, id: "p-2", slug: "beta", name: "Beta", canonical_stage: "idea", current_svi_score: 20, svi_history: [] }];
    const out = await html();
    expect((out.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(out).toContain('href="/workspace/projects/acme/analyze"');
    expect(out).toContain('data-series="2"');
    expect(out).toContain("Set up equity");
    // furthest-along project reads first
    expect(out.indexOf("Acme")).toBeLessThan(out.indexOf("Beta"));
  });
});
