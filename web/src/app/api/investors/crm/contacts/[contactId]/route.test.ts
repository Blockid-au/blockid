// Colocated vitest for /api/investors/crm/contacts/[contactId] (S28-B).
//
// Pins: GET (viewer) returns the contact + timeline scoped to (id,
// project) and 404s a stranger's id; PATCH validates before any lookup
// (400), viewer → 403, editor updates scoped to (id, project), a stage
// move writes the status_change touchpoint, archive / restore stamp
// archived_at, and an email that collides answers 409 duplicate_email.

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

import { GET, PATCH } from "./route";

const OWNER = "owner-1";
const PID = "proj-1";
const scopeOf = (role: string) => ({
  scope: { projectId: PID, role, isOwner: role === "owner", ownerUserId: OWNER, dataEmail: "o@x.test", userId: "member-1", email: "m@x.test" },
  denied: null,
});
const CONTACT = {
  id: "c1",
  project_id: PID,
  name: "Jane Chen",
  email: "jane@bb.vc",
  stage: "meeting",
  type: "vc",
  tags: ["lead"],
  last_touch_at: null,
  next_step: null,
  next_step_due: null,
  archived_at: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

let sb: FakeSupabase;
const ctx = (contactId = "c1") => ({ params: Promise.resolve({ contactId }) });
const getReq = () => new Request("http://localhost/api/investors/crm/contacts/c1") as unknown as NextRequest;
const patchReq = (body: unknown) =>
  new Request("http://localhost/api/investors/crm/contacts/c1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  sb = fakeSupabase({ investor_contacts: [CONTACT], investor_touchpoints: [{ id: "t1", kind: "note", body: "hi" }] });
  mocks.sb = sb;
  mocks.user = { id: "member-1", email: "m@x.test" };
  mocks.scope.mockReset().mockResolvedValue(scopeOf("editor"));
});

describe("GET /api/investors/crm/contacts/[contactId]", () => {
  it("401; viewer reads the contact + timeline scoped to (id, project); 404 for a stranger's id", async () => {
    mocks.user = null;
    expect((await GET(getReq(), ctx())).status).toBe(401);
    mocks.user = { id: "member-1", email: "m@x.test" };
    mocks.scope.mockResolvedValue(scopeOf("viewer"));
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contact.id).toBe("c1");
    expect(body.touchpoints.length).toBe(1);
    expect(sb.hasEq("investor_contacts", "id", "c1")).toBe(true);
    expect(sb.hasEq("investor_contacts", "project_id", PID)).toBe(true);
    expect(sb.hasEq("investor_touchpoints", "contact_id", "c1")).toBe(true);
    expect((await GET(getReq(), ctx("c-other"))).status).toBe(404);
  });
});

