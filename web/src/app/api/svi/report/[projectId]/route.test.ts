// Colocated vitest for GET /api/svi/report/[projectId] — release QA-4 P1-1.
//
// Pins the IDOR fix: the snapshot query must ALWAYS carry the resolved
// account_id (the tenancy boundary) plus a project filter, the account must
// be resolved through the project scope's data email, and a caller with no
// resolvable account gets 404 — never an unfiltered "newest row" read.
//
// The fake Supabase client holds rows for two tenants and only returns a row
// when the recorded filters select it, so dropping either `.eq("account_id")`
// or the project filter surfaces here as a cross-tenant leak.

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ------------------------------------------------------------------

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

type Scope = {
  projectId: string;
  dataEmail: string;
  role: string;
  isOwner: boolean;
};
const getProjectScopeMock = vi.fn<(minRole?: string) => Promise<Scope | null>>();
const assertProjectScopeMock =
  vi.fn<(user: { id: string; email: string }, projectId: string, minRole?: string) => Promise<Scope>>();
const findSVIAccountMock =
  vi.fn<(...args: unknown[]) => Promise<{ id: string; project_id: string | null } | null>>();
vi.mock("@/lib/projects", () => ({
  getProjectScope: (minRole?: string) => getProjectScopeMock(minRole),
  assertProjectScope: (u: { id: string; email: string }, p: string, r?: string) =>
    assertProjectScopeMock(u, p, r),
  findSVIAccountWithFallback: (...args: unknown[]) => findSVIAccountMock(...args),
}));

class FakeAccessError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "ProjectAccessError";
    this.code = code;
  }
}

// --- Fake Supabase --------------------------------------------------------

type Row = {
  id: string;
  account_id: string;
  project_id: string | null;
  svi_total: number;
  created_at: string;
  criterion_results: unknown;
  dim_results: unknown;
  dimension_scores: unknown;
  analysis_json: unknown;
};

const P_A = "11111111-1111-4111-8111-111111111111";
const P_B = "22222222-2222-4222-8222-222222222222";

const ROWS: Row[] = [
  {
    id: "snap-b",
    account_id: "acct-b",
    project_id: P_B,
    svi_total: 88,
    created_at: "2026-09-12T00:00:00Z", // newest in the table — the old bug returned this for `default`
    criterion_results: [],
    dim_results: null,
    dimension_scores: { ftv: { score: 90 } },
    analysis_json: { industry: "fintech-b" },
  },
  {
    id: "snap-a",
    account_id: "acct-a",
    project_id: P_A,
    svi_total: 61,
    created_at: "2026-09-01T00:00:00Z",
    criterion_results: [],
    dim_results: null,
    dimension_scores: { ftv: { score: 60 } },
    analysis_json: { industry: "saas-a" },
  },
  {
    id: "snap-legacy-a",
    account_id: "acct-legacy-a",
    project_id: null,
    svi_total: 40,
    created_at: "2026-08-01T00:00:00Z",
    criterion_results: [],
    dim_results: null,
    dimension_scores: {},
    analysis_json: {},
  },
];

let recorded: { eq: Array<[string, unknown]>; is: Array<[string, unknown]>; or: string[] };

function makeSupabase() {
  return {
    from(table: string) {
      expect(table).toBe("svi_snapshots");
      const eq: Array<[string, unknown]> = [];
      const is: Array<[string, unknown]> = [];
      const or: string[] = [];
      recorded = { eq, is, or };
      const q = {
        select: () => q,
        order: () => q,
        limit: () => q,
        eq: (c: string, v: unknown) => {
          eq.push([c, v]);
          return q;
        },
        is: (c: string, v: unknown) => {
          is.push([c, v]);
          return q;
        },
        or: (expr: string) => {
          or.push(expr);
          return q;
        },
        maybeSingle: async () => {
          const rows = ROWS.filter((r) => {
            for (const [c, v] of eq) if ((r as Record<string, unknown>)[c] !== v) return false;
            for (const [c, v] of is) if ((r as Record<string, unknown>)[c] !== v) return false;
            for (const expr of or) {
              const m = /^project_id\.eq\.([^,]+),project_id\.is\.null$/.exec(expr);
              if (!m) return false;
              if (r.project_id !== m[1] && r.project_id !== null) return false;
            }
            return true;
          });
          rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return { data: rows[0] ?? null, error: null };
        },
      };
      return q;
    },
  };
}

async function call(projectId: string) {
  const { GET } = await import("./route");
  return GET(new Request(`http://localhost/api/svi/report/${projectId}`), {
    params: Promise.resolve({ projectId }),
  });
}

const USER_A = { id: "user-a", email: "a@example.com" };

beforeEach(() => {
  vi.resetModules();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getProjectScopeMock.mockReset();
  assertProjectScopeMock.mockReset();
  findSVIAccountMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER_A);
  getSupabaseAdminMock.mockReturnValue(makeSupabase());
});

