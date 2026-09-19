// G16-A — /workspace/reports/business emits the funnel's `report_view` step
// server-side (tier from the account: plan | paid | free), once per render,
// with the qa-live-* e-mail forwarded for the flag; anonymous → login
// redirect and no event; an analytics failure never breaks the page.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const redirectMock = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirectMock(to) }));

vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));
vi.mock("./business-report-client", () => ({
  BusinessReportClient: ({ projectId }: { projectId: string }) => <div data-testid="client">{projectId}</div>,
}));

const emitReportViewMock = vi.fn();
const resolveReportTierMock = vi.fn();
vi.mock("@/lib/analytics/funnel", () => ({
  asReportTierClient: (c: unknown) => c,
  emitReportView: (i: unknown) => emitReportViewMock(i),
  resolveReportTier: (...a: unknown[]) => resolveReportTierMock(...a),
}));

import BusinessReportPage, { dynamic } from "./page";

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue({ id: "u1", email: "qa-live-20260919-0415@blockid.au", plan: "free" });
  emitReportViewMock.mockReset();
  resolveReportTierMock.mockReset().mockResolvedValue("free");
  redirectMock.mockClear();
});

describe("/workspace/reports/business — report_view (G16-A)", () => {
  it("is dynamic and emits report_view with the resolved tier, project id and the account e-mail", async () => {
    expect(dynamic).toBe("force-dynamic");
    const el = await BusinessReportPage({ searchParams: Promise.resolve({ pid: "proj-9" }) });
    expect(el).toBeTruthy();
    expect(resolveReportTierMock).toHaveBeenCalledWith(expect.anything(), "u1", "free");
    expect(emitReportViewMock).toHaveBeenCalledTimes(1);
    expect(emitReportViewMock.mock.calls[0][0]).toEqual({
      userId: "u1",
      email: "qa-live-20260919-0415@blockid.au",
      projectId: "proj-9",
      tier: "free",
    });
  });

  it("defaults the project to 'default' and passes a paid / plan tier through", async () => {
    resolveReportTierMock.mockResolvedValue("plan");
    await BusinessReportPage({ searchParams: Promise.resolve({}) });
    expect(emitReportViewMock.mock.calls[0][0]).toMatchObject({ projectId: "default", tier: "plan" });
  });

  it("anonymous → login redirect, no event", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(BusinessReportPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/auth/login?next=/workspace/reports/business");
    expect(emitReportViewMock).not.toHaveBeenCalled();
  });

  it("a throwing tier lookup never breaks the page", async () => {
    resolveReportTierMock.mockRejectedValue(new Error("db down"));
    const el = await BusinessReportPage({ searchParams: Promise.resolve({}) });
    expect(el).toBeTruthy();
    expect(emitReportViewMock).not.toHaveBeenCalled();
  });
});
