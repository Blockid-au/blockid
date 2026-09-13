// Colocated tests for /api/data-room/clean-room (S29-A).
//
//   GET   — 401; no project → empty checklist (16 tasks, none done); viewer+
//           (non-member 404); computed tasks from the OWNER's data room.
//   PATCH — editor+ (viewer 403); validation before the scope lookup
//           (unknown task 400, computed task 409); upserts the ACTIVE
//           project's row; returns the recomputed checklist.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", plan: "founder_free" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));
const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { GET, PATCH } from "./route";

function seed() {
  db.sb = fakeSupabase({
    data_rooms: [{ id: "room-1", user_id: "user-owner", project_id: "proj-1", nda_required: true, watermark_enabled: true, updated_at: null }],
    data_room_access_tokens: [{ id: "l1", data_room_id: "room-1", investor_email: "cfo@buyer.test", investor_name: null, sections_allowed: ["Financials"], access_level: "view", is_active: true, expires_at: null, revoked_at: null }],
    data_room_engagement: [{ id: "e1" }],
    clean_room_checklists: [],
  });
}

const patch = (body: unknown, raw = false) =>
  PATCH(new Request("http://localhost/api/data-room/clean-room", { method: "PATCH", headers: { "content-type": "application/json" }, body: raw ? (body as string) : JSON.stringify(body) }));

const flat = (checklist: { stages: Array<{ tasks: Array<{ id: string; done: boolean }> }> }) => Object.fromEntries(checklist.stages.flatMap((s) => s.tasks).map((t) => [t.id, t.done]));

beforeEach(() => {
  Object.assign(scopeState, makeScopeState({ role: "editor" }));
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  seed();
});

describe("GET /api/data-room/clean-room", () => {
  it("401; no project → empty checklist; non-member 404; 503 without a database", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    scopeState.projectId = null;
    const empty = await (await GET()).json();
    expect(empty).toMatchObject({ ok: true, role: null, roomId: null, checklist: { done: 0, total: 16, pct: 0, roomExists: false } });
    expect(empty.note).toContain("not legal advice");
    Object.assign(scopeState, makeScopeState({ nonMember: true }));
    expect((await GET()).status).toBe(404);
    Object.assign(scopeState, makeScopeState({ role: "viewer" }));
    db.sb = null;
    expect((await GET()).status).toBe(503);
  });

  it("viewer: computed tasks come from the OWNER's data room", async () => {
    Object.assign(scopeState, makeScopeState({ role: "viewer" }));
    const body = await (await GET()).json();
    expect(scopeState.lastMinRole).toBe("viewer");
    expect(body.role).toBe("viewer");
    expect(body.roomId).toBe("room-1");
    const done = flat(body.checklist);
    expect(done["nda-gate"]).toBe(true);
    expect(done["nda-watermark"]).toBe(true);
    expect(done["classify-sections"]).toBe(true);
    expect(done["access-restricted"]).toBe(true);
    expect(done["access-links"]).toBe(true);
    expect(done["log-engagement"]).toBe(true);
    expect(done["scope-team"]).toBe(false);
    expect(body.checklist).toMatchObject({ done: 6, total: 16, pct: 38 });
    expect(db.sb!.hasEq("data_rooms", "project_id", "proj-1")).toBe(true);
  });
});

describe("PATCH /api/data-room/clean-room", () => {
  it("401; invalid JSON / unknown task 400 and computed task 409 before the scope lookup; viewer 403; no project 404", async () => {
    auth.user = null;
    expect((await patch({ taskId: "scope-team", done: true })).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await patch("{nope", true)).status).toBe(400);
    expect(await (await patch({ taskId: "nope", done: true })).json()).toEqual({ ok: false, error: "unknown taskId" });
    expect((await patch({ taskId: "nda-gate", done: true })).status).toBe(409);
    expect(scopeState.lastMinRole).toBeUndefined();
    Object.assign(scopeState, makeScopeState({ role: "viewer" }));
    expect((await patch({ taskId: "scope-team", done: true })).status).toBe(403);
    expect(scopeState.lastMinRole).toBe("editor");
    Object.assign(scopeState, makeScopeState({ role: "editor", projectId: null }));
    expect((await patch({ taskId: "scope-team", done: true })).status).toBe(404);
    expect(db.sb!.find("clean_room_checklists", "upsert")).toHaveLength(0);
  });

  it("editor: ticks a founder task on the project row and returns the recomputed checklist", async () => {
    const res = await patch({ taskId: "scope-team", done: true, note: "Firm A + buyer CFO office" });
    expect(res.status).toBe(200);
    const body = await res.json();
    const up = db.sb!.find("clean_room_checklists", "upsert");
    expect(up).toHaveLength(1);
    expect(up[0].args[0]).toMatchObject({ project_id: "proj-1", tasks: { "scope-team": { done: true, note: "Firm A + buyer CFO office" } } });
    expect(JSON.stringify(up[0].args[0])).not.toContain("user-caller");
    expect(body.ok).toBe(true);
    expect(body.role).toBe("editor");
    expect(body.checklist.total).toBe(16);
  });

  it("503 without a database", async () => {
    db.sb = null;
    expect((await patch({ taskId: "scope-team", done: true })).status).toBe(503);
  });
});
