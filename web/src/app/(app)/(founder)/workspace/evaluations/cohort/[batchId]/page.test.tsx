import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/evaluations/cohort/[batchId] (T0272) with the
// data layer mocked. Pins: login redirect, notFound for a batch the caller
// does not own, the header (name, status + progress, rubric weights line),
// CSV + sponsor/LP buttons (LP gated on lp_report / lp_export), the sortable
// table (startup, SVI, weighted, stage, Δ, top strength / gap, status,
// report link) and the evaluator disclaimer footer.

vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));

const redirectMock = vi.fn((url: string) => {
  throw new Error("REDIRECT:" + url);
});
const notFoundMock = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  notFound: () => notFoundMock(),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/workspace/evaluations/cohort/b-1",
}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));

const getEntitlementsMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({ getEntitlements: (plan: string, id: string) => getEntitlementsMock(plan, id) }));

const getBatchMock = vi.fn();
const loadRowsMock = vi.fn();
vi.mock("@/lib/evaluations/batch", () => ({
  getBatchForUser: (u: string, id: string) => getBatchMock(u, id),
  loadCohortRows: (b: unknown) => loadRowsMock(b),
}));

const USER = {
  id: "u-1", email: "prog@accel.au", displayName: "Pat", role: "user", plan: "investor_vc_small",
  createdAt: "", lastLoginAt: null, googleId: null, avatarUrl: null, discountPct: null,
  startupName: null, startupStage: null, industry: null, onboardingCompleted: true, startupGoals: null,
};
const EQUAL = { ftv: 12.5, mpc: 12.5, ptd: 12.5, tre: 12.5, cgh: 12.5, iri: 12.5, lco: 12.5, svm: 12.5 };
const BATCH = { id: "b-1", userId: "u-1", name: "Cohort 4 intake", rubricWeights: EQUAL, status: "running", total: 3, doneCount: 2, failedCount: 1, createdAt: "2026-09-10T00:00:00Z", startedAt: "2026-09-10T12:00:00Z", finishedAt: null };
const ROWS = [
  { itemId: 1, evaluationId: "e-1", projectId: "p-1", projectSlug: "acme-robotics", startup: "Acme Robotics", label: "Shortlist", industry: "DeepTech", state: "NSW", status: "done", svi: 71, weighted: 64.5, stage: 3, delta: 9.4, topStrength: "Founder & Team", topGap: "Traction & Revenue", dimensionScores: { ftv: 80, tre: 40 }, reportUrl: "/tbr/tok-a", pdfUrl: "/api/svi/report/pdf?token=tok-a", error: null, scoredAt: "2026-09-10T12:05:00Z" },
  { itemId: 2, evaluationId: "e-2", projectId: "p-2", projectSlug: "beta-health", startup: "Beta Health", label: null, industry: null, state: null, status: "done", svi: 58, weighted: 58, stage: 2, delta: null, topStrength: "Market & Problem", topGap: "Legal & Compliance", dimensionScores: { mpc: 70, lco: 30 }, reportUrl: "/tbr/tok-b", pdfUrl: "/api/svi/report/pdf?token=tok-b", error: null, scoredAt: "2026-09-10T12:15:00Z" },
  { itemId: 3, evaluationId: "e-3", projectId: "p-3", projectSlug: "gamma", startup: "Gamma", label: null, industry: null, state: null, status: "failed", svi: null, weighted: null, stage: 1, delta: null, topStrength: null, topGap: null, dimensionScores: null, reportUrl: null, pdfUrl: null, error: "owner_not_found", scoredAt: "2026-09-10T12:20:00Z" },
];

async function html(batchId = "b-1"): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page({ params: Promise.resolve({ batchId }) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  getEntitlementsMock.mockResolvedValue(["lp_export", "lp_report", "portfolio"]);
  getBatchMock.mockResolvedValue(BATCH);
  loadRowsMock.mockResolvedValue(ROWS);
});

describe("/workspace/evaluations/cohort/[batchId]", () => {
  it("redirects anonymous users to login with the cohort path as next", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/evaluations/cohort/b-1");
  });

  it("404s a batch the caller does not own", async () => {
    getBatchMock.mockResolvedValue(null);
    await expect(html("b-other")).rejects.toThrow("NOT_FOUND");
    expect(getBatchMock).toHaveBeenCalledWith("u-1", "b-other");
    expect(loadRowsMock).not.toHaveBeenCalled();
  });

  it("renders the header, weights line, exports and the sortable cohort table", async () => {
    const out = await html();
    expect(out).toContain("Cohort 4 intake");
    expect(out).toContain("Scoring… · 2 of 3 scored · 1 failed");
    expect(out).toContain("width:100%");
    expect(out).toContain('data-testid="rubric-weights"');
    expect(out).toContain("equal across the 8 dimensions (default)");
    expect(out).toContain("/api/evaluations/batch/b-1/export.csv");
    expect(out).toContain("Download CSV");
    expect(out).toContain("/api/reports/quarterly?batch=b-1");
    expect(out).toContain("Sponsor / LP report");
    // Table: headers are sort buttons.
    expect(out).toContain('data-testid="cohort-table"');
    for (const k of ["startup", "svi", "weighted", "stage", "delta", "topStrength", "topGap", "status"]) {
      expect(out).toContain("data-testid=\"sort-" + k + "\"");
    }
    expect((out.match(/data-testid="cohort-row"/g) ?? []).length).toBe(3);
    // Default sort: weighted desc → Acme, Beta, Gamma.
    expect(out.indexOf("Acme Robotics")).toBeLessThan(out.indexOf("Beta Health"));
    expect(out.indexOf("Beta Health")).toBeLessThan(out.indexOf(">Gamma<"));
    expect(out).toContain("/workspace/projects/acme-robotics/analyze");
    expect(out).toContain("Shortlist");
    expect(out).toContain("DeepTech");
    expect(out).toContain(">71<");
    expect(out).toContain(">64.5<");
    expect(out).toContain("MVP");
    expect(out).toContain("▲ +9.4");
    expect(out).toContain(">New<");
    expect(out).toContain("Founder &amp; Team");
    expect(out).toContain("Traction &amp; Revenue");
    expect(out).toContain("Scored");
    expect(out).toContain("Failed");
    expect(out).toContain('data-testid="item-error"');
    expect(out).toContain("owner_not_found");
    expect(out).toContain('href="/tbr/tok-a"');
    expect(out).toContain('href="/api/svi/report/pdf?token=tok-b"');
    // Evaluator disclaimer footer.
    expect(out).toContain('data-surface="evaluator_report"');
    expect(loadRowsMock).toHaveBeenCalledWith(BATCH);
  });

  it("shows custom weights and gates the LP report on lp_report / lp_export", async () => {
    getBatchMock.mockResolvedValue({ ...BATCH, rubricWeights: { ...EQUAL, ftv: 30, tre: 30, mpc: 5, ptd: 5, cgh: 5, iri: 5, lco: 10, svm: 10 } });
    getEntitlementsMock.mockResolvedValue(["accelerator.cohort"]);
    const out = await html();
    expect(out).toContain("Founder &amp; Team 30%");
    expect(out).toContain("Traction &amp; Revenue 30%");
    expect(out).not.toContain("/api/reports/quarterly?batch=b-1");
    expect(out).toContain("Sponsor / LP report — Program");
    expect(out).toContain("/pricing?segment=evaluator");
  });
});
