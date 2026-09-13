// Unit tests for PATCH /api/projects/[id]/members/[memberId] (S30-B live QA P2).
//
// Pins: owner / accepted admin can change a role and the audit row is
// project.member.role_changed with domain-only email; an accepted editor
// gets 403; a NON-member gets 404 (never 403 — no existence oracle); a
// memberId that belongs to another project answers 404 (IDOR) with no
// audit row; a revoked row is 409; bad role / bad JSON are 400.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => {
  class ProjectMemberScopeError extends Error {
    constructor(msg: string, public code: string = "not_owner") {
      super(msg);
      this.name = "ProjectMemberScopeError";
    }
  }
  class ProjectAccessError extends Error {
    constructor(msg: string, public code: "not_found" | "forbidden" | "service_unavailable") {
      super(msg);
      this.name = "ProjectAccessError";
    }
  }
  return {
    getCurrentUserMock: vi.fn(),
    assertProjectAccessMock: vi.fn(),
    changeMemberRoleMock: vi.fn(),
    ProjectMemberScopeError,
    ProjectAccessError,
  };
});

const { getCurrentUserMock, assertProjectAccessMock, changeMemberRoleMock, ProjectAccessError, ProjectMemberScopeError } = hoisted;

const OWNER_ACCESS = { project: { id: "proj-1", userId: "u1", role: "owner" }, role: "owner", isOwner: true, ownerUserId: "u1" };
const ADMIN_ACCESS = { project: { id: "proj-1", userId: "u1", role: "admin" }, role: "admin", isOwner: false, ownerUserId: "u1" };

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => hoisted.getCurrentUserMock() }));
vi.mock("@/lib/projects", () => ({ assertProjectAccess: (...a: unknown[]) => hoisted.assertProjectAccessMock(...a) }));
vi.mock("@/lib/project-members/scope", () => ({
  changeMemberRole: (...a: unknown[]) => hoisted.changeMemberRoleMock(...a),
  ProjectMemberScopeError: hoisted.ProjectMemberScopeError,
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
  extractIp: () => "10.0.0.1",
  extractUserAgent: () => "vitest",
}));

import { PATCH } from "./route";
import { flushAudits, setAuditSink, type AuditRecord } from "@/lib/audit/api-route";

const MEMBER = { id: "m1", projectId: "proj-1", userEmail: "alice@example.com", userId: "u2", role: "editor", status: "accepted", token: "tok" };

