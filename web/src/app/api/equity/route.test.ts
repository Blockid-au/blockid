// Colocated vitest for /api/equity — P5-equity-route-test.
//
// The /api/equity endpoint fronts the Phase-5 team-equity register: GET
// returns the EquitySummary the /workspace/equity + /workspace/dataroom cap
// table surfaces render, and POST adds a founder / employee / advisor to the
// register. A silent regression here (dropping the projectId ownership check
// so a founder can read/write another founder's cap table, dropping the
// 0..100 equityPct guard so a "50" typed as string sneaks in, forwarding a
// pre-existing 100%-cap error at 500 instead of 422 so the UI can't
// distinguish "database down" from "not enough headroom") would break the
// AU-investor-standard defensibility of the cap-table register the
// P1_dataroom_map exit criterion promises for data-room folder 3 (Corporate).
//
// getCurrentUser + getProjectById + the equity lib are mocked so the
// assertions pin route wiring — the ownership check ordering, trim contract,
// and validator branches. The equity.ts unit contract is already covered by
// P1-equity-lib-test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Auth ────────────────────────────────────────────────────
type AppUserFake = { id: string; email: string };
const getCurrentUserMock = vi.fn<() => Promise<AppUserFake | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ── Projects ────────────────────────────────────────────────
type ProjectFake = { id: string; userId: string; name: string } | null;
const getProjectByIdMock = vi.fn<(id: string) => Promise<ProjectFake>>();
vi.mock("@/lib/projects", () => ({
  getProjectById: (id: string) => getProjectByIdMock(id),
}));

// ── Equity lib ──────────────────────────────────────────────
type EquitySummaryFake = {
  members: unknown[];
  events: unknown[];
  totalAllocated: number;
  unallocated: number;
};
type AddResultFake = { ok: boolean; member?: unknown; error?: string };

const getEquitySummaryMock = vi.fn<(pid: string) => Promise<EquitySummaryFake>>();
const addTeamMemberMock = vi.fn<
  (pid: string, data: Record<string, unknown>) => Promise<AddResultFake>
>();
vi.mock("@/lib/equity", () => ({
  getEquitySummary: (pid: string) => getEquitySummaryMock(pid),
  addTeamMember: (pid: string, data: Record<string, unknown>) =>
    addTeamMemberMock(pid, data),
}));

// Import AFTER every mock is wired.
import { GET, POST, dynamic } from "./route";

const USER: AppUserFake = { id: "user-1", email: "founder@example.com" };
const OWNED_PROJECT: NonNullable<ProjectFake> = {
  id: "proj-owned",
  userId: "user-1",
  name: "Acme AI",
};
const OTHER_PROJECT: NonNullable<ProjectFake> = {
  id: "proj-other",
  userId: "attacker-42",
  name: "Rival Co",
};

function getReq(projectId?: string | null): NextRequest {
  const url =
    projectId === undefined
      ? "http://x/api/equity"
      : projectId === null
        ? "http://x/api/equity?projectId="
        : `http://x/api/equity?projectId=${encodeURIComponent(projectId)}`;
  return new NextRequest(url, { method: "GET" });
}

