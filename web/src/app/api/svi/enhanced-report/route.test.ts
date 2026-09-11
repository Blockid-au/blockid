// Route tests for POST /api/svi/enhanced-report — pins the FOUNDER behaviour
// that must not change when the pipeline moved into
// lib/report-pipeline/run-for-project.ts (T0271):
//   * 401 anonymous, 402 insufficient credits, 404 no account / no analysis,
//     503 DB unavailable;
//   * the project comes from the cookie (getProjectIdFromRequest) and the
//     context is keyed by the CALLER's email;
//   * credits are spent BEFORE orchestration (unchanged founder semantics),
//     with the same metadata as before;
//   * response shape (reportId, sections, balance, creditsUsed).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/ai-client", () => ({ isAIConfigured: () => true }));

const canAffordMock = vi.fn();
const spendCreditsMock = vi.fn();
vi.mock("@/lib/credits", () => ({
  FEATURE_COSTS: { enhanced_report_standard: 3, enhanced_report_premium: 7, enhanced_report_investor: 10 },
  canAfford: (u: string, f: string) => canAffordMock(u, f),
  spendCredits: (u: string, f: string, m: unknown) => spendCreditsMock(u, f, m),
}));

// S17-A: the route resolves the project via getProjectScope("editor"). The
// mock derives a scope from getProjectIdMock (null → no project) and
// scopeRoleMock (viewer throws a ProjectAccessError-shaped "forbidden").
const getProjectIdMock = vi.fn();
const scopeRoleMock = vi.fn<() => "owner" | "admin" | "editor" | "viewer">(() => "owner");
vi.mock("@/lib/projects", () => ({
  getProjectScope: async (minRole?: string) => {
    const projectId = (await getProjectIdMock()) as string | null;
    if (!projectId) return null;
    const role = scopeRoleMock();
    const rank = { viewer: 1, editor: 2, admin: 3, owner: 4 } as const;
    if (minRole && rank[role] < rank[minRole as keyof typeof rank]) {
      const err = new Error("below") as Error & { code: string };
      err.name = "ProjectAccessError";
      err.code = "forbidden";
      throw err;
    }
    return {
      projectId,
      role,
      isOwner: role === "owner",
      userId: "u-1",
      email: "founder@acme.io",
      dataEmail: role === "owner" ? "founder@acme.io" : "owner@acme.io",
      ownerUserId: "owner-1",
      project: { id: projectId, slug: "acme", name: "Acme", userId: "owner-1", role },
    };
  },
  creditChargeNote: (scope: { isOwner: boolean } | null) =>
    !scope || scope.isOwner ? "Charged to your credits." : "Charged to your own credits — not the project owner's.",
}));

const loadCtxMock = vi.fn();
const generateMock = vi.fn();
vi.mock("@/lib/report-pipeline/run-for-project", () => ({
  loadProjectReportContext: (a: unknown) => loadCtxMock(a),
  generateAndPersistReport: (a: unknown) => generateMock(a),
}));

import { POST } from "./route";

const USER = { id: "u-1", email: "founder@acme.io", plan: "founder_free" };
const CTX = {
  projectId: "p-1",
  account: { id: "acc-1", email: "founder@acme.io", startup_name: "Acme", current_svi: 120, current_stage: 3 },
  latestAnalysis: { id: "an-1", raw_input: "Acme builds robots", total_svi: 120, analysis_json: {} },
  evidenceItems: [{ evidence_type: "github", confidence_level: "verified", dimension: "ptd", label: "repo" }],
  criteriaData: {},
  sviAnalysis: { totalSVI: 120, stage: 3 },
};
const REPORT = {
  id: "rpt-1",
  title: "Acme",
  totalWords: 6000,
  qualityScore: 88,
  executiveSummary: "x".repeat(1200),
  createdAt: "2026-09-10T00:00:00Z",
  sections: [{ id: "s1", title: "Idea", agentRole: "cpo", criterion: "idea", score: 70, wordCount: 400, content: "..." }],
};

const post = (body: unknown) =>
  new Request("http://localhost/api/svi/enhanced-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  canAffordMock.mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
  spendCreditsMock.mockResolvedValue({ ok: true, balance: 7 });
  getProjectIdMock.mockResolvedValue("p-1");
  loadCtxMock.mockResolvedValue({ ok: true, ctx: CTX });
  generateMock.mockResolvedValue(REPORT);
});

