// Colocated tests for /api/svi/phase-progress — S18-A member access.
//
//   GET  → viewer+; the svi_accounts row is looked up under the OWNER's
//          email for a member
//   POST → editor+; a viewer gets 403 before any row is read or written;
//          an editor toggles steps on the OWNER's account row

import { describe, it, expect, vi, beforeEach } from "vitest";
import { describeMemberAccess } from "@/test/member-access-suite";
import { fakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", displayName: "C" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => db.sb,
  isSupabaseConfigured: () => true,
}));

import { GET, POST } from "./route";

function post(body: unknown) {
  return new Request("http://x/api/svi/phase-progress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", displayName: "C" };
  db.sb = fakeSupabase({ svi_accounts: [{ id: "acct-1" }], startup_phase_progress: [] });
}

beforeEach(reset);

describeMemberAccess("GET /api/svi/phase-progress", {
  state: scopeState,
  kind: "read",
  reset,
  run: () => GET(),
});

describeMemberAccess("POST /api/svi/phase-progress", {
  state: scopeState,
  kind: "write",
  reset,
  run: () => POST(post({ action: "complete_step", phaseId: "vision", stepId: "v1" })),
});

describe("/api/svi/phase-progress — data key", () => {
  it("GET as viewer: account looked up under the OWNER's email + project", async () => {
    scopeState.role = "viewer";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(db.sb!.hasEq("svi_accounts", "email", "owner@x.test")).toBe(true);
    expect(db.sb!.hasEq("svi_accounts", "project_id", "proj-1")).toBe(true);
  });

  it("POST as viewer: 403, no table touched", async () => {
    scopeState.role = "viewer";
    const res = await POST(post({ action: "complete_step", phaseId: "vision", stepId: "v1" }));
    expect(res.status).toBe(403);
    expect(db.sb!.calls).toEqual([]);
  });

  it("POST as editor: writes progress on the OWNER's account", async () => {
    scopeState.role = "editor";
    const res = await POST(post({ action: "complete_step", phaseId: "vision", stepId: "v1" }));
    expect(res.status).toBeLessThan(500);
    expect(db.sb!.hasEq("svi_accounts", "email", "owner@x.test")).toBe(true);
    expect(db.sb!.hasEq("svi_accounts", "email", "caller@x.test")).toBe(false);
  });
});
