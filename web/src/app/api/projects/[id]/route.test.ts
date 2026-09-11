// Unit tests for /api/projects/[id].
//
// Iteration-14 T2 (D3-CISO-05 SOC2-lite expansion): a successful PATCH logs
// a `project.updated` audit row listing only the KEYS the caller touched.
//
// S17-A: the route is member-aware via assertProjectAccess —
//   GET → viewer+, PATCH → editor+, DELETE → admin+; non-member → 404.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const hoisted = vi.hoisted(() => {
  class ProjectAccessError extends Error {
    constructor(
      msg: string,
      public code: "not_found" | "forbidden" | "service_unavailable",
    ) {
      super(msg);
      this.name = "ProjectAccessError";
    }
    get status() {
      return this.code === "not_found" ? 404 : this.code === "forbidden" ? 403 : 503;
    }
  }
  return { ProjectAccessError };
});
const { ProjectAccessError } = hoisted;

const assertProjectAccessMock = vi.fn();
const getProjectMock = vi.fn();
const updateProjectMock = vi.fn();
const archiveProjectMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  ProjectAccessError: hoisted.ProjectAccessError,
  assertProjectAccess: (userId: string, id: string, minRole: string) =>
    assertProjectAccessMock(userId, id, minRole),
  getProject: (userId: string, id: string) => getProjectMock(userId, id),
  updateProject: (id: string, patch: unknown) => updateProjectMock(id, patch),
  archiveProject: (id: string) => archiveProjectMock(id),
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
  extractIp: () => "10.0.0.1",
  extractUserAgent: () => "vitest",
}));

import { GET, PATCH, DELETE } from "./route";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const PROJECT = { id: "proj-1", userId: "owner-1", name: "Acme", isDefault: false };

function grant(role: "owner" | "admin" | "editor" | "viewer") {
  assertProjectAccessMock.mockImplementation(async (_u: string, _id: string, minRole: string) => {
    const rank = { viewer: 1, editor: 2, admin: 3, owner: 4 } as const;
    if (rank[role] < rank[minRole as keyof typeof rank]) {
      throw new ProjectAccessError("below", "forbidden");
    }
    return { project: { ...PROJECT, role }, role, isOwner: role === "owner", ownerUserId: "owner-1" };
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  assertProjectAccessMock.mockReset();
  getProjectMock.mockReset();
  updateProjectMock.mockReset();
  archiveProjectMock.mockReset();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
  getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
});

describe("PATCH /api/projects/[id] audit wire-in", () => {
  it("logs project.updated with the changed field keys after a successful update", async () => {
    grant("owner");
    getProjectMock.mockResolvedValue({ ...PROJECT, name: "new", role: "owner" });
    updateProjectMock.mockResolvedValue({ ok: true });

    const req = new Request("http://x/api/projects/proj-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "new", industry: "fintech" }),
    });
    const res = await PATCH(req, params("proj-1"));
    expect(res.status).toBe(200);
    expect(assertProjectAccessMock).toHaveBeenCalledWith("u1", "proj-1", "editor");

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("project.updated");
    expect(arg.subjectType).toBe("project");
    expect(arg.subjectId).toBe("proj-1");
    expect(arg.fields.changed).toEqual(["name", "industry"]);
    expect(arg.route).toBe("/api/projects/proj-1");
  });

  it("does not log when the update fails", async () => {
    grant("owner");
    updateProjectMock.mockResolvedValue({ ok: false, error: "boom" });

    const req = new Request("http://x/api/projects/proj-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "new" }),
    });
    const res = await PATCH(req, params("proj-1"));
    expect(res.status).toBe(500);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("does not log when auth is denied", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const req = new Request("http://x/api/projects/proj-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
    });
    const res = await PATCH(req, params("proj-1"));
    expect(res.status).toBe(401);
    expect(logUserActionMock).not.toHaveBeenCalled();
    expect(assertProjectAccessMock).not.toHaveBeenCalled();
  });
});

describe("S17-A member-aware access", () => {
  it("GET returns the project + role for a viewer member", async () => {
    grant("viewer");
    const res = await GET(new Request("http://x/api/projects/proj-1"), params("proj-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("viewer");
    expect(body.project.role).toBe("viewer");
    expect(assertProjectAccessMock).toHaveBeenCalledWith("u1", "proj-1", "viewer");
  });

  it("GET returns 404 for a non-member (existence not confirmed)", async () => {
    assertProjectAccessMock.mockRejectedValue(new ProjectAccessError("nf", "not_found"));
    const res = await GET(new Request("http://x/api/projects/proj-1"), params("proj-1"));
    expect(res.status).toBe(404);
  });

  it("PATCH is allowed for an editor member", async () => {
    grant("editor");
    updateProjectMock.mockResolvedValue({ ok: true });
    getProjectMock.mockResolvedValue({ ...PROJECT, role: "editor" });
    const req = new Request("http://x/api/projects/proj-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "renamed" }),
    });
    const res = await PATCH(req, params("proj-1"));
    expect(res.status).toBe(200);
    expect(updateProjectMock).toHaveBeenCalledWith("proj-1", expect.objectContaining({ name: "renamed" }));
  });

  it("PATCH is blocked (403) for a viewer member and nothing is written", async () => {
    grant("viewer");
    const req = new Request("http://x/api/projects/proj-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "renamed" }),
    });
    const res = await PATCH(req, params("proj-1"));
    expect(res.status).toBe(403);
    expect(updateProjectMock).not.toHaveBeenCalled();
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("DELETE (archive) requires admin — editor gets 403, admin member succeeds", async () => {
    grant("editor");
    let res = await DELETE(new Request("http://x/api/projects/proj-1", { method: "DELETE" }), params("proj-1"));
    expect(res.status).toBe(403);
    expect(archiveProjectMock).not.toHaveBeenCalled();

    grant("admin");
    archiveProjectMock.mockResolvedValue({ ok: true });
    res = await DELETE(new Request("http://x/api/projects/proj-1", { method: "DELETE" }), params("proj-1"));
    expect(res.status).toBe(200);
    expect(assertProjectAccessMock).toHaveBeenLastCalledWith("u1", "proj-1", "admin");
    expect(archiveProjectMock).toHaveBeenCalledWith("proj-1");
    expect(logUserActionMock.mock.calls[0][0].action).toBe("project.archive");
  });

  it("DELETE returns 404 for a non-member", async () => {
    assertProjectAccessMock.mockRejectedValue(new ProjectAccessError("nf", "not_found"));
    const res = await DELETE(new Request("http://x/api/projects/proj-1", { method: "DELETE" }), params("proj-1"));
    expect(res.status).toBe(404);
    expect(archiveProjectMock).not.toHaveBeenCalled();
  });
});
