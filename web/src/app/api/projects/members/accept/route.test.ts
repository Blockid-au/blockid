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
    getProjectByIdMock: vi.fn(),
    ProjectMemberScopeError,
  };
});

const { getCurrentUserMock, acceptInviteMock, getProjectByIdMock, ProjectMemberScopeError } =
  hoisted;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => hoisted.getCurrentUserMock(),
}));

vi.mock("@/lib/projects", () => ({
  getProjectById: (id: string) => hoisted.getProjectByIdMock(id),
}));

vi.mock("@/lib/project-members/scope", () => ({
  acceptInvite: (token: string, userId: string, userEmail: string) =>
    hoisted.acceptInviteMock(token, userId, userEmail),
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
  getProjectByIdMock.mockReset();
  getProjectByIdMock.mockResolvedValue({ id: "proj-1", name: "Acme", slug: "acme" });
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
});

describe("S17-A: accept lands on the shared project", () => {
  it("sets the blockid_project cookie to the shared project ID (slugs are per-owner) and returns the project", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    acceptInviteMock.mockResolvedValue({
      id: "m1",
      projectId: "proj-1",
      userEmail: "carol@corp.io",
      role: "viewer",
    });
    const req = new Request("http://x/api/projects/members/accept", {
      method: "POST",
      body: JSON.stringify({ token: "tok-abc" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project).toEqual({ id: "proj-1", name: "Acme", slug: "acme", role: "viewer" });
    expect(body.redirect).toBe("/workspace");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("blockid_project=proj-1");
    expect(setCookie.toLowerCase()).toContain("path=/");
    expect(getProjectByIdMock).toHaveBeenCalledWith("proj-1");
  });

  it("still returns ok without a cookie when the project row cannot be loaded", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    getProjectByIdMock.mockResolvedValue(null);
    acceptInviteMock.mockResolvedValue({ id: "m1", projectId: "proj-gone", userEmail: "c@x.io", role: "editor" });
    const res = await POST(
      new Request("http://x/api/projects/members/accept", {
        method: "POST",
        body: JSON.stringify({ token: "tok-abc" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project).toBeNull();
    expect(body.redirect).toBe("/workspace/projects");
    expect(res.headers.get("set-cookie") ?? "").not.toContain("blockid_project");
  });
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

// S17-A review P2-5 — the invite is bound to the invited email.
describe("P2-5 invite email binding", () => {
  it("passes the signed-in user's email to acceptInvite (the binding check lives there)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "Carol@Corp.io" });
    acceptInviteMock.mockResolvedValue({ id: "m1", projectId: "proj-1", userEmail: "carol@corp.io", role: "viewer" });
    await POST(
      new Request("http://x/api/projects/members/accept", {
        method: "POST",
        body: JSON.stringify({ token: "tok-abc" }),
      }),
    );
    expect(acceptInviteMock).toHaveBeenCalledWith("tok-abc", "u1", "Carol@Corp.io");
  });

  it("invite_email_mismatch → 403 with code, no cookie, no audit row", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "wrong@z.io" });
    acceptInviteMock.mockRejectedValue(
      new ProjectMemberScopeError("this invite was sent to carol@corp.io", "invite_email_mismatch"),
    );
    const res = await POST(
      new Request("http://x/api/projects/members/accept", {
        method: "POST",
        body: JSON.stringify({ token: "tok-abc" }),
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("invite_email_mismatch");
    expect(body.error).toMatch(/carol@corp\.io/);
    expect(res.headers.get("set-cookie") ?? "").not.toContain("blockid_project");
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});
