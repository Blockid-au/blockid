// Unit tests for /api/projects/members/accept audit wire-in.
//
// Iteration-14 T2 (D3-CISO-05 SOC2-lite expansion). Asserts a successful
// invite acceptance logs `project.member.accepted` with only the email
// domain (never the local-part), and that failures do not log.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => {
  class ProjectMemberScopeError extends Error {
    constructor(msg: string, public code: string = "invalid_token") {
      super(msg);
      this.name = "ProjectMemberScopeError";
    }
  }
  return {
    getCurrentUserMock: vi.fn(),
    acceptInviteMock: vi.fn(),
    ProjectMemberScopeError,
  };
});

const { getCurrentUserMock, acceptInviteMock, ProjectMemberScopeError } =
  hoisted;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => hoisted.getCurrentUserMock(),
}));

vi.mock("@/lib/project-members/scope", () => ({
  acceptInvite: (token: string, userId: string) =>
    hoisted.acceptInviteMock(token, userId),
  ProjectMemberScopeError: hoisted.ProjectMemberScopeError,
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
  extractIp: () => "10.0.0.1",
  extractUserAgent: () => "vitest",
}));

import { POST } from "./route";

beforeEach(() => {
  getCurrentUserMock.mockReset();
  acceptInviteMock.mockReset();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
});

describe("POST /api/projects/members/accept audit wire-in", () => {
  it("logs project.member.accepted with the email domain only after success", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    acceptInviteMock.mockResolvedValue({
      id: "m1",
      projectId: "proj-1",
      userEmail: "carol@corp.io",
      role: "editor",
    });

    const req = new Request("http://x/api/projects/members/accept", {
      method: "POST",
      body: JSON.stringify({ token: "tok-abc" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("project.member.accepted");
    expect(arg.subjectType).toBe("project");
    expect(arg.subjectId).toBe("proj-1");
    expect(arg.fields.member_id).toBe("m1");
    expect(arg.fields.role).toBe("editor");
    expect(arg.fields.email_domain).toBe("corp.io");
    expect(JSON.stringify(arg.fields)).not.toContain("carol");
    expect(arg.route).toBe("/api/projects/members/accept");
  });

  it("does not log when token is missing", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    const req = new Request("http://x/api/projects/members/accept", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(acceptInviteMock).not.toHaveBeenCalled();
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("does not log when acceptInvite throws (invalid_token)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    acceptInviteMock.mockRejectedValue(
      new ProjectMemberScopeError("bad", "invalid_token"),
    );
    const req = new Request("http://x/api/projects/members/accept", {
      method: "POST",
      body: JSON.stringify({ token: "tok-nope" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});
