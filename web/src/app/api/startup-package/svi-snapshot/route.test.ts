// Unit tests for GET /api/startup-package/svi-snapshot — P5-svi-snapshot-route.
//
// The 5-second poll endpoint powering the Startup Package interview live-meter.
// Sits on the same [[project_startup_package_ship1]] surface as
// P5-save-answer-route-test + P5-reservation-route-test; a silent regression
// here can either (a) leak another founder's snapshot when the auth guard is
// dropped, (b) always answer with the default project when a caller-supplied
// projectId is silently ignored, or (c) surface the wrong empty-state
// envelope so the client's SWR skeleton never advances.
//
// Auth + project lookup + snapshot lib are all mocked so the test asserts
// route wiring in isolation from the DB.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth";
import type { Project } from "@/lib/projects";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn<() => Promise<AppUser | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getActiveProjectMock =
  vi.fn<(userId: string, slug?: string) => Promise<Project | null>>();
vi.mock("@/lib/projects", () => ({
  getActiveProject: (...args: [string, string?]) =>
    getActiveProjectMock(...args),
}));

type Snap = { svi: number; delta: number | null; stage: number } | null;
const readLatestSnapshotMock = vi.fn<(projectId: string) => Promise<Snap>>();
vi.mock("@/lib/startup-package/svi-recompute", () => ({
  readLatestSnapshot: (projectId: string) => readLatestSnapshotMock(projectId),
}));

import { GET } from "./route";

function makeUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "u-1",
    email: "founder@example.com",
    displayName: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
    role: "user",
    plan: "free",
    googleId: null,
    avatarUrl: null,
    discountPct: null,
    startupName: null,
    startupStage: null,
    industry: null,
    onboardingCompleted: true,
    ...overrides,
  } as AppUser;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-default",
    userId: "u-1",
    name: "Test",
    slug: "test",
    description: null,
    industry: null,
    stage: 0,
    isDefault: true,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    growth_phase_current: null,
    ...overrides,
  };
}

function makeRequest(projectId?: string): Request {
  const base = "http://x/api/startup-package/svi-snapshot";
  const url = projectId
    ? `${base}?projectId=${encodeURIComponent(projectId)}`
    : base;
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getActiveProjectMock.mockReset();
  readLatestSnapshotMock.mockReset();
});

