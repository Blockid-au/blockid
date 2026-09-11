// Colocated tests for POST /api/svi/rescore-from-evidence — S17-A review
// (P1-1). Editor+ only (it updates svi_accounts + svi_analyses); the
// startup record is keyed under the OWNER's email and the scoped
// project_id — never email alone.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
const scopeRoleMock = vi.fn<() => "owner" | "admin" | "editor" | "viewer">(() => "owner");
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
}));

vi.mock("@/lib/svi-analysis", () => ({
  extractSignals: () => ({}),
  computeSVI: () => ({ totalSVI: 120, netAdjustment: 0, confidenceMultiplier: 1, stage: 2, subs: [] }),
}));
vi.mock("@/lib/badges", () => ({ checkAndAwardBadges: async () => [] }));

type Row = Record<string, unknown>;
let accountFilters: Array<[string, unknown]> = [];
let analysisFilters: Array<[string, unknown]> = [];
let updates: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
let accountRow: Row | null = { id: "acc-owner", current_svi: 100 };

function fakeSupabase() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const track = (col: string, val: unknown) => {
        if (table === "svi_accounts") accountFilters.push([col, val]);
        if (table === "svi_analyses") analysisFilters.push([col, val]);
      };
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => { track(col, val); return chain; };
      chain.is = (col: string, val: unknown) => { track(col, val); return chain; };
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.maybeSingle = () =>
        Promise.resolve({
          data:
            table === "svi_accounts"
              ? accountRow
              : table === "svi_analyses"
                ? { id: "an-1", raw_input: "orig", analysis_json: {} }
                : null,
          error: null,
        });
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: table === "svi_evidence" ? [] : null, count: 0, error: null });
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

import { POST } from "./route";

beforeEach(() => {
  accountFilters = [];
  analysisFilters = [];
  updates = [];
  accountRow = { id: "acc-owner", current_svi: 100 };
  fromSpy.mockReset();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "member@x.test" });
  getProjectIdFromRequestMock.mockReset();
  getProjectIdFromRequestMock.mockResolvedValue("proj-shared");
  scopeRoleMock.mockReset();
  scopeRoleMock.mockReturnValue("owner");
});

describe("POST /api/svi/rescore-from-evidence — S17-A", () => {
  it("401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it("viewer on a shared project → 403; no DB access, nothing updated", async () => {
    scopeRoleMock.mockReturnValue("viewer");
    const res = await POST();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(fromSpy).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("editor on a shared project → 200; account looked up by (OWNER email, scoped project_id); updates scoped to that account", async () => {
    scopeRoleMock.mockReturnValue("editor");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(accountFilters).toContainEqual(["email", "owner@x.test"]);
    expect(accountFilters).toContainEqual(["project_id", "proj-shared"]);
    expect(analysisFilters).toContainEqual(["email", "owner@x.test"]);
    expect(analysisFilters).toContainEqual(["project_id", "proj-shared"]);
    expect(updates.find((u) => u.table === "svi_accounts")?.filters).toContainEqual(["id", "acc-owner"]);
    const body = await res.json();
    expect(body.newSVI).toBe(120);
  });

  it("owner → own email + project_id", async () => {
    await POST();
    expect(accountFilters).toContainEqual(["email", "member@x.test"]);
    expect(accountFilters).toContainEqual(["project_id", "proj-shared"]);
  });

  it("no active project → (own email, project_id IS NULL)", async () => {
    getProjectIdFromRequestMock.mockResolvedValue(null);
    await POST();
    expect(accountFilters).toContainEqual(["email", "member@x.test"]);
    expect(accountFilters).toContainEqual(["project_id", null]);
  });

  it("404 when no account row matches; nothing updated", async () => {
    accountRow = null;
    expect((await POST()).status).toBe(404);
    expect(updates).toHaveLength(0);
  });
});
