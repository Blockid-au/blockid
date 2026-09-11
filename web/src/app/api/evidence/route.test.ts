// Colocated tests for GET + POST /api/evidence — S17-A review (P1-1 / P2-1).
//
// GET needs viewer+ on the active project; POST needs editor+. Both key
// the startup record on `scope.dataEmail` (the OWNER's email on a shared
// project). GET passes `callerEmail` so the reader skips the owner's legacy
// null-project record for members (P2-1).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined,
  }),
}));

const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
const scopeRoleMock = vi.fn<() => "owner" | "admin" | "editor" | "viewer">(() => "owner");
const findOrCreateSVIAccountMock = vi.fn();
const findSVIAccountWithFallbackMock = vi.fn();
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
  findSVIAccountWithFallback: (...a: unknown[]) => findSVIAccountWithFallbackMock(...a),
}));

let inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
let evidenceSelectFilters: Array<[string, unknown]> = [];
let sessionRow: { user_id: string } | null = { user_id: "u-1" };
const userRow = { id: "u-1", email: "member@x.test" };

function fakeSupabase() {
  return {
    from(table: string) {
      return {
        select() {
          const chain = {
            eq: (col: string, val: unknown) => {
              if (table === "svi_evidence") evidenceSelectFilters.push([col, val]);
              return chain;
            },
            order: () => Promise.resolve({ data: [{ id: "ev-1" }], error: null }),
            maybeSingle: () =>
              Promise.resolve({ data: table === "sessions" ? sessionRow : null, error: null }),
            single: () =>
              Promise.resolve({ data: table === "app_users" ? userRow : null, error: null }),
          };
          return chain;
        },
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: "ev-new", ...row }, error: null }),
            }),
          };
        },
      };
    },
  };
}
const getSupabaseAdminMock = vi.fn<() => ReturnType<typeof fakeSupabase> | null>();
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdminMock() }));

import { GET, POST } from "./route";

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/evidence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  inserts = [];
  evidenceSelectFilters = [];
  cookieStore.clear();
  cookieStore.set("blockid_session", "s");
  sessionRow = { user_id: "u-1" };
  getProjectIdFromRequestMock.mockReset();
  getProjectIdFromRequestMock.mockResolvedValue("proj-shared");
  scopeRoleMock.mockReset();
  scopeRoleMock.mockReturnValue("owner");
  findOrCreateSVIAccountMock.mockReset();
  findOrCreateSVIAccountMock.mockResolvedValue("acc-owner");
  findSVIAccountWithFallbackMock.mockReset();
  findSVIAccountWithFallbackMock.mockResolvedValue({ id: "acc-owner" });
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue(fakeSupabase());
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("GET /api/evidence — S17-A", () => {
  it("401 without a session", async () => {
    cookieStore.delete("blockid_session");
    expect((await GET()).status).toBe(401);
    expect(findSVIAccountWithFallbackMock).not.toHaveBeenCalled();
  });

  it("viewer on a shared project → 200; the record is read under the OWNER's email with callerEmail = the viewer's (P2-1: legacy fallback skipped for members)", async () => {
    scopeRoleMock.mockReturnValue("viewer");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("viewer");
    expect(findSVIAccountWithFallbackMock).toHaveBeenCalledWith(
      "owner@x.test",
      "proj-shared",
      "id",
      { callerEmail: "member@x.test" },
    );
    expect(evidenceSelectFilters).toContainEqual(["account_id", "acc-owner"]);
  });

  it("owner → own email as both data key and callerEmail (legacy fallback allowed)", async () => {
    await GET();
    expect(findSVIAccountWithFallbackMock).toHaveBeenCalledWith(
      "member@x.test",
      "proj-shared",
      "id",
      { callerEmail: "member@x.test" },
    );
  });

  it("no account → empty list, no svi_evidence query", async () => {
    findSVIAccountWithFallbackMock.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body.evidence).toEqual([]);
    expect(evidenceSelectFilters).toHaveLength(0);
  });
});

describe("POST /api/evidence — S17-A", () => {
  it("viewer on a shared project → 403 before the account is resolved; nothing inserted", async () => {
    scopeRoleMock.mockReturnValue("viewer");
    const res = await POST(postReq({ evidenceType: "url", label: "site", valueOrUrl: "https://x" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(findOrCreateSVIAccountMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("editor on a shared project → 200; the row lands on the OWNER's account (dataEmail)", async () => {
    scopeRoleMock.mockReturnValue("editor");
    const res = await POST(postReq({ evidenceType: "url", label: "site", valueOrUrl: "https://x" }));
    expect(res.status).toBe(200);
    expect(findOrCreateSVIAccountMock).toHaveBeenCalledWith("owner@x.test", "proj-shared");
    expect(inserts[0].table).toBe("svi_evidence");
    expect(inserts[0].row.account_id).toBe("acc-owner");
    expect(inserts[0].row.confidence_level).toBe("public_url");
  });

  it("owner → own email; 400 when evidenceType/label are missing", async () => {
    const res = await POST(postReq({ evidenceType: "text", label: "note" }));
    expect(res.status).toBe(200);
    expect(findOrCreateSVIAccountMock).toHaveBeenCalledWith("member@x.test", "proj-shared");
    expect((await POST(postReq({ label: "x" }))).status).toBe(400);
  });
});
