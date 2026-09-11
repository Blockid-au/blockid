// Colocated tests for the shared founder-feature CRUD handlers — S18-A
// member access. These back /api/founder/{competitors,pricing-tiers,
// roadmap,team} (+ their [id] routes): every row is keyed on
// (user_id = project OWNER, project_id); viewer+ lists, editor+ mutates.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";
import type { NextRequest } from "next/server";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { listHandler, createHandler, patchHandler, deleteHandler } from "./founder-crud";

const CFG = { table: "competitors", fields: new Set(["name", "website"]), requiredFields: ["name"] };
const GET = listHandler(CFG);
const POST = createHandler(CFG);
const PATCH = patchHandler(CFG);
const DELETE = deleteHandler(CFG);

const ctx = { params: Promise.resolve({ id: "row-1" }) };
function req(body: unknown) {
  return new Request("http://x/api/founder/competitors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({ competitors: [{ id: "row-1", name: "Acme" }] });
});

describe("founder-crud — member access", () => {
  it("list as viewer on a shared project: rows keyed on the OWNER's user_id + project_id", async () => {
    scopeState.role = "viewer";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(db.sb!.hasEq("competitors", "user_id", "user-owner")).toBe(true);
    expect(db.sb!.hasEq("competitors", "project_id", "proj-1")).toBe(true);
    expect(db.sb!.hasEq("competitors", "user_id", "user-caller")).toBe(false);
    expect(scopeState.lastMinRole).toBe("viewer");
  });

  it("list as owner: keyed on the owner's own id; no project → empty list, no query", async () => {
    await GET();
    expect(db.sb!.hasEq("competitors", "user_id", "user-caller")).toBe(true);
    db.sb = fakeSupabase();
    scopeState.projectId = null;
    const res = await GET();
    expect(await res.json()).toEqual({ ok: true, items: [] });
    expect(db.sb!.calls).toEqual([]);
  });

  it.each([
    ["create", () => POST(req({ name: "New" }))],
    ["patch", () => PATCH(req({ name: "Renamed" }), ctx)],
    ["delete", () => DELETE(req({}), ctx)],
  ] as const)("%s as viewer: 403 before any DB call", async (_label, run) => {
    scopeState.role = "viewer";
    const res = await run();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(db.sb!.calls).toEqual([]);
    expect(scopeState.lastMinRole).toBe("editor");
  });

  it("create as editor: inserted under the OWNER's user_id + project_id", async () => {
    scopeState.role = "editor";
    const res = await POST(req({ name: "New", website: "", ignored: "x" }));
    expect(res.status).toBe(200);
    const [ins] = db.sb!.find("competitors", "insert");
    expect(ins.args[0]).toEqual({ user_id: "user-owner", project_id: "proj-1", name: "New", website: null });
  });

  it("patch as editor: UPDATE scoped on id + OWNER's user_id + project_id", async () => {
    scopeState.role = "editor";
    const res = await PATCH(req({ name: "Renamed" }), ctx);
    expect(res.status).toBe(200);
    expect(db.sb!.hasEq("competitors", "id", "row-1")).toBe(true);
    expect(db.sb!.hasEq("competitors", "user_id", "user-owner")).toBe(true);
    expect(db.sb!.hasEq("competitors", "project_id", "proj-1")).toBe(true);
  });

  it("delete as editor: DELETE scoped on id + OWNER's user_id + project_id", async () => {
    scopeState.role = "editor";
    const res = await DELETE(req({}), ctx);
    expect(res.status).toBe(200);
    expect(db.sb!.find("competitors", "delete")).toHaveLength(1);
    expect(db.sb!.hasEq("competitors", "user_id", "user-owner")).toBe(true);
    expect(db.sb!.hasEq("competitors", "project_id", "proj-1")).toBe(true);
  });

  it("401 when unauthenticated on every handler", async () => {
    auth.user = null;
    for (const run of [() => GET(), () => POST(req({ name: "n" })), () => PATCH(req({ name: "n" }), ctx), () => DELETE(req({}), ctx)]) {
      expect((await run()).status).toBe(401);
    }
    expect(scopeState.lastMinRole).toBeUndefined();
  });
});