describe("GET /api/svi/report/[projectId] — tenancy", () => {
  it("401 when unauthenticated (no scope or DB touched)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await call("default");
    expect(res.status).toBe(401);
    expect(assertProjectScopeMock).not.toHaveBeenCalled();
    expect(getProjectScopeMock).not.toHaveBeenCalled();
  });

  it("`default` resolves the cookie project and returns only the caller's own row (not the newest in the table)", async () => {
    getProjectScopeMock.mockResolvedValue({ projectId: P_A, dataEmail: USER_A.email, role: "owner", isOwner: true });
    findSVIAccountMock.mockResolvedValue({ id: "acct-a", project_id: P_A });

    const res = await call("default");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { snapshotId: string; persisted: { industry: string } };
    expect(body.snapshotId).toBe("snap-a");
    expect(body.persisted.industry).toBe("saas-a");

    expect(getProjectScopeMock).toHaveBeenCalledWith("viewer");
    expect(findSVIAccountMock).toHaveBeenCalledWith(USER_A.email, P_A, "id, project_id", {
      callerEmail: USER_A.email,
    });
    expect(recorded.eq).toContainEqual(["account_id", "acct-a"]);
    expect(recorded.eq).toContainEqual(["project_id", P_A]);
  });

  it("explicit project id goes through assertProjectScope(viewer) and is filtered on the account", async () => {
    assertProjectScopeMock.mockResolvedValue({ projectId: P_A, dataEmail: USER_A.email, role: "owner", isOwner: true });
    findSVIAccountMock.mockResolvedValue({ id: "acct-a", project_id: P_A });

    const res = await call(P_A);
    expect(res.status).toBe(200);
    expect((await res.json()).snapshotId).toBe("snap-a");
    expect(assertProjectScopeMock).toHaveBeenCalledWith(USER_A, P_A, "viewer");
    expect(getProjectScopeMock).not.toHaveBeenCalled();
    expect(recorded.eq).toContainEqual(["account_id", "acct-a"]);
    expect(recorded.eq).toContainEqual(["project_id", P_A]);
  });

  it("another tenant's project id → 404 from the role gate; no snapshot query is issued", async () => {
    assertProjectScopeMock.mockRejectedValue(new FakeAccessError("not_found"));
    recorded = { eq: [], is: [], or: [] };

    const res = await call(P_B);
    expect(res.status).toBe(404);
    expect(findSVIAccountMock).not.toHaveBeenCalled();
    expect(recorded.eq).toEqual([]);
  });

  it("member below viewer → 403 from the role gate", async () => {
    assertProjectScopeMock.mockRejectedValue(new FakeAccessError("forbidden"));
    const res = await call(P_B);
    expect(res.status).toBe(403);
    expect(findSVIAccountMock).not.toHaveBeenCalled();
  });

  it("no svi_accounts row resolves → 404, never an unfiltered query", async () => {
    getProjectScopeMock.mockResolvedValue({ projectId: P_A, dataEmail: USER_A.email, role: "owner", isOwner: true });
    findSVIAccountMock.mockResolvedValue(null);
    recorded = { eq: [], is: [], or: [] };

    const res = await call("default");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
    expect(recorded.eq).toEqual([]);
  });

  it("caller with no project at all reads only their own legacy (project_id IS NULL) record", async () => {
    getProjectScopeMock.mockResolvedValue(null);
    findSVIAccountMock.mockResolvedValue({ id: "acct-legacy-a", project_id: null });

    const res = await call("default");
    expect(res.status).toBe(200);
    expect((await res.json()).snapshotId).toBe("snap-legacy-a");
    expect(findSVIAccountMock).toHaveBeenCalledWith(USER_A.email, null, "id, project_id", {
      callerEmail: USER_A.email,
    });
    expect(recorded.eq).toContainEqual(["account_id", "acct-legacy-a"]);
    expect(recorded.is).toContainEqual(["project_id", null]);
  });

  it("legacy account under a scoped project accepts rows stamped with that project or none — still account-bound", async () => {
    getProjectScopeMock.mockResolvedValue({ projectId: P_A, dataEmail: USER_A.email, role: "owner", isOwner: true });
    findSVIAccountMock.mockResolvedValue({ id: "acct-legacy-a", project_id: null });

    const res = await call("default");
    expect(res.status).toBe(200);
    expect((await res.json()).snapshotId).toBe("snap-legacy-a");
    expect(recorded.eq).toContainEqual(["account_id", "acct-legacy-a"]);
    expect(recorded.or).toEqual([`project_id.eq.${P_A},project_id.is.null`]);
  });

  it("shared project: the member's account is resolved on the OWNER's data email with callerEmail set", async () => {
    const member = { id: "user-m", email: "m@example.com" };
    getCurrentUserMock.mockResolvedValue(member);
    assertProjectScopeMock.mockResolvedValue({ projectId: P_A, dataEmail: USER_A.email, role: "viewer", isOwner: false });
    findSVIAccountMock.mockResolvedValue({ id: "acct-a", project_id: P_A });

    const res = await call(P_A);
    expect(res.status).toBe(200);
    expect(findSVIAccountMock).toHaveBeenCalledWith(USER_A.email, P_A, "id, project_id", {
      callerEmail: member.email,
    });
  });
});
