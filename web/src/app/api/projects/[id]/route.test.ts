// Unit tests for /api/projects/[id] PATCH audit wire-in.
//
// Iteration-14 T2 (D3-CISO-05 SOC2-lite expansion). Asserts that a
// successful PATCH logs a `project.updated` audit row and lists only
// the KEYS the caller touched — never the values.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getProjectByIdMock = vi.fn();
const updateProjectMock = vi.fn();
const archiveProjectMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  getProjectById: (id: string) => getProjectByIdMock(id),
  updateProject: (id: string, patch: unknown) => updateProjectMock(id, patch),
  archiveProject: (id: string) => archiveProjectMock(id),
}));

const assertProjectMemberCanMock = vi.fn();
vi.mock("@/lib/project-members/scope", () => ({
  assertProjectMemberCan: (projectId: string, userId: string, perm: string) =>
    assertProjectMemberCanMock(projectId, userId, perm),
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
  extractIp: () => "10.0.0.1",
  extractUserAgent: () => "vitest",
}));

import { PATCH } from "./route";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getProjectByIdMock.mockReset();
  updateProjectMock.mockReset();
  archiveProjectMock.mockReset();
  assertProjectMemberCanMock.mockReset();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
});

describe("PATCH /api/projects/[id] audit wire-in", () => {
  it("logs project.updated with the changed field keys after a successful update", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getProjectByIdMock
      .mockResolvedValueOnce({ id: "proj-1", userId: "u1" })
      .mockResolvedValueOnce({ id: "proj-1", userId: "u1", name: "new" });
    assertProjectMemberCanMock.mockResolvedValue(undefined);
    updateProjectMock.mockResolvedValue({ ok: true });

    const req = new Request("http://x/api/projects/proj-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "new", industry: "fintech" }),
    });
    const res = await PATCH(req, params("proj-1"));
    expect(res.status).toBe(200);

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("project.updated");
    expect(arg.subjectType).toBe("project");
    expect(arg.subjectId).toBe("proj-1");
    expect(arg.fields.changed).toEqual(["name", "industry"]);
    expect(arg.route).toBe("/api/projects/proj-1");
  });

  it("does not log when the update fails", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getProjectByIdMock.mockResolvedValue({ id: "proj-1", userId: "u1" });
    assertProjectMemberCanMock.mockResolvedValue(undefined);
    updateProjectMock.mockResolvedValue({ ok: false, error: "boom" });

    const req = new Request("http://x/api/projects/proj-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "new" }),
    });
    const res = await PATCH(req, params("proj-1"));
    expect(res.status).toBe(500);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("does not log when auth or ownership is denied", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const req = new Request("http://x/api/projects/proj-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
    });
    const res = await PATCH(req, params("proj-1"));
    expect(res.status).toBe(401);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});