describe("PATCH /api/investors/crm/contacts/[contactId]", () => {
  it("400 before any lookup; viewer → 403; 404 for another project's row", async () => {
    expect((await PATCH(patchReq("x"), ctx())).status).toBe(400);
    expect((await PATCH(patchReq({}), ctx())).status).toBe(400);
    expect((await PATCH(patchReq({ archived: "yes" }), ctx())).status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
    mocks.scope.mockResolvedValueOnce({ scope: null, denied: new Response("no", { status: 403 }) });
    expect((await PATCH(patchReq({ name: "X" }), ctx())).status).toBe(403);
    expect(mocks.scope).toHaveBeenCalledWith("editor");
    expect((await PATCH(patchReq({ name: "X" }), ctx("nope"))).status).toBe(404);
    expect(sb.find("investor_contacts", "update").length).toBe(0);
  });

  it("editor updates fields scoped to (id, project)", async () => {
    const res = await PATCH(patchReq({ name: "Jane C", nextStep: "Send SAFE", nextStepDue: "2026-09-20", tags: ["lead", "Sydney"], ownerUserId: null }), ctx());
    expect(res.status).toBe(200);
    const upd = sb.find("investor_contacts", "update");
    expect(upd.length).toBe(1);
    expect(upd[0].args[0]).toMatchObject({ name: "Jane C", next_step: "Send SAFE", next_step_due: "2026-09-20", tags: ["lead", "sydney"], owner_user_id: null });
    expect("stage" in (upd[0].args[0] as object)).toBe(false);
    expect(sb.hasEq("investor_contacts", "id", "c1")).toBe(true);
    expect(sb.hasEq("investor_contacts", "project_id", PID)).toBe(true);
    expect(sb.find("investor_touchpoints", "insert").length).toBe(0);
  });

  it("S29-hardening: PATCH ownerUserId to a non-member → 400 owner_not_member, nothing written; an accepted member or the owner is accepted; null clears", async () => {
    const MEMBER = "33333333-3333-4333-8333-333333333333";
    const STRANGER = "44444444-4444-4444-8444-444444444444";
    sb.rows.project_members = [{ id: "pm1", project_id: PID, user_id: MEMBER, status: "accepted", role: "editor" }];
    const bad = await PATCH(patchReq({ ownerUserId: STRANGER }), ctx());
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ ok: false, error: "owner_not_member" });
    expect(sb.find("investor_contacts", "update")).toHaveLength(0);

    expect((await PATCH(patchReq({ ownerUserId: MEMBER }), ctx())).status).toBe(200);
    expect(sb.find("investor_contacts", "update")[0].args[0]).toMatchObject({ owner_user_id: MEMBER });
    const OWNER_UUID = "55555555-5555-4555-8555-555555555555";
    const base = scopeOf("editor");
    mocks.scope.mockResolvedValue({ ...base, scope: { ...base.scope, ownerUserId: OWNER_UUID } });
    expect((await PATCH(patchReq({ ownerUserId: OWNER_UUID }), ctx())).status).toBe(200);
    expect((await PATCH(patchReq({ ownerUserId: null }), ctx())).status).toBe(200);
    expect(sb.find("project_members", "select")).toHaveLength(2); // owner + null never hit the table
  });

  it("a stage move writes the status_change touchpoint with from/to and the caller", async () => {
    const res = await PATCH(patchReq({ stage: "diligence" }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).contact.stage).toBe("diligence");
    expect(sb.find("investor_contacts", "update").some((u) => (u.args[0] as { stage?: string }).stage === "diligence")).toBe(true);
    const tp = sb.find("investor_touchpoints", "insert")[0].args[0] as Record<string, unknown>;
    expect(tp).toMatchObject({ contact_id: "c1", project_id: PID, kind: "status_change", created_by: "member-1", meta: { from: "meeting", to: "diligence" } });
    // same stage → no row
    sb.calls.length = 0;
    await PATCH(patchReq({ stage: "meeting" }), ctx());
    expect(sb.find("investor_touchpoints", "insert").length).toBe(0);
  });

  it("archive stamps archived_at, restore clears it", async () => {
    await PATCH(patchReq({ archived: true }), ctx());
    expect(typeof (sb.find("investor_contacts", "update")[0].args[0] as { archived_at: unknown }).archived_at).toBe("string");
    sb.calls.length = 0;
    sb.rows.investor_contacts = [{ ...CONTACT, archived_at: "2026-09-10T00:00:00Z" }];
    await PATCH(patchReq({ archived: false }), ctx());
    expect((sb.find("investor_contacts", "update")[0].args[0] as { archived_at: unknown }).archived_at).toBeNull();
  });

  it("an email change that collides with another contact → 409 duplicate_email", async () => {
    sb.rows.investor_contacts = [CONTACT, { ...CONTACT, id: "c2", email: "sam@x.co", name: "Sam" }];
    // fake answers the first row for every maybeSingle, so make the clash row first for the email lookup
    const clash = { ...CONTACT, id: "c2", email: "sam@x.co", name: "Sam" };
    const orig = sb.from;
    let calls = 0;
    sb.from = (table: string) => {
      if (table === "investor_contacts") {
        calls++;
        sb.rows.investor_contacts = calls === 1 ? [CONTACT] : [clash];
      }
      return orig(table);
    };
    const res = await PATCH(patchReq({ email: "Sam@x.co" }), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "duplicate_email", contactId: "c2" });
    expect(sb.find("investor_contacts", "update").length).toBe(0);
  });
});
