// Colocated vitest for GET /api/audit-log/export (S20-A).
// Pins: 401 unauthenticated, project-scope denials pass through, 403 for
// admins/members (owner-only), owner gets a formula-guarded CSV attachment
// scoped to the current project with the URL filters applied.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const scopeMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/project-members/http", () => ({ projectScopeOrDeny: () => scopeMock() }));

const listMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, listAuditEvents: (q: unknown) => listMock(q) };
});

import { GET } from "./route";

const ME = "11111111-2222-4333-8444-555555555555";
const PID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function req(qs = "") {
  return new Request(`http://localhost/api/audit-log/export${qs}`);
}

describe("GET /api/audit-log/export", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset().mockResolvedValue({ id: ME, email: "o@x.au" });
    scopeMock.mockReset().mockResolvedValue({ scope: { projectId: PID, role: "owner", isOwner: true }, denied: null });
    listMock.mockReset().mockResolvedValue([
      { id: 1, ts: "2026-09-12T00:00:00.000Z", user_id: ME, actor: "user", action: "projects.update", resource_type: "project", resource_id: "=cmd", detail: { method: "PATCH", route: "/api/projects/:id", status: 200, actor_role: "owner", project_id: PID, ua_family: "chrome" } },
    ]);
  });

  it("401 when not signed in", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it("passes a scope denial through", async () => {
    scopeMock.mockResolvedValue({ scope: null, denied: new Response("no", { status: 403 }) });
    expect((await GET(req())).status).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });

  it.each([
    ["admin", { projectId: PID, role: "admin", isOwner: false }],
    ["viewer", { projectId: PID, role: "viewer", isOwner: false }],
    ["no project", null],
  ])("403 for %s (owner-only)", async (_label, scope) => {
    scopeMock.mockResolvedValue({ scope, denied: null });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(listMock).not.toHaveBeenCalled();
  });

  it("owner: CSV attachment, project pinned, filters applied, cells formula-guarded", async () => {
    const res = await GET(req(`?project=bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee&action=projects&actor=${ME}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ projectId: PID, actorUserId: ME, actionPrefix: "projects", limit: 5000 }));
    const text = await res.text();
    expect(text.split("\r\n")[0]).toMatch(/^id,ts,actor_user_id/);
    expect(text).toContain("'=cmd");
    expect(text).not.toMatch(/,=cmd/);
  });
});
