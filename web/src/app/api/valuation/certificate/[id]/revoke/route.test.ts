// Colocated tests for POST /api/valuation/certificate/[id]/revoke (S22-A).
//
//   owner / admin revoke with a reason; editor → 403; another project's
//   certificate → 404; second revoke → 409; reason required + capped.

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
const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));
const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { POST, REASON_MAX_LEN } from "./route";

const ID = "11111111-2222-4333-8444-555555555555";

function row(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    project_id: "proj-1",
    user_id: "user-owner",
    certificate_no: "VC-AAAAA-BBBBB",
    content_hash: "blockid:v1:" + "0".repeat(64),
    payload: { version: "vc-1", valuation: { lowAud: 1, midAud: 2, highAud: 3, method: "svi", methodNote: null } },
    startup_name: "P",
    svi_score: 120,
    credits_charged: 0,
    issued_at: "2026-09-12T00:00:00Z",
    revoked_at: null,
    revoked_reason: null,
    ...over,
  };
}

function call(body: unknown, id = ID) {
  return POST(
    new Request(`http://localhost/api/valuation/certificate/${id}/revoke`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  db.sb = fakeSupabase({ valuation_certificates: [row()] });
});

describe("POST /api/valuation/certificate/[id]/revoke", () => {
  it("401 without a session; 404 for a bad id", async () => {
    auth.user = null;
    expect((await call({ reason: "x" })).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test" };
    expect((await call({ reason: "x" }, "bad")).status).toBe(404);
  });

  it("requires a reason and caps it", async () => {
    expect((await call({})).status).toBe(400);
    expect((await call({ reason: "   " })).status).toBe(400);
    expect((await call({ reason: "x".repeat(REASON_MAX_LEN + 1) })).status).toBe(400);
    expect(db.sb!.calls.length).toBe(0);
  });

  it("owner revokes: sets revoked_at + reason scoped to the project", async () => {
    const res = await call({ reason: "Re-scored after Series A" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const upd = db.sb!.find("valuation_certificates", "update");
    expect(upd.length).toBe(1);
    const patch = upd[0].args[0] as Record<string, unknown>;
    expect(patch.revoked_reason).toBe("Re-scored after Series A");
    expect(typeof patch.revoked_at).toBe("string");
    expect(db.sb!.hasEq("valuation_certificates", "project_id", "proj-1")).toBe(true);
    expect(db.sb!.find("valuation_certificates", "is").some((c) => c.args[0] === "revoked_at")).toBe(true);
  });

  it("admin member may revoke; editor → 403; viewer → 403", async () => {
    scopeState.role = "admin";
    expect((await call({ reason: "x" })).status).toBe(200);
    for (const role of ["editor", "viewer"] as const) {
      db.sb = fakeSupabase({ valuation_certificates: [row()] });
      scopeState.role = role;
      const res = await call({ reason: "x" });
      expect(res.status).toBe(403);
      expect(scopeState.lastMinRole).toBe("admin");
      expect(db.sb!.find("valuation_certificates", "update").length).toBe(0);
    }
  });

  it("another project's certificate → 404; already revoked → 409", async () => {
    db.sb = fakeSupabase({ valuation_certificates: [row({ project_id: "proj-other" })] });
    expect((await call({ reason: "x" })).status).toBe(404);
    db.sb = fakeSupabase({ valuation_certificates: [row({ revoked_at: "2026-09-13T00:00:00Z", revoked_reason: "done" })] });
    const res = await call({ reason: "x" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_revoked");
  });
});
