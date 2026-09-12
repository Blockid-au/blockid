// Colocated tests for POST /api/svi/rescore — S17-A review (P1-1 / P2-1).
//
// Editor+ only (it updates svi_accounts + writes snapshots). The account
// and latest analysis are read through find*WithFallback under the OWNER's
// email with `callerEmail` = the caller, so a member never reaches the
// owner's legacy null-project record (P2-1).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

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
  findSVIAccountWithFallback: (...a: unknown[]) => findSVIAccountWithFallbackMock(...a),
  findLatestAnalysisWithFallback: (...a: unknown[]) => findLatestAnalysisWithFallbackMock(...a),
}));

vi.mock("@/lib/svi-analysis", () => ({
  extractSignals: () => ({}),
  computeSVI: () => ({ totalSVI: 110, stage: 2 }),
}));
vi.mock("@/lib/svi-badges", () => ({ checkAndAwardBadges: async () => [] }));

let updates: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
let analysisCountFilters: Array<[string, unknown]> = [];

function fakeSupabase() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        if (table === "svi_analyses") analysisCountFilters.push([col, val]);
        return chain;
      };
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [], count: 0, error: null });
      chain.insert = () => ({ then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) });
      chain.update = () => {
        const call = { table, filters: [] as Array<[string, unknown]> };
        updates.push(call);
        const u = {
          eq: (col: string, val: unknown) => { call.filters.push([col, val]); return u; },
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return u;
      };
      return chain;
    },
  };
}
const fromSpy = vi.fn();
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => {
    const sb = fakeSupabase();
    return { from: (t: string) => { fromSpy(t); return sb.from(t); } };
  },
}));

// S20-B — outbound webhook emitter (enqueue only).
const enqueueMock = vi.fn(async () => ({ queued: 1, endpoints: ["ep"], envelopeId: "evt" }));
vi.mock("@/lib/webhooks/registry", () => ({ enqueueWebhook: (...a: unknown[]) => enqueueMock(...(a as [])) }));

import { POST } from "./route";

beforeEach(() => {
  enqueueMock.mockClear();
  updates = [];
  analysisCountFilters = [];
  fromSpy.mockReset();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "member@x.test" });
  getProjectIdFromRequestMock.mockReset();
  getProjectIdFromRequestMock.mockResolvedValue("proj-shared");
  scopeRoleMock.mockReset();
  scopeRoleMock.mockReturnValue("owner");
  findSVIAccountWithFallbackMock.mockReset();
  findSVIAccountWithFallbackMock.mockResolvedValue({ id: "acc-owner", current_svi: 100 });
  findLatestAnalysisWithFallbackMock.mockReset();
  findLatestAnalysisWithFallbackMock.mockResolvedValue({ raw_input: "orig", analysis_json: {} });
});

describe("POST /api/svi/rescore — S17-A", () => {
  it("401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    expect(findSVIAccountWithFallbackMock).not.toHaveBeenCalled();
  });

  it("viewer on a shared project → 403 before any read or write", async () => {
    scopeRoleMock.mockReturnValue("viewer");
    const res = await POST();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(findSVIAccountWithFallbackMock).not.toHaveBeenCalled();
    expect(fromSpy).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("editor on a shared project → 200; readers get (OWNER email, project, callerEmail = editor) so the owner's legacy record is off-limits (P2-1); update scoped to the resolved account", async () => {
    scopeRoleMock.mockReturnValue("editor");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(findSVIAccountWithFallbackMock).toHaveBeenCalledWith(
      "owner@x.test",
      "proj-shared",
      "*",
      { callerEmail: "member@x.test" },
    );
    expect(findLatestAnalysisWithFallbackMock).toHaveBeenCalledWith(
      "owner@x.test",
      "proj-shared",
      "raw_input, analysis_json",
      { callerEmail: "member@x.test" },
    );
    expect(updates.find((u) => u.table === "svi_accounts")?.filters).toContainEqual(["id", "acc-owner"]);
    expect(analysisCountFilters).toContainEqual(["email", "owner@x.test"]);
    const body = await res.json();
    expect(body.newSVI).toBe(110);
    expect(body.previousSVI).toBe(100);
  });

  it("owner → own email both as data key and callerEmail (legacy fallback stays available)", async () => {
    await POST();
    expect(findSVIAccountWithFallbackMock).toHaveBeenCalledWith(
      "member@x.test",
      "proj-shared",
      "*",
      { callerEmail: "member@x.test" },
    );
  });

  it("404 when no account resolves; nothing updated", async () => {
    findSVIAccountWithFallbackMock.mockResolvedValue(null);
    expect((await POST()).status).toBe(404);
    expect(updates).toHaveLength(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("S20-B: enqueues svi.rescored (ids + score summary, source=rescore) to the project + the OWNER's endpoints after the update", async () => {
    scopeRoleMock.mockReturnValue("editor");
    expect((await POST()).status).toBe(200);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const [event, projectId, payload, opts] = enqueueMock.mock.calls[0] as unknown as [string, string, Record<string, unknown>, { userIds: string[] }];
    expect(event).toBe("svi.rescored");
    expect(projectId).toBe("proj-shared");
    expect(payload).toEqual({
      project_id: "proj-shared",
      account_id: "acc-owner",
      svi_total: 110,
      previous_svi: 100,
      delta: 10,
      stage: 2,
      source: "rescore",
      snapshot_date: new Date().toISOString().split("T")[0],
    });
    expect(Object.keys(payload).some((k) => /email|token/i.test(k))).toBe(false);
    // Recipient of user-level endpoints = the project OWNER, not the editor.
    expect(opts).toEqual({ userIds: ["owner-1"] });
  });
});