function params(id: string, memberId = "m1") {
  return { params: Promise.resolve({ id, memberId }) };
}
function req(body: unknown, id = "proj-1", memberId = "m1") {
  return new Request(`http://x/api/projects/${id}/members/${memberId}`, {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

let records: AuditRecord[];
beforeEach(() => {
  getCurrentUserMock.mockReset();
  assertProjectAccessMock.mockReset();
  changeMemberRoleMock.mockReset();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
  records = [];
  setAuditSink(async (r) => {
    records.push(r);
  });
});
afterEach(() => setAuditSink(null));

describe("PATCH /api/projects/[id]/members/[memberId] — roles", () => {
  it("401 when anonymous — nothing consulted", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await PATCH(req({ role: "admin" }), params("proj-1"));
    expect(res.status).toBe(401);
    expect(assertProjectAccessMock).not.toHaveBeenCalled();
    expect(changeMemberRoleMock).not.toHaveBeenCalled();
  });

  it("owner: 200, role changed, audit project.member.role_changed carries from/to + domain only, apiRoute row has project_id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    assertProjectAccessMock.mockResolvedValue(OWNER_ACCESS);
    changeMemberRoleMock.mockResolvedValue({ member: { ...MEMBER, role: "admin" }, previousRole: "editor", deactivatedEndpoints: [] });
    const res = await PATCH(req({ role: "admin" }), params("proj-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.member.role).toBe("admin");
    expect(body.previousRole).toBe("editor");
    expect(assertProjectAccessMock).toHaveBeenCalledWith("u1", "proj-1", "admin");
    expect(changeMemberRoleMock).toHaveBeenCalledWith("proj-1", "m1", "admin", "u1");

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const call = logUserActionMock.mock.calls[0][0] as { action: string; fields: Record<string, unknown> };
    expect(call.action).toBe("project.member.role_changed");
    expect(call.fields).toMatchObject({ member_id: "m1", from_role: "editor", to_role: "admin", email_domain: "example.com" });
    expect(JSON.stringify(call)).not.toContain("alice");

    await flushAudits();
    expect(records).toHaveLength(1);
    expect(records[0].detail.project_id).toBe("proj-1");
    expect(records[0].resource_id).toBe("m1");
  });

  it("accepted admin member: allowed; admin → viewer downgrade reports the webhook endpoints switched off", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u9" });
    assertProjectAccessMock.mockResolvedValue(ADMIN_ACCESS);
    changeMemberRoleMock.mockResolvedValue({ member: { ...MEMBER, role: "viewer" }, previousRole: "admin", deactivatedEndpoints: ["ep-1"] });
    const res = await PATCH(req({ role: "viewer" }), params("proj-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).webhookEndpointsDeactivated).toEqual(["ep-1"]);
    const call = logUserActionMock.mock.calls[0][0] as { fields: Record<string, unknown> };
    expect(call.fields.webhook_endpoints_deactivated).toBe(1);
  });

  it("same role: 200 no-op and NO audit row", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    assertProjectAccessMock.mockResolvedValue(OWNER_ACCESS);
    changeMemberRoleMock.mockResolvedValue({ member: MEMBER, previousRole: "editor", deactivatedEndpoints: [] });
    const res = await PATCH(req({ role: "editor" }), params("proj-1"));
    expect(res.status).toBe(200);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("accepted editor: 403 forbidden, nothing written", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u2" });
    assertProjectAccessMock.mockRejectedValue(new ProjectAccessError("below admin", "forbidden"));
    const res = await PATCH(req({ role: "admin" }), params("proj-1"));
    expect(res.status).toBe(403);
    expect(changeMemberRoleMock).not.toHaveBeenCalled();
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("non-member: 404 (same as a missing project) — never 403", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "stranger" });
    assertProjectAccessMock.mockRejectedValue(new ProjectAccessError("nope", "not_found"));
    const res = await PATCH(req({ role: "admin" }), params("proj-1"));
    expect(res.status).toBe(404);
    expect(changeMemberRoleMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/projects/[id]/members/[memberId] — IDOR + validation", () => {
  it("memberId of ANOTHER project → 404 from the scope helper, no audit row", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    assertProjectAccessMock.mockResolvedValue(OWNER_ACCESS);
    changeMemberRoleMock.mockRejectedValue(new ProjectMemberScopeError("member not found", "not_found"));
    const res = await PATCH(req({ role: "viewer" }, "proj-1", "m-other"), params("proj-1", "m-other"));
    expect(res.status).toBe(404);
    expect(changeMemberRoleMock).toHaveBeenCalledWith("proj-1", "m-other", "viewer", "u1");
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("revoked member → 409 with code revoked (re-invite instead)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    assertProjectAccessMock.mockResolvedValue(OWNER_ACCESS);
    changeMemberRoleMock.mockRejectedValue(new ProjectMemberScopeError("revoked", "revoked"));
    const res = await PATCH(req({ role: "viewer" }), params("proj-1"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("revoked");
  });

  it("400 on a role outside viewer/editor/admin (owner is not a member role) and on bad JSON — before any access check", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    expect((await PATCH(req({ role: "owner" }), params("proj-1"))).status).toBe(400);
    expect((await PATCH(req({}), params("proj-1"))).status).toBe(400);
    expect((await PATCH(req("{nope"), params("proj-1"))).status).toBe(400);
    expect(assertProjectAccessMock).not.toHaveBeenCalled();
  });
});
