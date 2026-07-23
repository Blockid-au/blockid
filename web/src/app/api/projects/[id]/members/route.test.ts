// Unit tests for /api/projects/[id]/members audit wire-in.
//
// Iteration-14 T2 (D3-CISO-05 SOC2-lite expansion). Asserts:
//   POST    → logs project.member.invited (email domain only, no local-part)
//   DELETE  → logs project.member.revoked
// No audit row on validation/auth failures.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => {
  class ProjectMemberScopeError extends Error {
    constructor(msg: string, public code: string = "not_owner") {
      super(msg);
      this.name = "ProjectMemberScopeError";
    }
  }
  return {
    getCurrentUserMock: vi.fn(),
    assertProjectOwnerMock: vi.fn(),
    assertProjectMemberCanMock: vi.fn(),
    listMembersMock: vi.fn(),
    inviteMemberMock: vi.fn(),
    revokeMemberMock: vi.fn(),
    ProjectMemberScopeError,
  };
});

const {
  getCurrentUserMock,
  assertProjectOwnerMock,
  assertProjectMemberCanMock,
  listMembersMock,
  inviteMemberMock,
  revokeMemberMock,
  ProjectMemberScopeError,
} = hoisted;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => hoisted.getCurrentUserMock(),
}));

vi.mock("@/lib/project-members/scope", () => ({
  assertProjectOwner: (...a: unknown[]) => hoisted.assertProjectOwnerMock(...a),
  assertProjectMemberCan: (...a: unknown[]) =>
    hoisted.assertProjectMemberCanMock(...a),
  listMembers: (...a: unknown[]) => hoisted.listMembersMock(...a),
  inviteMember: (...a: unknown[]) => hoisted.inviteMemberMock(...a),
  revokeMember: (...a: unknown[]) => hoisted.revokeMemberMock(...a),
  ProjectMemberScopeError: hoisted.ProjectMemberScopeError,
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
  extractIp: () => "10.0.0.1",
  extractUserAgent: () => "vitest",
}));

import { POST, DELETE } from "./route";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  assertProjectOwnerMock.mockReset();
  assertProjectMemberCanMock.mockReset();
  listMembersMock.mockReset();
  inviteMemberMock.mockReset();
  revokeMemberMock.mockReset();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
});

describe("POST /api/projects/[id]/members audit wire-in", () => {
  it("logs project.member.invited with the email domain only after success", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    assertProjectOwnerMock.mockResolvedValue(undefined);
    assertProjectMemberCanMock.mockResolvedValue(undefined);
    inviteMemberMock.mockResolvedValue({
      id: "m1",
      projectId: "proj-1",
      userEmail: "alice@Example.COM",
      role: "editor",
      token: "tok-abc",
    });

    const req = new Request("http://x/api/projects/proj-1/members", {
      method: "POST",
      body: JSON.stringify({ email: "alice@example.com", role: "editor" }),
    });
    const res = await POST(req, params("proj-1"));
    expect(res.status).toBe(200);

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("project.member.invited");
    expect(arg.subjectType).toBe("project");
    expect(arg.subjectId).toBe("proj-1");
    expect(arg.fields.member_id).toBe("m1");
    expect(arg.fields.role).toBe("editor");
    expect(arg.fields.email_domain).toBe("example.com");
    // PII-safety: local-part must never appear anywhere in the audit fields.
    expect(JSON.stringify(arg.fields)).not.toContain("alice");
  });

  it("does not log when validation fails (invalid email)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    const req = new Request("http://x/api/projects/proj-1/members", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email", role: "viewer" }),
    });
    const res = await POST(req, params("proj-1"));
    expect(res.status).toBe(400);
    expect(inviteMemberMock).not.toHaveBeenCalled();
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("does not log when the ownership check throws", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    assertProjectOwnerMock.mockRejectedValue(
      new ProjectMemberScopeError("not owner", "not_owner"),
    );
    assertProjectMemberCanMock.mockRejectedValue(
      new ProjectMemberScopeError("not owner", "not_owner"),
    );
    const req = new Request("http://x/api/projects/proj-1/members", {
      method: "POST",
      body: JSON.stringify({ email: "alice@example.com", role: "viewer" }),
    });
    const res = await POST(req, params("proj-1"));
    expect(res.status).toBe(403);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/projects/[id]/members audit wire-in", () => {
  it("logs project.member.revoked after a successful revoke", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    assertProjectOwnerMock.mockResolvedValue(undefined);
    assertProjectMemberCanMock.mockResolvedValue(undefined);
    revokeMemberMock.mockResolvedValue({
      id: "m1",
      projectId: "proj-1",
      userEmail: "bob@acme.io",
      role: "viewer",
    });

    const req = new Request(
      "http://x/api/projects/proj-1/members?memberId=m1",
      { method: "DELETE" },
    );
    const res = await DELETE(req, params("proj-1"));
    expect(res.status).toBe(200);

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("project.member.revoked");
    expect(arg.subjectType).toBe("project");
    expect(arg.subjectId).toBe("proj-1");
    expect(arg.fields.member_id).toBe("m1");
    expect(arg.fields.role).toBe("viewer");
    expect(arg.fields.email_domain).toBe("acme.io");
    expect(JSON.stringify(arg.fields)).not.toContain("bob");
  });

  it("does not log when memberId is missing", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    const req = new Request("http://x/api/projects/proj-1/members", {
      method: "DELETE",
    });
    const res = await DELETE(req, params("proj-1"));
    expect(res.status).toBe(400);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("does not log when the target member belongs to a different project", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    assertProjectOwnerMock.mockResolvedValue(undefined);
    assertProjectMemberCanMock.mockResolvedValue(undefined);
    revokeMemberMock.mockResolvedValue({
      id: "m1",
      projectId: "OTHER-project",
      userEmail: "bob@acme.io",
      role: "viewer",
    });
    const req = new Request(
      "http://x/api/projects/proj-1/members?memberId=m1",
      { method: "DELETE" },
    );
    const res = await DELETE(req, params("proj-1"));
    expect(res.status).toBe(400);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});
