// Colocated vitest for /api/investors/crm/contacts (S28-B).
//
// Pins: 401 / 503; GET validates the filters (400) then lists keyed on the
// resolved PROJECT (never the caller) with the role flags; POST validates
// the body before any lookup (400), a denied scope passes through (403),
// no project → 409 no_project, a duplicate email → 409 with the existing
// id, and an editor inserts the row keyed on the project with created_by
// = the CALLER, email lower-cased, 201.

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
const CONTACT = { id: "c1", project_id: PID, name: "Jane Chen", email: "jane@bb.vc", stage: "meeting", type: "vc", tags: [], archived_at: null, created_at: "2026-09-01T00:00:00.000Z" };

let sb: FakeSupabase;
const getReq = (qs = "") => new Request(`http://localhost/api/investors/crm/contacts${qs}`) as unknown as NextRequest;
const postReq = (body: unknown) =>
  new Request("http://localhost/api/investors/crm/contacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  sb = fakeSupabase({ investor_contacts: [CONTACT] });
  mocks.sb = sb;
  mocks.user = { id: "member-1", email: "m@x.test" };
  mocks.scope.mockReset().mockResolvedValue(scopeOf("editor"));
});

describe("GET /api/investors/crm/contacts", () => {
  it("401 / 503 / 400 on a bad filter, then lists keyed on the project with role flags", async () => {
    mocks.user = null;
    expect((await GET(getReq())).status).toBe(401);
    mocks.user = { id: "member-1", email: "m@x.test" };
    mocks.sb = null;
    expect((await GET(getReq())).status).toBe(503);
    mocks.sb = sb;
    expect((await GET(getReq("?stage=won"))).status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();

    mocks.scope.mockResolvedValue(scopeOf("viewer"));
    const res = await GET(getReq("?stage=meeting&q=jane"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contacts.length).toBe(1);
    expect(body).toMatchObject({ nextCursor: null, role: "viewer", canEdit: false, canExport: false });
    expect(mocks.scope).toHaveBeenCalledWith("viewer");
    expect(sb.hasEq("investor_contacts", "project_id", PID)).toBe(true);
    expect(sb.hasEq("investor_contacts", "stage", "meeting")).toBe(true);
    expect(sb.calls.some((c) => c.op === "eq" && c.args[1] === "member-1")).toBe(false);
  });

  it("owner → canEdit + canExport; no project → 409 no_project", async () => {
    mocks.scope.mockResolvedValue(scopeOf("owner"));
    expect(await (await GET(getReq())).json()).toMatchObject({ canEdit: true, canExport: true });
    mocks.scope.mockResolvedValue({ scope: null, denied: null });
    const res = await GET(getReq());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_project");
  });
});

describe("POST /api/investors/crm/contacts", () => {
  it("400 on a bad body before any lookup", async () => {
    expect((await POST(postReq("nope"), )).status).toBe(400);
    expect((await POST(postReq({ email: "a@b.co" }))).status).toBe(400);
    expect((await POST(postReq({ name: "A", stage: "won" }))).status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
    expect(sb.calls.length).toBe(0);
  });

  it("viewer → 403 from the scope helper, nothing inserted", async () => {
    mocks.scope.mockResolvedValue({ scope: null, denied: new Response("no", { status: 403 }) });
    expect((await POST(postReq({ name: "A" }))).status).toBe(403);
    expect(mocks.scope).toHaveBeenCalledWith("editor");
    expect(sb.find("investor_contacts", "insert").length).toBe(0);
  });

  it("409 duplicate_email with the existing id when the address is already on the project", async () => {
    const res = await POST(postReq({ name: "Someone", email: "JANE@bb.vc" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "duplicate_email", contactId: "c1" });
    expect(sb.hasEq("investor_contacts", "email", "jane@bb.vc")).toBe(true);
    expect(sb.find("investor_contacts", "insert").length).toBe(0);
  });

  it("editor creates: project-keyed row, lower-cased email, caller as created_by + default owner, 201", async () => {
    sb.rows.investor_contacts = [];
    const res = await POST(postReq({ name: " Sam  Lee ", email: "Sam@Angel.CO", org: "Angel Co", type: "angel", stage: "contacted", tags: ["Lead"], nextStep: "Send deck", nextStepDue: "2026-09-20" }));
    expect(res.status).toBe(201);
    const ins = sb.find("investor_contacts", "insert");
    expect(ins.length).toBe(1);
    expect(ins[0].args[0]).toMatchObject({
      project_id: PID,
      name: "Sam Lee",
      email: "sam@angel.co",
      org: "Angel Co",
      type: "angel",
      stage: "contacted",
      source: "manual",
      tags: ["lead"],
      next_step: "Send deck",
      next_step_due: "2026-09-20",
      owner_user_id: "member-1",
      created_by: "member-1",
    });
  });
});
