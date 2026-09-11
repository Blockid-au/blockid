// Colocated tests for /api/founder/gtm — S18-A member access.
//
// The GTM strategy row is keyed on (user_id = project OWNER, project_id):
// viewer+ reads it, editor+ upserts it (onConflict project_id).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { describeMemberAccess } from "@/test/member-access-suite";
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

import { GET, PUT } from "./route";

function put(body: unknown = { target_segment: "AU SaaS founders", ignored: "x" }) {
  return new Request("http://x/api/founder/gtm", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}
const get = () => GET({} as NextRequest);

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({ gtm_strategies: [{ id: "gtm-1", target_segment: "x" }] });
}
beforeEach(reset);

describeMemberAccess("GET /api/founder/gtm", { state: scopeState, kind: "read", reset, run: get, skipNoProject: true });
describeMemberAccess("PUT /api/founder/gtm", { state: scopeState, kind: "write", reset, run: () => PUT(put()), skipNoProject: true });

describe("/api/founder/gtm — data keys", () => {
  it("viewer on a shared project: row read with user_id = OWNER + project_id", async () => {
    scopeState.role = "viewer";
    const res = await get();
    expect(res.status).toBe(200);
    expect(db.sb!.hasEq("gtm_strategies", "user_id", "user-owner")).toBe(true);
    expect(db.sb!.hasEq("gtm_strategies", "project_id", "proj-1")).toBe(true);
  });

  it("editor: upsert payload carries the OWNER's user_id + project_id, allow-listed fields only", async () => {
    scopeState.role = "editor";
    const res = await PUT(put());
    expect(res.status).toBe(200);
    const [up] = db.sb!.find("gtm_strategies", "upsert");
    expect(up.args[0]).toEqual({ user_id: "user-owner", project_id: "proj-1", target_segment: "AU SaaS founders" });
    expect(up.args[1]).toEqual({ onConflict: "project_id" });
  });

  it("viewer: PUT is 403 before any DB call", async () => {
    scopeState.role = "viewer";
    expect((await PUT(put())).status).toBe(403);
    expect(db.sb!.calls).toEqual([]);
  });

  it("no active project: 400 on both verbs", async () => {
    scopeState.projectId = null;
    expect((await get()).status).toBe(400);
    expect((await PUT(put())).status).toBe(400);
  });
});
