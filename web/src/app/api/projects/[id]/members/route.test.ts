// Unit tests for /api/projects/[id]/members audit wire-in + access.
//
// Iteration-14 T2 (D3-CISO-05 SOC2-lite expansion). Asserts:
//   POST    → logs project.member.invited (email domain only, no local-part)
//   DELETE  → logs project.member.revoked
// No audit row on validation/auth failures.
//
// S17-A review P2-3: access goes through assertProjectAccess(…, "admin")
// from lib/projects — a NON-member gets 404 (same as a missing project),
// never 403, so the route is not an existence oracle. Only an accepted
// member below admin sees 403.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => {
  class ProjectMemberScopeError extends Error {
    constructor(msg: string, public code: string = "not_owner") {
      super(msg);
      this.name = "ProjectMemberScopeError";
    }
  }
  // Duck-typed like lib/projects.ProjectAccessError (http.ts matches on
  // name + code, not instanceof).
  class ProjectAccessError extends Error {
    constructor(msg: string, public code: "not_found" | "forbidden" | "service_unavailable") {
      super(msg);
      this.name = "ProjectAccessError";
    }
  }
  return {
    getCurrentUserMock: vi.fn(),
    assertProjectAccessMock: vi.fn(),
    listMembersMock: vi.fn(),
    inviteMemberMock: vi.fn(),
    revokeMemberMock: vi.fn(),
    ProjectMemberScopeError,
    ProjectAccessError,
  };
});

const {
  getCurrentUserMock,
  assertProjectAccessMock,
  listMembersMock,
  inviteMemberMock,
  revokeMemberMock,
  ProjectAccessError,
} = hoisted;

const OWNER_ACCESS = {
  project: { id: "proj-1", userId: "u1", role: "owner" },
  role: "owner",
  isOwner: true,
  ownerUserId: "u1",
};

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => hoisted.getCurrentUserMock(),
}));

vi.mock("@/lib/projects", () => ({
  assertProjectAccess: (...a: unknown[]) => hoisted.assertProjectAccessMock(...a),
}));

vi.mock("@/lib/project-members/scope", () => ({
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

import { GET, POST, DELETE } from "./route";

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  assertProjectAccessMock.mockReset();
  listMembersMock.mockReset();
  inviteMemberMock.mockReset();
  revokeMemberMock.mockReset();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
});

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
});

// ---------------------------------------------------------------------------
// Release QA-2 F3 — invite_url is the canonical public origin
// ---------------------------------------------------------------------------

describe("release QA-2 F3 — invite_url uses the canonical site URL, never request.url", () => {
  it("returns https://blockid.au/invites/<token> even when the request hit the upstream bind address", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    assertProjectAccessMock.mockResolvedValue(OWNER_ACCESS);
    inviteMemberMock.mockResolvedValue({
      id: "m1",
      projectId: "proj-1",
      userEmail: "alice@example.com",
      role: "viewer",
      token: "tok-abc",
    });
    const req = new Request("https://0.0.0.0:4001/api/projects/proj-1/members", {
      method: "POST",
      headers: { host: "0.0.0.0:4001" },
      body: JSON.stringify({ email: "alice@example.com", role: "viewer" }),
    });
    const res = await POST(req, params("proj-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invite_url).toBe("https://blockid.au/invites/tok-abc");
  });

  it("falls back to https://blockid.au when no site URL env is set", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const prevSite = process.env.SITE_URL;
    delete process.env.SITE_URL;
    try {
      getCurrentUserMock.mockResolvedValue({ id: "u1" });
      assertProjectAccessMock.mockResolvedValue(OWNER_ACCESS);
      inviteMemberMock.mockResolvedValue({
        id: "m1",
        projectId: "proj-1",
        userEmail: "alice@example.com",
        role: "viewer",
        token: "tok-xyz",
      });
      const req = new Request("http://x/api/projects/proj-1/members", {
        method: "POST",
        body: JSON.stringify({ email: "alice@example.com", role: "viewer" }),
      });
      const res = await POST(req, params("proj-1"));
      expect((await res.json()).invite_url).toBe("https://blockid.au/invites/tok-xyz");
    } finally {
      if (prevSite !== undefined) process.env.SITE_URL = prevSite;
    }
  });
});

// ---------------------------------------------------------------------------
// S17-A review P2-3 — no existence oracle
// ---------------------------------------------------------------------------

describe("S17-A review P2-3 — /members access chokepoint", () => {
  const notFound = () => new ProjectAccessError("project not found", "not_found");
  const forbidden = () => new ProjectAccessError("role 'viewer' is below 'admin'", "forbidden");

  it("GET: non-member → 404 (identical to a missing project), roster never read", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "stranger" });
    assertProjectAccessMock.mockRejectedValue(notFound());
    const res = await GET(new Request("http://x/api/projects/proj-1/members"), params("proj-1"));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
    expect(assertProjectAccessMock).toHaveBeenCalledWith("stranger", "proj-1", "admin");
    expect(listMembersMock).not.toHaveBeenCalled();
  });

  it("GET: accepted viewer/editor → 403 (below admin); admin member / owner → 200", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u2" });
    assertProjectAccessMock.mockRejectedValueOnce(forbidden());
    const denied = await GET(new Request("http://x/api/projects/proj-1/members"), params("proj-1"));
    expect(denied.status).toBe(403);
    expect(listMembersMock).not.toHaveBeenCalled();

    assertProjectAccessMock.mockResolvedValueOnce({ ...OWNER_ACCESS, role: "admin", isOwner: false });
    listMembersMock.mockResolvedValue([{ id: "m1" }]);
    const ok = await GET(new Request("http://x/api/projects/proj-1/members"), params("proj-1"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).members).toEqual([{ id: "m1" }]);
  });

  it("POST: non-member → 404, no invite, no audit row", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "stranger" });
    assertProjectAccessMock.mockRejectedValue(notFound());
    const req = new Request("http://x/api/projects/proj-1/members", {
      method: "POST",
      body: JSON.stringify({ email: "alice@example.com", role: "viewer" }),
    });
    const res = await POST(req, params("proj-1"));
    expect(res.status).toBe(404);
    expect(inviteMemberMock).not.toHaveBeenCalled();
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("DELETE: non-member → 404, nothing revoked; editor member → 403", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "stranger" });
    assertProjectAccessMock.mockRejectedValueOnce(notFound());
    const req = () =>
      new Request("http://x/api/projects/proj-1/members?memberId=m1", { method: "DELETE" });
    expect((await DELETE(req(), params("proj-1"))).status).toBe(404);
    expect(revokeMemberMock).not.toHaveBeenCalled();

    assertProjectAccessMock.mockRejectedValueOnce(forbidden());
    expect((await DELETE(req(), params("proj-1"))).status).toBe(403);
    expect(revokeMemberMock).not.toHaveBeenCalled();
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects/[id]/members audit wire-in", () => {
  it("logs project.member.invited with the email domain only after success", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    assertProjectAccessMock.mockResolvedValue(OWNER_ACCESS);
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

  it("does not log when the access check throws (member below admin → 403)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    assertProjectAccessMock.mockRejectedValue(
      new ProjectAccessError("below admin", "forbidden"),
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
    assertProjectAccessMock.mockResolvedValue(OWNER_ACCESS);
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
    assertProjectAccessMock.mockResolvedValue(OWNER_ACCESS);
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
