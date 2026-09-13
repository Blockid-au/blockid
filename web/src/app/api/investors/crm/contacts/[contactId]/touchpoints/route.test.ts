// Colocated vitest for /api/investors/crm/contacts/[contactId]/touchpoints (S28-B).
//
// Pins: GET (viewer) lists the timeline scoped to (project, contact) and
// 404s a stranger's id; POST validates before any lookup (400 — including
// the system kinds, which a client may never write), viewer → 403, editor
// inserts the row with created_by = the CALLER and bumps last_touch_at.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  user: { id: "member-1", email: "m@x.test" } as { id: string; email: string } | null,
  scope: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.sb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/project-members/http", () => ({ projectScopeOrDeny: (...a: unknown[]) => mocks.scope(...a) }));

import { GET, POST } from "./route";

const OWNER = "owner-1";
const PID = "proj-1";
const scopeOf = (role: string) => ({
  scope: { projectId: PID, role, isOwner: role === "owner", ownerUserId: OWNER, dataEmail: "o@x.test", userId: "member-1", email: "m@x.test" },
  denied: null,
});
const CONTACT = { id: "c1", project_id: PID, name: "Jane", email: "jane@bb.vc", stage: "meeting", last_touch_at: "2026-09-01T00:00:00.000Z", archived_at: null };

let sb: FakeSupabase;
const ctx = (contactId = "c1") => ({ params: Promise.resolve({ contactId }) });
const getReq = () => new Request("http://localhost/api/investors/crm/contacts/c1/touchpoints") as unknown as NextRequest;
const postReq = (body: unknown) =>
  new Request("http://localhost/api/investors/crm/contacts/c1/touchpoints", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  sb = fakeSupabase({ investor_contacts: [CONTACT], investor_touchpoints: [{ id: "t1", kind: "note" }] });
  mocks.sb = sb;
  mocks.user = { id: "member-1", email: "m@x.test" };
  mocks.scope.mockReset().mockResolvedValue(scopeOf("editor"));
});

describe("GET", () => {
  it("401 / 503; viewer lists scoped to (project, contact); 404 for a stranger's id", async () => {
    mocks.user = null;
    expect((await GET(getReq(), ctx())).status).toBe(401);
    mocks.user = { id: "member-1", email: "m@x.test" };
    mocks.sb = null;
    expect((await GET(getReq(), ctx())).status).toBe(503);
    mocks.sb = sb;
    mocks.scope.mockResolvedValue(scopeOf("viewer"));
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).touchpoints.length).toBe(1);
    expect(sb.hasEq("investor_touchpoints", "project_id", PID)).toBe(true);
    expect(sb.hasEq("investor_touchpoints", "contact_id", "c1")).toBe(true);
    expect((await GET(getReq(), ctx("zzz"))).status).toBe(404);
  });
});

describe("POST", () => {
  it("400 before any lookup (system kinds refused); viewer → 403; 404 stranger", async () => {
    expect((await POST(postReq("x"), ctx())).status).toBe(400);
    expect((await POST(postReq({ kind: "note" }), ctx())).status).toBe(400);
    expect((await POST(postReq({ kind: "status_change", body: "x" }), ctx())).status).toBe(400);
    expect((await POST(postReq({ kind: "data_room_view", body: "x" }), ctx())).status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
    mocks.scope.mockResolvedValueOnce({ scope: null, denied: new Response("no", { status: 403 }) });
    expect((await POST(postReq({ body: "hi" }), ctx())).status).toBe(403);
    expect(mocks.scope).toHaveBeenCalledWith("editor");
    expect((await POST(postReq({ body: "hi" }), ctx("zzz"))).status).toBe(404);
    expect(sb.find("investor_touchpoints", "insert").length).toBe(0);
  });

  it("editor adds a call: row keyed on (contact, project), created_by = caller, last_touch_at bumped, 201", async () => {
    const res = await POST(postReq({ kind: "call", body: "  Walked through the SAFE  ", occurredAt: "2026-09-10T09:00:00Z" }), ctx());
    expect(res.status).toBe(201);
    const ins = sb.find("investor_touchpoints", "insert");
    expect(ins.length).toBe(1);
    expect(ins[0].args[0]).toMatchObject({
      contact_id: "c1",
      project_id: PID,
      kind: "call",
      body: "Walked through the SAFE",
      occurred_at: "2026-09-10T09:00:00.000Z",
      created_by: "member-1",
    });
    const upd = sb.find("investor_contacts", "update");
    expect(upd.length).toBe(1);
    expect(upd[0].args[0]).toMatchObject({ last_touch_at: "2026-09-10T09:00:00.000Z" });
    expect(sb.hasEq("investor_contacts", "project_id", PID)).toBe(true);
  });
});
