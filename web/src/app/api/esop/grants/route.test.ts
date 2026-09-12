// Colocated tests for /api/esop/grants — S18-A member access.
//
// Grants are keyed on (user_id = project OWNER, project_id): viewer+ lists,
// editor+ creates (an ESOP grant is an ownership change an accepted editor
// may make). Same rule for the [id] status routes.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { describeMemberAccess } from "@/test/member-access-suite";
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
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: async () =>
    auth.user ? { ok: true, user: auth.user } : { ok: false, response: new Response("no", { status: 401 }) },
}));

const grants = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), get: vi.fn(), updateStatus: vi.fn() }));
vi.mock("@/lib/esop-grants", () => ({
  listGrants: (...a: unknown[]) => grants.list(...a),
  createGrant: (...a: unknown[]) => grants.create(...a),
  getGrant: (...a: unknown[]) => grants.get(...a),
  updateGrantStatus: (...a: unknown[]) => grants.updateStatus(...a),
  isValidStatus: (s: unknown) => s === "active" || s === "exercised" || s === "lapsed" || s === "cancelled",
}));

import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";

const VALID = {
  granteeName: "Ava",
  grantDate: "2026-01-15",
  sharesUnderOption: 1000,
  strikePriceAud: 0.5,
  vestingYears: 4,
  cliffMonths: 12,
};

function post(body: unknown = VALID) {
  return new Request("http://x/api/esop/grants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}
const ctx = { params: Promise.resolve({ id: "g-1" }) };

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test" };
  grants.list.mockReset().mockResolvedValue([]);
  grants.create.mockReset().mockResolvedValue({ id: "g-1" });
  grants.get.mockReset().mockResolvedValue({ id: "g-1", status: "active" });
  grants.updateStatus.mockReset().mockResolvedValue(true);
}
beforeEach(reset);

describeMemberAccess("GET /api/esop/grants", { state: scopeState, kind: "read", reset, run: () => GET() });
describeMemberAccess("POST /api/esop/grants", { state: scopeState, kind: "write", reset, run: () => POST(post()), okStatus: 201 });

describe("/api/esop/grants — data keys", () => {
  it("viewer on a shared project lists the OWNER's grants for the project", async () => {
    scopeState.role = "viewer";
    await GET();
    expect(grants.list).toHaveBeenCalledWith("user-owner", "proj-1");
  });

  it("editor creates the grant under the OWNER's user_id", async () => {
    scopeState.role = "editor";
    const res = await POST(post());
    expect(res.status).toBe(201);
    expect(grants.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-owner", projectId: "proj-1" }));
  });

  it("viewer: 403 on POST before createGrant", async () => {
    scopeState.role = "viewer";
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(grants.create).not.toHaveBeenCalled();
  });

  it("no project: owner's own legacy grants", async () => {
    scopeState.projectId = null;
    await GET();
    expect(grants.list).toHaveBeenCalledWith("user-caller", null);
  });
});

describe("/api/esop/grants/[id] — member access", () => {
  it("viewer: 403 on PATCH and DELETE; no grant lookup", async () => {
    scopeState.role = "viewer";
    expect((await PATCH(post({ status: "lapsed" }), ctx)).status).toBe(403);
    expect((await DELETE(post(), ctx)).status).toBe(403);
    expect(grants.get).not.toHaveBeenCalled();
  });

  it("editor: grant looked up + updated under the OWNER's user_id AND the active project_id", async () => {
    scopeState.role = "editor";
    const res = await PATCH(post({ status: "lapsed" }), ctx);
    expect(res.status).toBe(200);
    expect(grants.get).toHaveBeenCalledWith("g-1", "user-owner", "proj-1");
    expect(grants.updateStatus).toHaveBeenCalledWith("g-1", "user-owner", "lapsed", "proj-1");
    await DELETE(post(), ctx);
    expect(grants.updateStatus).toHaveBeenCalledWith("g-1", "user-owner", "cancelled", "proj-1");
  });

  it("owner: keyed on the owner's own id + project", async () => {
    await PATCH(post({ status: "exercised" }), ctx);
    expect(grants.get).toHaveBeenCalledWith("g-1", "user-caller", "proj-1");
  });

  it("owner with no active project: legacy (null project) key", async () => {
    scopeState.projectId = null;
    await PATCH(post({ status: "exercised" }), ctx);
    expect(grants.get).toHaveBeenCalledWith("g-1", "user-caller", null);
    expect(grants.updateStatus).toHaveBeenCalledWith("g-1", "user-caller", "exercised", null);
  });

  // S18-A review P1-1 — a grant id from the owner's OTHER project resolves
  // null under the active project's boundary → 404, no status write.
  it("editor on project A with a grant id from project B: 404 on PATCH + DELETE, no update", async () => {
    scopeState.role = "editor";
    scopeState.projectId = "proj-A";
    grants.get.mockResolvedValue(null);
    const patched = await PATCH(post({ status: "lapsed" }), { params: Promise.resolve({ id: "g-in-B" }) });
    expect(patched.status).toBe(404);
    const deleted = await DELETE(post(), { params: Promise.resolve({ id: "g-in-B" }) });
    expect(deleted.status).toBe(404);
    expect(grants.get).toHaveBeenCalledWith("g-in-B", "user-owner", "proj-A");
    expect(grants.updateStatus).not.toHaveBeenCalled();
  });
});