function postReq(body: unknown, opts?: { badJson?: boolean }): Request {
  return new Request("http://x/api/equity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const SUMMARY: EquitySummaryFake = {
  members: [
    { id: "m-1", name: "Founder A", equityPct: 55 },
    { id: "m-2", name: "Founder B", equityPct: 30 },
  ],
  events: [{ id: "e-1", type: "grant", equityPct: 55 }],
  totalAllocated: 85,
  unallocated: 15,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  getProjectByIdMock.mockResolvedValue(OWNED_PROJECT);
  getEquitySummaryMock.mockResolvedValue(SUMMARY);
  addTeamMemberMock.mockResolvedValue({
    ok: true,
    member: { id: "m-new", name: "New Grantee", equityPct: 5 },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────
describe("route module exports", () => {
  it("marks dynamic = 'force-dynamic' so auth is honoured per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ─────────────────────────────────────────────────────────────
describe("GET /api/equity", () => {
  it("returns 401 when unauthenticated (project + summary never consulted)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(getReq("proj-owned"));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Authentication required",
    });
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(getEquitySummaryMock).not.toHaveBeenCalled();
  });

  it("returns 400 when projectId is missing (no query string)", async () => {
    const res = await GET(getReq(undefined));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "projectId is required",
    });
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(getEquitySummaryMock).not.toHaveBeenCalled();
  });

  it("returns 400 when projectId is present but empty (?projectId=)", async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "projectId is required",
    });
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(getEquitySummaryMock).not.toHaveBeenCalled();
  });

  it("returns 404 when getProjectById resolves null (unknown project)", async () => {
    getProjectByIdMock.mockResolvedValue(null);
    const res = await GET(getReq("proj-owned"));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ ok: false, error: "Project not found" });
    expect(getEquitySummaryMock).not.toHaveBeenCalled();
  });

  it("returns 404 when project belongs to a different user (cross-tenant read blocked)", async () => {
    getProjectByIdMock.mockResolvedValue(OTHER_PROJECT);
    const res = await GET(getReq("proj-other"));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ ok: false, error: "Project not found" });
    // Message MUST match the not-found copy so a probing client cannot
    // distinguish "exists but not yours" from "does not exist".
    expect(getEquitySummaryMock).not.toHaveBeenCalled();
  });

  it("returns 200 with {ok:true, ...summary} on happy path (flattens EquitySummary)", async () => {
    const res = await GET(getReq("proj-owned"));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      members: SUMMARY.members,
      events: SUMMARY.events,
      totalAllocated: SUMMARY.totalAllocated,
      unallocated: SUMMARY.unallocated,
    });
    expect(getProjectByIdMock).toHaveBeenCalledWith("proj-owned");
    expect(getEquitySummaryMock).toHaveBeenCalledWith("proj-owned");
  });

  it("URL-decodes the projectId query param before both lookups", async () => {
    await GET(getReq("uuid with spaces"));
    expect(getProjectByIdMock).toHaveBeenCalledWith("uuid with spaces");
    expect(getEquitySummaryMock).toHaveBeenCalledWith("uuid with spaces");
  });
});

