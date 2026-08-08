// Unit tests for POST /api/startup-package/reservation — P5-reservation-route.
//
// The founder-facing HTTP wrapper on top of the pure
// `upsertReservedAllocation` helper (covered by
// `startup-package/reservation-server.test.ts`). Sits directly on the
// [[project_startup_package_ship1]] cap-table reservation surface a paying
// founder just A$149-committed to; a silent regression here can either (a)
// let another founder's project id slip through the ownership check and
// clobber a paid-for reservation, (b) drop the rate-limit guard so a runaway
// UI retries burn Supabase writes, or (c) surface the raw upsert error/field
// without the 400 wrapping the client-side form relies on.
//
// The pure reservation lib + rate-limit lib + auth + project lookup are all
// mocked so this test asserts route wiring in isolation.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth";
import type { Project } from "@/lib/projects";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn<() => Promise<AppUser | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const consumeRateLimitMock =
  vi.fn<(opts: Record<string, unknown>) => Promise<Record<string, unknown>>>();
vi.mock("@/lib/rate-limit/persistent", () => ({
  consumeRateLimit: (opts: Record<string, unknown>) => consumeRateLimitMock(opts),
}));

const getProjectByIdMock = vi.fn<(id: string) => Promise<Project | null>>();
vi.mock("@/lib/projects", () => ({
  getProjectById: (id: string) => getProjectByIdMock(id),
}));

const upsertMock =
  vi.fn<(input: Record<string, unknown>) => Promise<Record<string, unknown>>>();
vi.mock("@/lib/startup-package/reservation-server", () => ({
  upsertReservedAllocation: (input: Record<string, unknown>) => upsertMock(input),
}));

import { POST } from "./route";

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
    id: "proj-1",
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

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "res-1",
    project_id: "proj-1",
    pct_reserved: 20,
    ticker_hint: "ACM",
    on_chain_token_id: null,
    opt_in_at: null,
    created_at: "2026-07-25T00:00:00.000Z",
    updated_at: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

function allowRate() {
  return {
    allowed: true,
    limit: 30,
    remaining: 29,
    reset_at: "2026-07-25T01:00:00.000Z",
  };
}

function denyRate(retry: number | null) {
  return {
    allowed: false,
    limit: 30,
    remaining: 0,
    reset_at: "2026-07-25T01:00:00.000Z",
    ...(retry != null ? { retry_after_seconds: retry } : {}),
  };
}

