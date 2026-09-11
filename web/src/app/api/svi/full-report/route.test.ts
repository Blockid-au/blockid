// Colocated tests for POST /api/svi/full-report — S17-A review (P1-1 / P2-1).
//
// Paid, editor+ report over the project's startup record. Pins:
//   - viewer on a shared project → 403 BEFORE the credit check
//   - editor → account + latest analysis read under the OWNER's email with
//     callerEmail = the editor (P2-1: owner's legacy record off-limits);
//     credits come out of the EDITOR's wallet; the saved report_sections
//     row is keyed on the EDITOR's user_id (their purchase)
//   - owner → own email

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const callAIMock = vi.fn();
vi.mock("@/lib/ai-client", () => ({
  isAIConfigured: () => true,
  callAI: (args: unknown) => callAIMock(args),
}));

const canAffordMock = vi.fn();
const spendCreditsMock = vi.fn();
vi.mock("@/lib/credits", () => ({
  canAfford: (userId: string, feature: string) => canAffordMock(userId, feature),
  spendCredits: (userId: string, feature: string, meta: unknown) =>
    spendCreditsMock(userId, feature, meta),
  FEATURE_COSTS: { full_report_standard: 10, full_report_premium: 25 },
}));

const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
const scopeRoleMock = vi.fn<() => "owner" | "admin" | "editor" | "viewer">(() => "owner");
const findSVIAccountWithFallbackMock = vi.fn();
const findLatestAnalysisWithFallbackMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  getProjectScope: async (minRole?: string) => {
    const projectId = await getProjectIdFromRequestMock();
    if (!projectId) return null;
    const role = scopeRoleMock();
    const rank = { viewer: 1, editor: 2, admin: 3, owner: 4 } as const;
    if (minRole && rank[role] < rank[minRole as keyof typeof rank]) {
      const err = new Error("below") as Error & { code: string };
      err.name = "ProjectAccessError";
      err.code = "forbidden";
      throw err;
    }
    const isOwner = role === "owner";
    return {
      projectId,
      role,
      isOwner,
      userId: "u-1",
      email: "member@x.test",
      dataEmail: isOwner ? "member@x.test" : "owner@x.test",
      ownerUserId: isOwner ? "u-1" : "owner-1",
      project: { id: projectId, slug: "p", name: "P", userId: isOwner ? "u-1" : "owner-1", role },
    };
  },
  creditChargeNote: (scope: { isOwner: boolean } | null) =>
    !scope || scope.isOwner ? "Charged to your credits." : "Charged to your own credits — not the project owner's.",
  findSVIAccountWithFallback: (...a: unknown[]) => findSVIAccountWithFallbackMock(...a),
  findLatestAnalysisWithFallback: (...a: unknown[]) => findLatestAnalysisWithFallbackMock(...a),
}));

let upserts: Array<{ table: string; row: Record<string, unknown> }> = [];
let evidenceFilters: Array<[string, unknown]> = [];
function fakeSupabase() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        if (table === "svi_evidence") evidenceFilters.push([col, val]);
        return chain;
      };
      chain.order = () => Promise.resolve({ data: [], error: null });
      chain.upsert = (row: Record<string, unknown>) => {
        upserts.push({ table, row });
        return { then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) };
      };
      return chain;
    },
  };
}
const fromSpy = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    const sb = fakeSupabase();
    return { from: (t: string) => { fromSpy(t); return sb.from(t); } };
  },
}));

import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/svi/full-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  upserts = [];
  evidenceFilters = [];
  fromSpy.mockReset();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "member@x.test" });
  getProjectIdFromRequestMock.mockReset();
  getProjectIdFromRequestMock.mockResolvedValue("proj-shared");
  scopeRoleMock.mockReset();
  scopeRoleMock.mockReturnValue("owner");
  canAffordMock.mockReset();
  canAffordMock.mockResolvedValue({ allowed: true, balance: 50, cost: 10 });
  spendCreditsMock.mockReset();
  spendCreditsMock.mockResolvedValue({ ok: true, balance: 40 });
  callAIMock.mockReset();
  callAIMock.mockResolvedValue({ text: "# Report\n\nwords words words" });
  findSVIAccountWithFallbackMock.mockReset();
  findSVIAccountWithFallbackMock.mockResolvedValue({ id: "acc-owner", current_svi: 120, current_stage: 2 });
  findLatestAnalysisWithFallbackMock.mockReset();
  findLatestAnalysisWithFallbackMock.mockResolvedValue({ id: "an-1", raw_input: "orig", total_svi: 120, analysis_json: {} });
});

describe("POST /api/svi/full-report — S17-A", () => {
  it("401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(req({ tier: "standard" }))).status).toBe(401);
  });

  it("viewer on a shared project → 403 BEFORE the credit check, the AI, or any read", async () => {
    scopeRoleMock.mockReturnValue("viewer");
    const res = await POST(req({ tier: "standard" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(canAffordMock).not.toHaveBeenCalled();
    expect(findSVIAccountWithFallbackMock).not.toHaveBeenCalled();
    expect(callAIMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("editor on a shared project → 200; record read under the OWNER's email with callerEmail = editor; credits + saved section keyed on the EDITOR", async () => {
    scopeRoleMock.mockReturnValue("editor");
    const res = await POST(req({ tier: "standard" }));
    expect(res.status).toBe(200);
    expect(findSVIAccountWithFallbackMock).toHaveBeenCalledWith(
      "owner@x.test",
      "proj-shared",
      undefined,
      { callerEmail: "member@x.test" },
    );
    expect(findLatestAnalysisWithFallbackMock).toHaveBeenCalledWith(
      "owner@x.test",
      "proj-shared",
      "raw_input, total_svi, analysis_json",
      { callerEmail: "member@x.test" },
    );
    expect(evidenceFilters).toContainEqual(["account_id", "acc-owner"]);
    expect(canAffordMock).toHaveBeenCalledWith("u-1", "full_report_standard");
    expect(spendCreditsMock).toHaveBeenCalledWith(
      "u-1",
      "full_report_standard",
      expect.objectContaining({ project_id: "proj-shared" }),
    );
    const saved = upserts.find((u) => u.table === "report_sections");
    expect(saved?.row.user_id).toBe("u-1");
    expect(saved?.row.analysis_id).toBe("an-1");
    const body = await res.json();
    expect(body.role).toBe("editor");
    expect(body.creditNote).toMatch(/your own credits/);
  });

  it("owner → own email as data key and callerEmail", async () => {
    const res = await POST(req({ tier: "premium" }));
    expect(res.status).toBe(200);
    expect(findSVIAccountWithFallbackMock).toHaveBeenCalledWith(
      "member@x.test",
      "proj-shared",
      undefined,
      { callerEmail: "member@x.test" },
    );
    expect(canAffordMock).toHaveBeenCalledWith("u-1", "full_report_premium");
  });

  it("402 when the caller cannot afford it — no AI call", async () => {
    canAffordMock.mockResolvedValue({ allowed: false, balance: 1, cost: 10 });
    const res = await POST(req({ tier: "standard" }));
    expect(res.status).toBe(402);
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("404 when no account resolves — no AI call, no spend", async () => {
    findSVIAccountWithFallbackMock.mockResolvedValue(null);
    const res = await POST(req({ tier: "standard" }));
    expect(res.status).toBe(404);
    expect(callAIMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });
});