// ─────────────────────────────────────────────────────────────
describe("POST /api/equity", () => {
  const validBody = {
    projectId: "proj-owned",
    name: "New Grantee",
    email: "grantee@example.com",
    role: "employee",
    equityPct: 5,
    vestingMonths: 48,
    cliffMonths: 12,
    vestingStartDate: "2026-08-13",
  };

  it("returns 401 when unauthenticated (parse + project + addTeamMember all skipped)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Authentication required",
    });
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 400 Invalid JSON body when the body is unparseable", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "Invalid JSON body" });
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it("accepts a null JSON body without throwing and rejects with the missing-fields message (?? {} guard)", async () => {
    const res = await POST(postReq(null));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "projectId, name, role, and equityPct are required",
    });
  });

  it("returns 400 when projectId is missing", async () => {
    const { projectId: _pid, ...rest } = validBody;
    const res = await POST(postReq(rest));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "projectId, name, role, and equityPct are required",
    });
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    const { name: _n, ...rest } = validBody;
    const res = await POST(postReq(rest));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "projectId, name, role, and equityPct are required",
    });
  });

  it("returns 400 when role is missing", async () => {
    const { role: _r, ...rest } = validBody;
    const res = await POST(postReq(rest));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "projectId, name, role, and equityPct are required",
    });
  });

  it("returns 400 when equityPct is missing (undefined) — presence guard, not falsy", async () => {
    const { equityPct: _e, ...rest } = validBody;
    const res = await POST(postReq(rest));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "projectId, name, role, and equityPct are required",
    });
  });

  it("accepts equityPct = 0 (advisor with promise-only slot) — no missing-fields short-circuit", async () => {
    // 0 is a valid presence — undefined must still fail. The addTeamMember
    // lib is invoked and its result is returned.
    const res = await POST(postReq({ ...validBody, equityPct: 0 }));
    expect(res.status).toBe(201);
    expect(addTeamMemberMock).toHaveBeenCalledTimes(1);
    expect(addTeamMemberMock.mock.calls[0][1]).toMatchObject({ equityPct: 0 });
  });

  it("returns 400 when equityPct is a string (typeof guard, not implicit coerce)", async () => {
    const res = await POST(postReq({ ...validBody, equityPct: "50" }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "equityPct must be between 0 and 100",
    });
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 400 when equityPct is negative", async () => {
    const res = await POST(postReq({ ...validBody, equityPct: -0.01 }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "equityPct must be between 0 and 100",
    });
  });

  it("returns 400 when equityPct is above 100", async () => {
    const res = await POST(postReq({ ...validBody, equityPct: 100.01 }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "equityPct must be between 0 and 100",
    });
  });

  it("accepts equityPct = 100 (boundary inclusive) — sole founder holds the whole cap table", async () => {
    const res = await POST(postReq({ ...validBody, equityPct: 100 }));
    expect(res.status).toBe(201);
    expect(addTeamMemberMock.mock.calls[0][1]).toMatchObject({ equityPct: 100 });
  });

  it("returns 404 when the project is unknown (owner check runs after body validation)", async () => {
    getProjectByIdMock.mockResolvedValue(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ ok: false, error: "Project not found" });
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the project belongs to a different user (cross-tenant write blocked)", async () => {
    getProjectByIdMock.mockResolvedValue(OTHER_PROJECT);
    const res = await POST(postReq({ ...validBody, projectId: "proj-other" }));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ ok: false, error: "Project not found" });
    // Same message as unknown-project — client cannot distinguish "not yours".
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it("trims name + email before forwarding to addTeamMember", async () => {
    await POST(
      postReq({ ...validBody, name: "  Ava  ", email: "  ava@example.com  " }),
    );
    expect(addTeamMemberMock).toHaveBeenCalledTimes(1);
    const [pid, data] = addTeamMemberMock.mock.calls[0];
    expect(pid).toBe("proj-owned");
    expect(data.name).toBe("Ava");
    expect(data.email).toBe("ava@example.com");
  });

  it("email is undefined when caller omits it (email?.trim() short-circuits, never empty string)", async () => {
    const { email: _e, ...rest } = validBody;
    await POST(postReq(rest));
    const [, data] = addTeamMemberMock.mock.calls[0];
    expect(data.email).toBeUndefined();
  });

  it("forwards role / vestingMonths / cliffMonths / vestingStartDate verbatim", async () => {
    await POST(postReq(validBody));
    const [pid, data] = addTeamMemberMock.mock.calls[0];
    expect(pid).toBe("proj-owned");
    expect(data).toMatchObject({
      role: "employee",
      equityPct: 5,
      vestingMonths: 48,
      cliffMonths: 12,
      vestingStartDate: "2026-08-13",
    });
  });

  it("returns 201 + {ok:true, member} on happy path", async () => {
    const member = { id: "m-new", name: "Ava", equityPct: 5 };
    addTeamMemberMock.mockResolvedValue({ ok: true, member });
    const res = await POST(postReq({ ...validBody, name: "Ava" }));
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ ok: true, member });
  });

  it("returns 422 + {ok:false, error} when addTeamMember rejects (100% cap exceeded)", async () => {
    addTeamMemberMock.mockResolvedValue({
      ok: false,
      error: "Total equity would exceed 100% (existing 96.00% + new 5.00%)",
    });
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Total equity would exceed 100% (existing 96.00% + new 5.00%)",
    });
  });

  it("returns 422 when addTeamMember rejects with a bare error string (DB constraint)", async () => {
    addTeamMemberMock.mockResolvedValue({ ok: false, error: "insert boom" });
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({ ok: false, error: "insert boom" });
  });
});