describe("POST /api/svi/enhanced-report (founder)", () => {
  it("401s anonymous callers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(post({ tier: "standard" }))).status).toBe(401);
  });

  it("402s when the founder cannot afford the tier", async () => {
    canAffordMock.mockResolvedValue({ allowed: false, balance: 1, cost: 3 });
    const res = await POST(post({ tier: "standard" }));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ ok: false, balance: 1, cost: 3, tier: "standard" });
    expect(loadCtxMock).not.toHaveBeenCalled();
  });

  it("404s with the legacy messages when account / analysis are missing; 503 when DB is down", async () => {
    loadCtxMock.mockResolvedValue({ ok: false, error: "no_account" });
    let res = await POST(post({ tier: "standard" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/No SVI account found/);

    loadCtxMock.mockResolvedValue({ ok: false, error: "no_analysis" });
    res = await POST(post({ tier: "standard" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/No SVI analysis found/);

    loadCtxMock.mockResolvedValue({ ok: false, error: "db_unavailable" });
    expect((await POST(post({ tier: "standard" }))).status).toBe(503);
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("resolves the project from the cookie and the context by the caller's email", async () => {
    await POST(post({ tier: "standard" }));
    expect(loadCtxMock).toHaveBeenCalledWith({ ownerEmail: "founder@acme.io", projectId: "p-1" });
  });

  it("spends credits BEFORE orchestration with the legacy metadata, then returns the report", async () => {
    const order: string[] = [];
    spendCreditsMock.mockImplementation(async () => { order.push("spend"); return { ok: true, balance: 7 }; });
    generateMock.mockImplementation(async () => { order.push("generate"); return REPORT; });

    const res = await POST(post({ tier: "standard", locale: "vi" }));
    expect(res.status).toBe(200);
    expect(order).toEqual(["spend", "generate"]);
    expect(spendCreditsMock).toHaveBeenCalledWith("u-1", "enhanced_report_standard", {
      tier: "standard", svi: 120, stage: 3, evidenceCount: 1, startupName: "Acme",
    });
    expect(generateMock).toHaveBeenCalledWith({ ctx: CTX, userId: "u-1", tier: "standard", locale: "vi", creditsCost: 3 });
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      reportId: "rpt-1",
      wordCount: 6000,
      qualityScore: 88,
      tier: "standard",
      locale: "vi",
      balance: 7,
      creditsUsed: 3,
      sections: [{ id: "s1", title: "Idea", agentRole: "cpo", criterion: "idea", score: 70, wordCount: 400 }],
    });
    expect(json.executiveSummary).toHaveLength(1000);
  });

  it("maps tier → feature key (premium 7 / investor_memo 10)", async () => {
    await POST(post({ tier: "premium" }));
    expect(canAffordMock).toHaveBeenCalledWith("u-1", "enhanced_report_premium");
    await POST(post({ tier: "investor_memo" }));
    expect(canAffordMock).toHaveBeenCalledWith("u-1", "enhanced_report_investor");
    expect(generateMock).toHaveBeenLastCalledWith(expect.objectContaining({ tier: "investor_memo", creditsCost: 10 }));
  });

  // S17-A — shared-project members.
  it("viewer member → 403 before any credit check or context load", async () => {
    scopeRoleMock.mockReturnValue("viewer");
    const res = await POST(post({ tier: "standard" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(canAffordMock).not.toHaveBeenCalled();
    expect(loadCtxMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    scopeRoleMock.mockReturnValue("owner");
  });

  it("editor member: context keyed by the OWNER's email, credits spent from the MEMBER's wallet, creditNote says so", async () => {
    scopeRoleMock.mockReturnValue("editor");
    const res = await POST(post({ tier: "standard" }));
    expect(res.status).toBe(200);
    expect(loadCtxMock).toHaveBeenCalledWith({ ownerEmail: "owner@acme.io", projectId: "p-1" });
    expect(spendCreditsMock).toHaveBeenCalledWith("u-1", "enhanced_report_standard", expect.any(Object));
    const json = await res.json();
    expect(json.role).toBe("editor");
    expect(json.creditNote).toMatch(/your own credits/);
    scopeRoleMock.mockReturnValue("owner");
  });

  it("402 for a member carries the own-wallet creditNote", async () => {
    scopeRoleMock.mockReturnValue("editor");
    canAffordMock.mockResolvedValue({ allowed: false, balance: 0, cost: 3 });
    const res = await POST(post({ tier: "standard" }));
    expect(res.status).toBe(402);
    expect((await res.json()).creditNote).toMatch(/not the project owner/);
    scopeRoleMock.mockReturnValue("owner");
  });

  it("orchestration failure → 500 and credits stay charged (founder semantics)", async () => {
    generateMock.mockRejectedValue(new Error("boom"));
    const res = await POST(post({ tier: "standard" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/Credits have been charged/);
    expect(json.detail).toBe("boom");
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
  });
});
