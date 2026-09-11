// Colocated tests for DELETE /api/evidence/disconnect — S17-A review P1-1.
//
// Before the review this route did getProjectIdFromRequest() +
// findOrCreateSVIAccount(auth.email, projectId) with NO role gate. Because
// the reader used to resolve the owner's email internally, a VIEWER on a
// shared project could delete the owner's svi_evidence + oauth_connections.
// The route now goes through getProjectScope("editor"):
//   - viewer on a shared project → 403 before any row is touched
//   - editor → the account is resolved under the OWNER's email (dataEmail)
//   - owner / no project → unchanged behaviour

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ---- Mocks --------------------------------------------------------------

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined,
  }),
}));

const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
const scopeRoleMock = vi.fn<() => "owner" | "admin" | "editor" | "viewer">(() => "owner");
const findOrCreateSVIAccountMock = vi.fn<
  (email: string, projectId: string | null) => Promise<string | null>
>();
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
      email: "viewer@x.test",
      dataEmail: isOwner ? "viewer@x.test" : "owner@x.test",
      ownerUserId: isOwner ? "u-1" : "owner-1",
      project: { id: projectId, slug: "p", name: "P", userId: isOwner ? "u-1" : "owner-1", role },
    };
  },
  findOrCreateSVIAccount: (email: string, projectId: string | null) =>
    findOrCreateSVIAccountMock(email, projectId),
}));

// Fake supabase: auth lookups (sessions → app_users) + a delete recorder.
interface DeleteCall {
  table: string;
  filters: Array<[string, unknown]>;
}
let deletes: DeleteCall[] = [];
let sessionRow: { user_id: string } | null = { user_id: "u-1" };
let userRow: { id: string; email: string } | null = { id: "u-1", email: "viewer@x.test" };

function fakeSupabase() {
  return {
    from(table: string) {
      return {
        select() {
          const chain = {
            eq: () => chain,
            maybeSingle: () =>
              Promise.resolve({ data: table === "sessions" ? sessionRow : null, error: null }),
            single: () =>
              Promise.resolve({ data: table === "app_users" ? userRow : null, error: null }),
          };
          return chain;
        },
        delete() {
          const call: DeleteCall = { table, filters: [] };
          deletes.push(call);
          const chain = {
            eq: (col: string, val: unknown) => {
              call.filters.push([col, val]);
              return chain;
            },
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          };
          return chain;
        },
      };
    },
  };
}

const getSupabaseAdminMock = vi.fn<() => ReturnType<typeof fakeSupabase> | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { DELETE } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/evidence/disconnect", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  deletes = [];
  cookieStore.clear();
  cookieStore.set("blockid_session", "sess-1");
  sessionRow = { user_id: "u-1" };
  userRow = { id: "u-1", email: "viewer@x.test" };
  getProjectIdFromRequestMock.mockReset();
  getProjectIdFromRequestMock.mockResolvedValue("proj-shared");
  scopeRoleMock.mockReset();
  scopeRoleMock.mockReturnValue("owner");
  findOrCreateSVIAccountMock.mockReset();
  findOrCreateSVIAccountMock.mockResolvedValue("acc-owner");
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue(fakeSupabase());
});

describe("DELETE /api/evidence/disconnect — guards", () => {
  it("401 without a session cookie", async () => {
    cookieStore.delete("blockid_session");
    const res = await DELETE(req({ evidence_type: "stripe" }));
    expect(res.status).toBe(401);
    expect(deletes).toHaveLength(0);
  });

  it("503 when supabase is not configured", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await DELETE(req({ evidence_type: "stripe" }));
    expect(res.status).toBe(503);
  });

  it("400 on an evidence_type outside the whitelist", async () => {
    const res = await DELETE(req({ evidence_type: "is_admin" }));
    expect(res.status).toBe(400);
    expect(findOrCreateSVIAccountMock).not.toHaveBeenCalled();
    expect(deletes).toHaveLength(0);
  });
});

describe("DELETE /api/evidence/disconnect — S17-A review P1-1", () => {
  it("viewer on a shared project → 403 forbidden; the account is never resolved and NOTHING is deleted (owner's svi_evidence + oauth_connections untouched)", async () => {
    scopeRoleMock.mockReturnValue("viewer");
    const res = await DELETE(req({ evidence_type: "stripe" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("forbidden");
    expect(findOrCreateSVIAccountMock).not.toHaveBeenCalled();
    expect(deletes).toHaveLength(0);
  });

  it("editor on a shared project → 200; the account is resolved under the OWNER's email (scope.dataEmail), and the deletes are scoped to that account id", async () => {
    scopeRoleMock.mockReturnValue("editor");
    const res = await DELETE(req({ evidence_type: "stripe" }));
    expect(res.status).toBe(200);
    expect(findOrCreateSVIAccountMock).toHaveBeenCalledWith("owner@x.test", "proj-shared");
    expect(deletes.map((d) => d.table)).toEqual(["svi_evidence", "oauth_connections"]);
    for (const d of deletes) {
      expect(d.filters).toContainEqual(["account_id", "acc-owner"]);
    }
    expect(deletes[0].filters).toContainEqual(["evidence_type", "stripe"]);
    expect(deletes[1].filters).toContainEqual(["provider", "stripe"]);
  });

  it("owner → account resolved under their own email; github also clears github_repo_audit", async () => {
    scopeRoleMock.mockReturnValue("owner");
    const res = await DELETE(req({ evidence_type: "github" }));
    expect(res.status).toBe(200);
    expect(findOrCreateSVIAccountMock).toHaveBeenCalledWith("viewer@x.test", "proj-shared");
    expect(deletes.map((d) => d.table)).toEqual([
      "svi_evidence",
      "svi_evidence",
      "oauth_connections",
    ]);
    expect(deletes[0].filters).toContainEqual(["evidence_type", "github"]);
    expect(deletes[1].filters).toContainEqual(["evidence_type", "github_repo_audit"]);
  });

  it("no active project → falls back to the caller's own legacy (null-project) record", async () => {
    getProjectIdFromRequestMock.mockResolvedValue(null);
    const res = await DELETE(req({ evidence_type: "linkedin" }));
    expect(res.status).toBe(200);
    expect(findOrCreateSVIAccountMock).toHaveBeenCalledWith("viewer@x.test", null);
  });

  it("404 when no account can be resolved — nothing deleted", async () => {
    findOrCreateSVIAccountMock.mockResolvedValue(null);
    const res = await DELETE(req({ evidence_type: "stripe" }));
    expect(res.status).toBe(404);
    expect(deletes).toHaveLength(0);
  });
});
