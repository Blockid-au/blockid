// Unit test for the /api/projects/[id]/archive handler.
//
// Iteration-12 T1 (Q4 Multi-project #5). Covers the 200 / 401 / 403 / 404
// pathways for both POST (archive) and DELETE (unarchive), plus the 422
// pathway when the project library refuses the state transition.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getProjectByIdMock = vi.fn();
const archiveProjectMock = vi.fn();
const unarchiveProjectMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  getProjectById: (id: string) => getProjectByIdMock(id),
  archiveProject: (id: string) => archiveProjectMock(id),
  unarchiveProject: (id: string, userId: string, plan: string) =>
    unarchiveProjectMock(id, userId, plan),
}));

import { POST, DELETE } from "./route";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getProjectByIdMock.mockReset();
  archiveProjectMock.mockReset();
  unarchiveProjectMock.mockReset();
});

describe("POST /api/projects/[id]/archive", () => {
  it("returns 401 for unauthenticated callers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(new Request("http://x/y"), params("proj-1"));
    expect(res.status).toBe(401);
    expect(getProjectByIdMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getProjectByIdMock.mockResolvedValue(null);
    const res = await POST(new Request("http://x/y"), params("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller does not own the project", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getProjectByIdMock.mockResolvedValue({
      id: "proj-1",
      userId: "other-user",
      archivedAt: null,
    });
    const res = await POST(new Request("http://x/y"), params("proj-1"));
    expect(res.status).toBe(403);
    expect(archiveProjectMock).not.toHaveBeenCalled();
  });

  it("archives an owned project and returns archived_at", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getProjectByIdMock
      .mockResolvedValueOnce({ id: "proj-1", userId: "u1", archivedAt: null })
      .mockResolvedValueOnce({
        id: "proj-1",
        userId: "u1",
        archivedAt: "2026-07-23T00:00:00Z",
      });
    archiveProjectMock.mockResolvedValue({ ok: true });

    const res = await POST(new Request("http://x/y"), params("proj-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      project: { id: "proj-1", archived_at: "2026-07-23T00:00:00Z" },
    });
    expect(archiveProjectMock).toHaveBeenCalledWith("proj-1");
  });

  it("is idempotent — returns 200 without re-archiving when archived_at already set", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getProjectByIdMock.mockResolvedValue({
      id: "proj-1",
      userId: "u1",
      archivedAt: "2026-01-01T00:00:00Z",
    });
    const res = await POST(new Request("http://x/y"), params("proj-1"));
    expect(res.status).toBe(200);
    expect(archiveProjectMock).not.toHaveBeenCalled();
  });

  it("returns 422 when the library refuses (e.g. default project)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getProjectByIdMock.mockResolvedValue({
      id: "proj-1",
      userId: "u1",
      archivedAt: null,
    });
    archiveProjectMock.mockResolvedValue({
      ok: false,
      error: "Cannot archive the default project",
    });
    const res = await POST(new Request("http://x/y"), params("proj-1"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Cannot archive the default project");
  });
});

describe("DELETE /api/projects/[id]/archive (unarchive)", () => {
  it("returns 401 for unauthenticated callers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x/y"), params("proj-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the project does not exist", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getProjectByIdMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x/y"), params("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller does not own the project", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getProjectByIdMock.mockResolvedValue({
      id: "proj-1",
      userId: "other-user",
      archivedAt: "2026-01-01T00:00:00Z",
    });
    const res = await DELETE(new Request("http://x/y"), params("proj-1"));
    expect(res.status).toBe(403);
    expect(unarchiveProjectMock).not.toHaveBeenCalled();
  });

  it("restores an owned archived project", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "founder_growth" });
    getProjectByIdMock.mockResolvedValue({
      id: "proj-1",
      userId: "u1",
      archivedAt: "2026-01-01T00:00:00Z",
    });
    unarchiveProjectMock.mockResolvedValue({ ok: true });

    const res = await DELETE(new Request("http://x/y"), params("proj-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      project: { id: "proj-1", archived_at: null },
    });
    expect(unarchiveProjectMock).toHaveBeenCalledWith(
      "proj-1",
      "u1",
      "founder_growth",
    );
  });

  it("is idempotent — returns 200 without touching lib when not archived", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getProjectByIdMock.mockResolvedValue({
      id: "proj-1",
      userId: "u1",
      archivedAt: null,
    });
    const res = await DELETE(new Request("http://x/y"), params("proj-1"));
    expect(res.status).toBe(200);
    expect(unarchiveProjectMock).not.toHaveBeenCalled();
  });

  it("returns 422 when unarchiving would exceed the plan quota", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getProjectByIdMock.mockResolvedValue({
      id: "proj-1",
      userId: "u1",
      archivedAt: "2026-01-01T00:00:00Z",
    });
    unarchiveProjectMock.mockResolvedValue({
      ok: false,
      error: "Your free plan allows up to 1 active startup. Archive another startup or upgrade before restoring this one.",
    });
    const res = await DELETE(new Request("http://x/y"), params("proj-1"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/free plan/);
  });
});
