// Unit tests for POST /api/startup-package/save-answer — P5-save-answer-route.
//
// The auth-gated, debounce-friendly persistence surface behind the guided
// interview wizard on the [[project_startup_package_ship1]] founder flow.
// Every ~800ms keystroke lands here, so any silent regression in (a) the
// step-key allow-list, (b) the rate-limit guard, (c) the lazy project
// create-on-first-save, or (d) the fail-soft 42P01 (migration not yet
// applied) short-circuit either loses a founder's draft or spams the
// database with retries the wizard cannot recover from.
//
// The pure interview-step registry + recomputeAndSnapshot lib + auth +
// projects + rate-limit + supabase-admin are all mocked so this test asserts
// route wiring in isolation from delegates. Mirrors the shape of the sibling
// P5-reservation-route-test.

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

const getActiveProjectMock =
  vi.fn<(userId: string) => Promise<Project | null>>();
const createProjectMock =
  vi.fn<
    (
      userId: string,
      name: string,
      plan: string,
      opts?: Record<string, unknown>,
    ) => Promise<{
      ok: boolean;
      project?: Project;
      reason?: string;
      error?: string;
    }>
  >();
vi.mock("@/lib/projects", () => ({
  getActiveProject: (userId: string) => getActiveProjectMock(userId),
  createProject: (
    userId: string,
    name: string,
    plan: string,
    opts?: Record<string, unknown>,
  ) => createProjectMock(userId, name, plan, opts),
}));

const upsertMock =
  vi.fn<
    (
      payload: Record<string, unknown>,
      opts: Record<string, unknown>,
    ) => Promise<{ error: { code?: string; message?: string } | null }>
  >();
const fromMock = vi.fn((_table: string) => ({
  upsert: (payload: Record<string, unknown>, opts: Record<string, unknown>) =>
    upsertMock(payload, opts),
}));
const getSupabaseAdminMock = vi.fn<() => { from: typeof fromMock } | null>(
  () => ({ from: fromMock }),
);
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const recomputeAndSnapshotMock =
  vi.fn<(projectId: string) => Promise<Record<string, unknown>>>();