describe("GET /api/startup-package/svi-snapshot", () => {
  it("401 for anonymous callers and short-circuits before project lookup + snapshot read", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(makeRequest("proj-1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "authentication_required" });
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(readLatestSnapshotMock).not.toHaveBeenCalled();
  });

  it("200 + {ok:false, reason:'no_project'} when caller omits projectId AND has no active project", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    getActiveProjectMock.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      reason: "no_project",
      svi: null,
      delta: null,
      stage: null,
    });
    expect(getActiveProjectMock).toHaveBeenCalledWith("u-1");
    expect(readLatestSnapshotMock).not.toHaveBeenCalled();
  });

  it("falls back to getActiveProject(user.id) when body omits projectId", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-42" }));
    getActiveProjectMock.mockResolvedValue(
      makeProject({ id: "proj-active", userId: "u-42" }),
    );
    readLatestSnapshotMock.mockResolvedValue({ svi: 87, delta: 3, stage: 4 });
    await GET(makeRequest());
    expect(getActiveProjectMock).toHaveBeenCalledTimes(1);
    expect(getActiveProjectMock).toHaveBeenCalledWith("u-42");
    expect(readLatestSnapshotMock).toHaveBeenCalledWith("proj-active");
  });

  it("caller-supplied projectId short-circuits getActiveProject (no DB round-trip)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    readLatestSnapshotMock.mockResolvedValue({ svi: 55, delta: null, stage: 2 });
    await GET(makeRequest("proj-explicit"));
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(readLatestSnapshotMock).toHaveBeenCalledWith("proj-explicit");
  });

  it("caller-supplied projectId is not the user.id (pins the URL-param → snapshot wire)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    readLatestSnapshotMock.mockResolvedValue({ svi: 70, delta: -2, stage: 3 });
    await GET(makeRequest("proj-xyz"));
    expect(readLatestSnapshotMock).toHaveBeenCalledWith("proj-xyz");
  });

  it("200 empty-state envelope when snapshot lib returns null (no snapshot yet)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    readLatestSnapshotMock.mockResolvedValue(null);
    const res = await GET(makeRequest("proj-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      projectId: "proj-1",
      svi: null,
      delta: null,
      stage: null,
      empty: true,
    });
  });

  it("happy-path 200 forwards svi/delta/stage verbatim from the snapshot lib", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    readLatestSnapshotMock.mockResolvedValue({ svi: 92.5, delta: 5.5, stage: 6 });
    const res = await GET(makeRequest("proj-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      projectId: "proj-1",
      svi: 92.5,
      delta: 5.5,
      stage: 6,
    });
    // `empty` marker MUST NOT appear on the happy path — client uses its
    // absence to render the live meter instead of the skeleton.
    expect(body.empty).toBeUndefined();
  });

  it("preserves a null delta on the very first snapshot of a project", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    readLatestSnapshotMock.mockResolvedValue({ svi: 100, delta: null, stage: 1 });
    const res = await GET(makeRequest("proj-1"));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, svi: 100, delta: null, stage: 1 });
  });

  it("preserves a negative delta so the client can render 'SVI dropped' correctly", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    readLatestSnapshotMock.mockResolvedValue({ svi: 60, delta: -12, stage: 3 });
    const res = await GET(makeRequest("proj-1"));
    const body = await res.json();
    expect(body.delta).toBe(-12);
    expect(body.svi).toBe(60);
  });

  it("projectId of empty string is treated as 'not supplied' — falls back to active project", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    getActiveProjectMock.mockResolvedValue(
      makeProject({ id: "proj-active", userId: "u-1" }),
    );
    readLatestSnapshotMock.mockResolvedValue({ svi: 80, delta: 0, stage: 4 });
    // "?projectId=" with an empty value — URLSearchParams returns "" which is falsy
    const req = new Request("http://x/api/startup-package/svi-snapshot?projectId=", {
      method: "GET",
    });
    await GET(req);
    expect(getActiveProjectMock).toHaveBeenCalledWith("u-1");
    expect(readLatestSnapshotMock).toHaveBeenCalledWith("proj-active");
  });

  it("delegates the snapshot read to the projectId returned by getActiveProject (not user.id)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    getActiveProjectMock.mockResolvedValue(
      makeProject({ id: "proj-active-42", userId: "u-1" }),
    );
    readLatestSnapshotMock.mockResolvedValue({ svi: 75, delta: 1, stage: 4 });
    await GET(makeRequest());
    expect(readLatestSnapshotMock).toHaveBeenCalledWith("proj-active-42");
  });

  it("returns projectId in the response body matching the URL param on the happy path", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    readLatestSnapshotMock.mockResolvedValue({ svi: 88, delta: 2, stage: 5 });
    const res = await GET(makeRequest("proj-caller-supplied"));
    const body = await res.json();
    expect(body.projectId).toBe("proj-caller-supplied");
  });

  it("returns projectId in the empty-state response body (not null)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    readLatestSnapshotMock.mockResolvedValue(null);
    const res = await GET(makeRequest("proj-caller-supplied"));
    const body = await res.json();
    expect(body.projectId).toBe("proj-caller-supplied");
    expect(body.empty).toBe(true);
  });

  it("no_project envelope OMITS the projectId field (client uses its absence to prompt project creation)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    getActiveProjectMock.mockResolvedValue(null);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.projectId).toBeUndefined();
    expect(body.reason).toBe("no_project");
  });

  it("URL-decodes the projectId param before forwarding it to the snapshot lib", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    readLatestSnapshotMock.mockResolvedValue({ svi: 50, delta: null, stage: 2 });
    // %20 → space (unusual but exercises the URL decoder path)
    const req = new Request(
      "http://x/api/startup-package/svi-snapshot?projectId=proj%20abc",
      { method: "GET" },
    );
    await GET(req);
    expect(readLatestSnapshotMock).toHaveBeenCalledWith("proj abc");
  });

  it("only calls readLatestSnapshot ONCE per request (no accidental re-fetch)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    readLatestSnapshotMock.mockResolvedValue({ svi: 82, delta: 4, stage: 5 });
    await GET(makeRequest("proj-1"));
    expect(readLatestSnapshotMock).toHaveBeenCalledTimes(1);
  });
});