function makeRequest(body: unknown | "raw", raw?: string): Request {
  return new Request("http://x/api/startup-package/reservation", {
    method: "POST",
    body: body === "raw" ? raw : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  consumeRateLimitMock.mockReset();
  getProjectByIdMock.mockReset();
  upsertMock.mockReset();
});

describe("POST /api/startup-package/reservation", () => {
  it("returns 401 for anonymous callers and short-circuits before rate-limit + project lookup + upsert", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ projectId: "proj-1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "unauthorized" });
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("uses the correct rate-limit bucket + window + actor id", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-42" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-42" }));
    upsertMock.mockResolvedValue({ ok: true, row: makeRow() });
    await POST(makeRequest({ projectId: "proj-1", pct_reserved: 20, ticker_hint: "acm" }));
    expect(consumeRateLimitMock).toHaveBeenCalledTimes(1);
    expect(consumeRateLimitMock.mock.calls[0][0]).toEqual({
      bucket: "startup_package.reservation",
      actorId: "u-42",
      limit: 30,
      windowSeconds: 3600,
    });
  });

  it("429 rate_limited passes through retry_after_seconds into body + Retry-After header", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(denyRate(1234));
    const res = await POST(makeRequest({ projectId: "proj-1" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1234");
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "rate_limited",
      retry_after_seconds: 1234,
    });
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("429 defaults Retry-After header + body to 60 when retry_after_seconds is absent", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(denyRate(null));
    const res = await POST(makeRequest({ projectId: "proj-1" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = await res.json();
    expect(body.retry_after_seconds).toBe(60);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("400 invalid_json on unparseable body still consumes rate-limit but skips project lookup + upsert", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await POST(makeRequest("raw", "{not json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "invalid_json" });
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("400 projectId is required when body omits projectId", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await POST(makeRequest({ pct_reserved: 20, ticker_hint: "ACM" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "projectId is required" });
    expect(getProjectByIdMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("400 projectId is required when projectId is whitespace-only", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await POST(makeRequest({ projectId: "   " }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("projectId is required");
    expect(getProjectByIdMock).not.toHaveBeenCalled();
  });

  it("403 project_not_found_or_forbidden when the project does not exist", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ projectId: "proj-missing" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "project_not_found_or_forbidden" });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("403 project_not_found_or_forbidden when the project belongs to another user", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-999" }));
    const res = await POST(makeRequest({ projectId: "proj-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("project_not_found_or_forbidden");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("happy-path 200 returns {ok, reservation, onChainDeferred: true, onChainMessage}", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    const row = makeRow({ pct_reserved: 25, ticker_hint: "ACM" });
    upsertMock.mockResolvedValue({ ok: true, row });
    const res = await POST(
      makeRequest({ projectId: "proj-1", pct_reserved: 25, ticker_hint: "ACM" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.reservation).toEqual(row);
    expect(body.onChainDeferred).toBe(true);
    expect(typeof body.onChainMessage).toBe("string");
    expect(body.onChainMessage).toMatch(/Ship 2/);
  });

  it("trims + uppercases ticker_hint AND passes projectId + pct + ticker to the upsert helper", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    upsertMock.mockResolvedValue({ ok: true, row: makeRow() });
    await POST(
      makeRequest({ projectId: "proj-1", pct_reserved: 30, ticker_hint: "  acm  " }),
    );
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0]).toEqual({
      projectId: "proj-1",
      pct_reserved: 30,
      ticker_hint: "ACM",
    });
  });

  it("defaults pct_reserved to 20 when body omits it", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    upsertMock.mockResolvedValue({ ok: true, row: makeRow() });
    await POST(makeRequest({ projectId: "proj-1", ticker_hint: "ACM" }));
    expect(upsertMock.mock.calls[0][0]).toMatchObject({ pct_reserved: 20 });
  });

  it("defaults ticker_hint to '' (upsert lib rejects it with a field error)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    upsertMock.mockResolvedValue({
      ok: false,
      error: "ticker_hint must be 3-4 uppercase letters (A-Z).",
      field: "ticker_hint",
    });
    const res = await POST(makeRequest({ projectId: "proj-1" }));
    expect(upsertMock.mock.calls[0][0]).toMatchObject({ ticker_hint: "" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "ticker_hint must be 3-4 uppercase letters (A-Z).",
      field: "ticker_hint",
    });
  });

  it("400 propagates upsert helper error + field into the response body", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    upsertMock.mockResolvedValue({
      ok: false,
      error: "pct_reserved must be between 10 and 100.",
      field: "pct_reserved",
    });
    const res = await POST(
      makeRequest({ projectId: "proj-1", pct_reserved: 5, ticker_hint: "ACM" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "pct_reserved must be between 10 and 100.",
      field: "pct_reserved",
    });
  });

  it("400 propagates upsert helper error WITHOUT a field when helper omits it (e.g. Service unavailable)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    upsertMock.mockResolvedValue({ ok: false, error: "Service unavailable" });
    const res = await POST(
      makeRequest({ projectId: "proj-1", pct_reserved: 20, ticker_hint: "ACM" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Service unavailable");
    expect(body.field).toBeUndefined();
  });

  it("looks up the project by the caller-supplied projectId (not user.id)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ userId: "u-1" }));
    upsertMock.mockResolvedValue({ ok: true, row: makeRow() });
    await POST(
      makeRequest({ projectId: "proj-xyz", pct_reserved: 20, ticker_hint: "ACM" }),
    );
    expect(getProjectByIdMock).toHaveBeenCalledWith("proj-xyz");
  });

  it("trims a whitespace-padded projectId before delegating", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getProjectByIdMock.mockResolvedValue(makeProject({ id: "proj-abc", userId: "u-1" }));
    upsertMock.mockResolvedValue({ ok: true, row: makeRow({ project_id: "proj-abc" }) });
    await POST(
      makeRequest({ projectId: "  proj-abc  ", pct_reserved: 20, ticker_hint: "ACM" }),
    );
    expect(getProjectByIdMock).toHaveBeenCalledWith("proj-abc");
    expect(upsertMock.mock.calls[0][0]).toMatchObject({ projectId: "proj-abc" });
  });
});
