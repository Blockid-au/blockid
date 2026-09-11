// Colocated tests for POST /api/evidence/rescore — S17-A review (P1-1).
//
// The route re-runs extractSignals + computeSVI over the project's evidence
// and WRITES a new svi_analyses row + updates svi_accounts.current_svi, so
// it is editor+ only. Pins:
//   - viewer on a shared project → 403 before any read/write
//   - editor → the account is resolved under the OWNER's email, and the
//     saved analysis is keyed (email = owner, project_id = scoped project)
//   - owner → own email

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
const scopeRoleMock = vi.fn<() => "owner" | "admin" | "editor" | "viewer">(() => "owner");
const findOrCreateSVIAccountMock = vi.fn();
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
  findOrCreateSVIAccount: (...a: unknown[]) => findOrCreateSVIAccountMock(...a),
}));

vi.mock("@/lib/svi-analysis", () => ({
  EVIDENCE_CONFIDENCE: { self_declared: 0.2, public_url: 0.5 },
  extractSignals: () => ({}),
  computeSVI: () => ({ totalSVI: 130, netAdjustment: 0, confidenceMultiplier: 1, stage: 2 }),
}));

type Row = Record<string, unknown>;
let inserts: Array<{ table: string; row: Row }> = [];
let updates: Array<{ table: string; patch: Row; filters: Array<[string, unknown]> }> = [];
let analysisFilters: Array<[string, unknown]> = [];

function fakeSupabase() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        if (table === "svi_analyses") analysisFilters.push([col, val]);
        return chain;
      };
      chain.is = (col: string, val: unknown) => {
        if (table === "svi_analyses") analysisFilters.push([col, val]);
        return chain;
      };
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.single = () =>
        Promise.resolve({
          data: table === "svi_accounts" ? { id: "acc-owner", current_svi: 100 } : null,
          error: null,
        });
      chain.maybeSingle = () =>
        Promise.resolve({
          data: table === "svi_analyses" ? { id: "an-1", raw_input: "orig", analysis_json: {} } : null,
          error: null,
        });
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: table === "svi_evidence" ? [] : null, error: null });
      chain.insert = (row: Row) => {
        inserts.push({ table, row });
        return {
          select: () => ({ single: () => Promise.resolve({ data: { id: "an-2" }, error: null }) }),
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
      };
      chain.update = (patch: Row) => {
        const call = { table, patch, filters: [] as Array<[string, unknown]> };
        updates.push(call);
        const u = {
          eq: (col: string, val: unknown) => {
            call.filters.push([col, val]);
            return u;
          },
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

import { POST } from "./route";

beforeEach(() => {
  inserts = [];
  updates = [];
  analysisFilters = [];
  fromSpy.mockReset();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "member@x.test" });
  getProjectIdFromRequestMock.mockReset();
  getProjectIdFromRequestMock.mockResolvedValue("proj-shared");
  scopeRoleMock.mockReset();
  scopeRoleMock.mockReturnValue("owner");
  findOrCreateSVIAccountMock.mockReset();
  findOrCreateSVIAccountMock.mockResolvedValue("acc-owner");
});

describe("POST /api/evidence/rescore — S17-A", () => {
  it("401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it("viewer on a shared project → 403; no account resolution, no DB access, nothing written", async () => {
    scopeRoleMock.mockReturnValue("viewer");
    const res = await POST();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(findOrCreateSVIAccountMock).not.toHaveBeenCalled();
    expect(fromSpy).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("editor on a shared project → 200; account under the OWNER's email; new analysis keyed (owner email, scoped project); svi_accounts update scoped to that account", async () => {
    scopeRoleMock.mockReturnValue("editor");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(findOrCreateSVIAccountMock).toHaveBeenCalledWith("owner@x.test", "proj-shared");
    // latest-analysis read is project-scoped under the owner's email
    expect(analysisFilters).toContainEqual(["email", "owner@x.test"]);
    expect(analysisFilters).toContainEqual(["project_id", "proj-shared"]);
    const saved = inserts.find((i) => i.table === "svi_analyses");
    expect(saved?.row.email).toBe("owner@x.test");
    expect(saved?.row.project_id).toBe("proj-shared");
    const acct = updates.find((u) => u.table === "svi_accounts");
    expect(acct?.filters).toContainEqual(["id", "acc-owner"]);
    const body = await res.json();
    expect(body.newSVI).toBe(130);
    expect(body.previousSVI).toBe(100);
  });

  it("owner → own email is the data key", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(findOrCreateSVIAccountMock).toHaveBeenCalledWith("member@x.test", "proj-shared");
    expect(inserts.find((i) => i.table === "svi_analyses")?.row.email).toBe("member@x.test");
  });

  it("no active project → legacy null-project record under the caller's own email", async () => {
    getProjectIdFromRequestMock.mockResolvedValue(null);
    await POST();
    expect(findOrCreateSVIAccountMock).toHaveBeenCalledWith("member@x.test", null);
    expect(analysisFilters).toContainEqual(["project_id", null]);
  });

  it("404 when no account resolves; nothing written", async () => {
    findOrCreateSVIAccountMock.mockResolvedValue(null);
    expect((await POST()).status).toBe(404);
    expect(inserts).toHaveLength(0);
  });
});