vi.mock("@/lib/startup-package/svi-recompute", () => ({
  recomputeAndSnapshot: (projectId: string) => recomputeAndSnapshotMock(projectId),
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
    startupGoals: null,
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

function allowRate() {
  return {
    allowed: true,
    limit: 60,
    remaining: 59,
    reset_at: "2026-08-08T01:00:00.000Z",
  };
}

function denyRate(retry: number | null) {
  return {
    allowed: false,
    limit: 60,
    remaining: 0,
    reset_at: "2026-08-08T01:00:00.000Z",
    ...(retry != null ? { retry_after_seconds: retry } : {}),
  };
}

function snap(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    svi: 72,
    delta: 3,
    stage: 2,
    ...overrides,
  };
}

function makeRequest(body: unknown | "raw", raw?: string): Request {
  return new Request("http://x/api/startup-package/save-answer", {
    method: "POST",
    body: body === "raw" ? raw : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  consumeRateLimitMock.mockReset();
  getActiveProjectMock.mockReset();
  createProjectMock.mockReset();
  upsertMock.mockReset();
  fromMock.mockClear();
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue({ from: fromMock });
  recomputeAndSnapshotMock.mockReset();
});

describe("POST /api/startup-package/save-answer", () => {
  it("returns 401 for anonymous callers and short-circuits before rate-limit + upsert + snapshot", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", answerText: "hello" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "authentication_required" });
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(recomputeAndSnapshotMock).not.toHaveBeenCalled();
  });

  it("uses the correct rate-limit bucket + limit + window + actor id", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-42" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(makeProject({ userId: "u-42" }));
    upsertMock.mockResolvedValue({ error: null });
    recomputeAndSnapshotMock.mockResolvedValue(snap());
    await POST(
      makeRequest({
        stepKey: "idea_and_problem",
        answerText: "hello",
        projectId: "proj-1",
      }),
    );
    expect(consumeRateLimitMock).toHaveBeenCalledTimes(1);
    expect(consumeRateLimitMock.mock.calls[0][0]).toEqual({
      bucket: "startup-package.save-answer",
      actorId: "u-42",
      limit: 60,
      windowSeconds: 3600,
    });
  });

  it("429 rate_limited passes retry_after_seconds through into body AND Retry-After header", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(denyRate(1234));
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", answerText: "hello" }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1234");
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      reason: "rate_limited",
      limit: 60,
      retry_after_seconds: 1234,
    });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(recomputeAndSnapshotMock).not.toHaveBeenCalled();
  });

  it("429 defaults Retry-After header to '60' when retry_after_seconds is absent", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(denyRate(null));
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", answerText: "hello" }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("400 invalid_json on unparseable body (rate-limit already consumed)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await POST(makeRequest("raw", "{not json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "invalid_json" });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(recomputeAndSnapshotMock).not.toHaveBeenCalled();
  });

  it("400 invalid_step_key when stepKey is unknown / missing", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await POST(
      makeRequest({ stepKey: "not_a_real_step", answerText: "hello" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "invalid_step_key" });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("400 empty_answer when answerText is empty / whitespace-only (trim applied before length check)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", answerText: "   \n\t  " }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "empty_answer" });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("400 answer_too_long when trimmed answerText exceeds 20_000 chars", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await POST(
      makeRequest({
        stepKey: "idea_and_problem",
        answerText: "a".repeat(20_001),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "answer_too_long" });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("resolves projectId from body when supplied (skips getActiveProject fallback)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    upsertMock.mockResolvedValue({ error: null });
    recomputeAndSnapshotMock.mockResolvedValue(snap());
    await POST(
      makeRequest({
        stepKey: "idea_and_problem",
        answerText: "hello",
        projectId: "proj-xyz",
      }),
    );
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(upsertMock.mock.calls[0][0]).toMatchObject({ project_id: "proj-xyz" });
    expect(recomputeAndSnapshotMock).toHaveBeenCalledWith("proj-xyz");
  });

  it("falls back to getActiveProject(user.id) when body omits projectId", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(
      makeProject({ id: "proj-active", userId: "u-1" }),
    );
    upsertMock.mockResolvedValue({ error: null });
    recomputeAndSnapshotMock.mockResolvedValue(snap());
    await POST(
      makeRequest({ stepKey: "idea_and_problem", answerText: "hello" }),
    );
    expect(getActiveProjectMock).toHaveBeenCalledWith("u-1");
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(upsertMock.mock.calls[0][0]).toMatchObject({
      project_id: "proj-active",
    });
    expect(recomputeAndSnapshotMock).toHaveBeenCalledWith("proj-active");
  });

  it("lazily createProject when neither body.projectId nor getActiveProject yield one — uses startupName as seed", async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({ id: "u-1", startupName: "  Acme Labs  ", plan: "starter" }),
    );
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(null);
    createProjectMock.mockResolvedValue({
      ok: true,
      project: makeProject({ id: "proj-new", userId: "u-1" }),
    });
    upsertMock.mockResolvedValue({ error: null });
    recomputeAndSnapshotMock.mockResolvedValue(snap());
    await POST(
      makeRequest({ stepKey: "idea_and_problem", answerText: "hello" }),
    );
    expect(createProjectMock).toHaveBeenCalledTimes(1);
    const [userId, name, plan, opts] = createProjectMock.mock.calls[0];
    expect(userId).toBe("u-1");
    expect(name).toBe("Acme Labs");
    expect(plan).toBe("starter");
    expect(opts).toEqual({ description: "Founder Package interview draft" });
    expect(upsertMock.mock.calls[0][0]).toMatchObject({ project_id: "proj-new" });
  });

  it("seed name falls back to displayName when startupName is empty", async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({
        id: "u-1",
        startupName: "   ",
        displayName: " Founder Jane ",
      }),
    );
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(null);
    createProjectMock.mockResolvedValue({
      ok: true,
      project: makeProject({ id: "proj-jane", userId: "u-1" }),
    });
    upsertMock.mockResolvedValue({ error: null });
    recomputeAndSnapshotMock.mockResolvedValue(snap());
    await POST(
      makeRequest({ stepKey: "idea_and_problem", answerText: "hello" }),
    );
    expect(createProjectMock.mock.calls[0][1]).toBe("Founder Jane");
  });

  it("seed name falls back to email local-part when both startupName and displayName are absent + defaults plan to 'free'", async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({
        id: "u-1",
        startupName: null,
        displayName: null,
        email: "solo@example.com",
        plan: null,
      }),
    );
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(null);
    createProjectMock.mockResolvedValue({
      ok: true,
      project: makeProject({ id: "proj-solo", userId: "u-1" }),
    });
    upsertMock.mockResolvedValue({ error: null });
    recomputeAndSnapshotMock.mockResolvedValue(snap());
    await POST(
      makeRequest({ stepKey: "idea_and_problem", answerText: "hello" }),
    );
    expect(createProjectMock.mock.calls[0][1]).toBe("solo");
    expect(createProjectMock.mock.calls[0][2]).toBe("free");
  });

  it("400 propagates createProject failure reason when the lazy create fails", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(null);
    createProjectMock.mockResolvedValue({
      ok: false,
      reason: "founder_limit_reached",
    });
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", answerText: "hello" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "founder_limit_reached" });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(recomputeAndSnapshotMock).not.toHaveBeenCalled();
  });

  it("400 defaults to 'project_create_failed' when createProject returns ok:false with no reason", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(null);
    createProjectMock.mockResolvedValue({ ok: false });
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", answerText: "hello" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "project_create_failed" });
  });

  it("503 db_unavailable when getSupabaseAdmin returns null (post project resolution)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(
      makeRequest({
        stepKey: "idea_and_problem",
        answerText: "hello",
        projectId: "proj-1",
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "db_unavailable" });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(recomputeAndSnapshotMock).not.toHaveBeenCalled();
  });

  it("upserts against startup_package_interview with (project_id,step_key) onConflict + trimmed answer + char_count", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    upsertMock.mockResolvedValue({ error: null });
    recomputeAndSnapshotMock.mockResolvedValue(snap());
    await POST(
      makeRequest({
        stepKey: "one_line_pitch",
        answerText: "   The friendliest CRM for AU tradies.   ",
        projectId: "proj-1",
      }),
    );
    expect(fromMock).toHaveBeenCalledWith("startup_package_interview");
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsertMock.mock.calls[0];
    expect(payload).toMatchObject({
      project_id: "proj-1",
      step_key: "one_line_pitch",
      answer_text: "The friendliest CRM for AU tradies.",
      char_count: "The friendliest CRM for AU tradies.".length,
    });
    expect(typeof (payload as Record<string, unknown>).updated_at).toBe("string");
    expect(opts).toEqual({ onConflict: "project_id,step_key" });
  });

  it("200 skipped:true + sviMeter:null when the interview table is missing (code 42P01) so the client keeps its draft", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    upsertMock.mockResolvedValue({ error: { code: "42P01" } });
    const res = await POST(
      makeRequest({
        stepKey: "idea_and_problem",
        answerText: "hello",
        projectId: "proj-1",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      skipped: true,
      reason: "table_missing",
      sviMeter: null,
    });
    expect(recomputeAndSnapshotMock).not.toHaveBeenCalled();
  });

  it("500 upsert_failed on generic upsert error (non-42P01)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    upsertMock.mockResolvedValue({
      error: { code: "23505", message: "duplicate key" },
    });
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(
      makeRequest({
        stepKey: "idea_and_problem",
        answerText: "hello",
        projectId: "proj-1",
      }),
    );
    consoleErr.mockRestore();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "upsert_failed" });
    expect(recomputeAndSnapshotMock).not.toHaveBeenCalled();
  });

  it("happy-path 200 returns {ok, projectId, sviMeter:{svi,delta,stage}} from recomputeAndSnapshot", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    upsertMock.mockResolvedValue({ error: null });
    recomputeAndSnapshotMock.mockResolvedValue(
      snap({ svi: 68, delta: -4, stage: 3 }),
    );
    const res = await POST(
      makeRequest({
        stepKey: "revenue_hypothesis",
        answerText: "hello",
        projectId: "proj-1",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      projectId: "proj-1",
      sviMeter: { svi: 68, delta: -4, stage: 3 },
    });
    expect(recomputeAndSnapshotMock).toHaveBeenCalledWith("proj-1");
  });
});
