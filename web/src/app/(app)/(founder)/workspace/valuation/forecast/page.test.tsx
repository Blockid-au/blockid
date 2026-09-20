import type React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// G20-sweep (2026-09-20): /workspace/valuation/forecast fetched a bare
// `/api/financial/forecast` on every first paint — a route that never
// existed (404 in the console, the list stuck on "Something went wrong").
// The list route is GET /api/financial/forecast/[projectId] and answers
// `{ models }`, not `{ forecasts }`. The server page now resolves the
// project scope and hands the id down; no project → empty state, no fetch.

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "u-1", email: "f@x.au", displayName: "F", role: "user", plan: "founder_free" }),
}));
const scopeState = vi.hoisted(() => ({ projectId: "proj-1" as string | null }));
vi.mock("@/lib/projects", () => ({
  getCurrentProjectIsSandbox: async () => false,
  getProjectScope: async () => (scopeState.projectId ? { projectId: scopeState.projectId, dataEmail: "f@x.au", role: "owner" } : null),
}));
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <main data-shell>{children}</main>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { renderPage } from "@/test/founder-page-harness";
import { toForecastListItems } from "./forecast-list-client";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page());
}

describe("/workspace/valuation/forecast", () => {
  it("with a project: first paint carries the h1 and the loading body (the client then fetches the per-project list)", async () => {
    scopeState.projectId = "proj-1";
    const out = await html();
    expect((out.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(out).toContain("Financial Forecast</h1>");
    expect(out).toContain("Loading forecasts");
  });

  it("no project: the empty state renders on the server with one h1 and no fetch is attempted", async () => {
    scopeState.projectId = null;
    const out = await html();
    expect((out.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(out).toContain("Financial Forecast</h1>");
    expect(out).toContain("No forecasts yet");
    expect(out).not.toContain("Loading forecasts");
  });

  it("the client calls the per-project list route, never the bare /api/financial/forecast", () => {
    const src = readFileSync(join(__dirname, "forecast-list-client.tsx"), "utf8");
    expect(src).toContain("`/api/financial/forecast/${encodeURIComponent(projectId)}`");
    expect(src).not.toMatch(/fetch\("\/api\/financial\/forecast"\)/);
  });

  it("maps the route's `models[]` rows onto the cards", () => {
    const items = toForecastListItems([
      { id: "m-1", name: "Base case", scenario: "base", arr_month_12_aud: 120000, month_breakeven: 14, runway_months: 18, created_at: "2026-09-01" } as never,
      { id: "m-2", name: "Bear", scenario: "bear", created_at: "2026-09-02" } as never,
    ]);
    expect(items).toEqual([
      { id: "m-1", name: "Base case", scenario: "base", arrProjected12m: 120000, breakEvenMonth: 14, runwayMonths: 18, createdAt: "2026-09-01" },
      { id: "m-2", name: "Bear", scenario: "bear", arrProjected12m: 0, breakEvenMonth: null, runwayMonths: null, createdAt: "2026-09-02" },
    ]);
    expect(toForecastListItems(undefined)).toEqual([]);
  });
});
