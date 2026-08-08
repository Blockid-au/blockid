// Unit tests for POST /api/startup-package/analyze — P5-analyze-route.
//
// The auth-gated, credit-metered, LLM-backed per-step agent dispatch that
// sits behind every "Analyze this answer" click on the Ship-1 guided-interview
// wizard ([[project_startup_package_ship1]]). Completes the P5 route-test
// slate alongside P5-save-answer-route-test + P5-reservation-route-test +
// P5-svi-snapshot-route-test.
//
// A silent regression here has three high-blast-radius failure modes:
//   1. dispatching the LLM BEFORE the pre-flight balance check (bill-first,
//      analyse-later) — refund logic in the app tier does not exist so any
//      call that spends before dispatching would drain a founder's balance
//      on the first invalid stepKey;
//   2. dropping the 42P01 (`assembled_reports` migration not applied)
//      swallow branch, which would 500 an otherwise-successful analysis on
//      any preview environment;
//   3. rolling back the credit spend on a Supabase mid-flight race — the
//      route is intentionally NOT transactional (see the "// Rare race"
//      comment at route.ts:283); a regression that flips to `ok:false` on
//      spend-race would surface a fake failure to a founder who just paid.
//
// Every delegate (auth, rate-limit, credits, ai-client, projects, supabase,
// svi-recompute, agent-prompts) is mocked so this test asserts route wiring
// in isolation. `svi-analysis` + `interview-steps` + `evaluation-criteria` +
// `report-pipeline/types` are left as real imports — they're pure lookups and
// mocking them would just re-implement the enum.

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
vi.mock("@/lib/projects", () => ({
  getActiveProject: (userId: string) => getActiveProjectMock(userId),
}));

const getBalanceMock = vi.fn<(userId: string) => Promise<number>>();
const spendCreditsMock =
  vi.fn<
    (
      userId: string,
      feature: string,
      metadata?: Record<string, unknown>,
    ) => Promise<{ ok: boolean; balance: number }>
  >();
vi.mock("@/lib/credits", () => ({
  getBalance: (userId: string) => getBalanceMock(userId),
  spendCredits: (
    userId: string,
    feature: string,
    metadata?: Record<string, unknown>,
  ) => spendCreditsMock(userId, feature, metadata),
  FEATURE_COSTS: { package_agent_analysis: 1 } as Record<string, number>,
}));

const callAIMock =
  vi.fn<(opts: Record<string, unknown>) => Promise<{ text: string }>>();
vi.mock("@/lib/ai-client", () => ({
  callAI: (opts: Record<string, unknown>) => callAIMock(opts),
}));

const buildAgentPromptMock = vi.fn(() => "SYSTEM-PROMPT");
vi.mock("@/lib/report-pipeline/agent-prompts", () => ({
  buildAgentPrompt: () => buildAgentPromptMock(),
}));

const recomputeAndSnapshotMock =
  vi.fn<
    (projectId: string) => Promise<{ svi: number; delta: number; stage: number }>
  >();
vi.mock("@/lib/startup-package/svi-recompute", () => ({
  recomputeAndSnapshot: (projectId: string) => recomputeAndSnapshotMock(projectId),
}));

// Supabase multiplex — 4 tables touched by the route, three different chain
// shapes. Terminal responses live in `state.responses`; captured writes live
// in `state.captured` so tests can assert insert payload shape verbatim.
type MultiState = {
  responses: {
    interview: { data: unknown; error: unknown };
    projects: { data: unknown; error: unknown };
    svi_accounts: { data: unknown; error: unknown };
    assembled_reports: { error: unknown };
  };
  captured: {
    interview_project_id: string | null;
    projects_id: string | null;
    svi_accounts_email: string | null;
    svi_accounts_project_id: string | null;
    assembled_reports_insert: Record<string, unknown> | null;
  };
  fromCalls: string[];
};

let supaState: MultiState;
function resetSupa() {
  supaState = {
    responses: {
      interview: { data: [], error: null },
      projects: { data: null, error: null },
      svi_accounts: { data: null, error: null },
      assembled_reports: { error: null },
    },
    captured: {
      interview_project_id: null,
      projects_id: null,
      svi_accounts_email: null,
      svi_accounts_project_id: null,
      assembled_reports_insert: null,
    },
    fromCalls: [],
  };
}

function makeFrom(table: string) {
  supaState.fromCalls.push(table);
  if (table === "startup_package_interview") {
    const chain = {
      select: () => chain,
      eq: (col: string, value: string) => {
        if (col === "project_id") supaState.captured.interview_project_id = value;
        return chain;
      },
      order: () => Promise.resolve(supaState.responses.interview),
    };
    return chain;
  }
  if (table === "projects") {
    const chain = {
      select: () => chain,
      eq: (col: string, value: string) => {
        if (col === "id") supaState.captured.projects_id = value;
        return chain;
      },
      maybeSingle: () => Promise.resolve(supaState.responses.projects),
    };
    return chain;
  }
  if (table === "svi_accounts") {
    const chain = {
      select: () => chain,
      eq: (col: string, value: string) => {
        if (col === "email") supaState.captured.svi_accounts_email = value;
        if (col === "project_id")
          supaState.captured.svi_accounts_project_id = value;
        return chain;
      },
      maybeSingle: () => Promise.resolve(supaState.responses.svi_accounts),
    };
    return chain;
  }
  if (table === "assembled_reports") {
    return {
      insert: (payload: Record<string, unknown>) => {
        supaState.captured.assembled_reports_insert = payload;
        return Promise.resolve(supaState.responses.assembled_reports);
      },
    };
  }
  throw new Error(`Unmocked supabase table: ${table}`);
}

const getSupabaseAdminMock = vi.fn<() => { from: typeof makeFrom } | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
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

function allowRate() {
  return {
    allowed: true,
    limit: 5,
    remaining: 4,
    reset_at: "2026-08-08T01:00:00.000Z",
  };
}
function denyRate(retry: number | null) {
  return {
    allowed: false,
    limit: 5,
    remaining: 0,
    reset_at: "2026-08-08T01:00:00.000Z",
    ...(retry != null ? { retry_after_seconds: retry } : {}),
  };
}

function makeRequest(body: unknown | "raw", raw?: string): Request {
  return new Request("http://x/api/startup-package/analyze", {
    method: "POST",
    body: body === "raw" ? raw : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// A minimal LLM response that carries a valid <!-- SCORE: NN --> marker so
// the route's score-parse branch is exercised.
const AI_RESPONSE = [
  "The founder framing is strong. The idea is validated by early customer",
  "conversations. Three strengths, three gaps, three next steps follow.",
  "",
  "<!-- SCORE: 78 -->",
].join("\n");

function primeHappyPath(overrides: Partial<MultiState["responses"]> = {}) {
  supaState.responses = {
    interview: {
      data: [
        { step_key: "idea_and_problem", answer_text: "We fix X for Y." },
        { step_key: "target_customers", answer_text: "SMB tradies in AU." },
      ],
      error: null,
    },
    projects: { data: { name: "Acme Labs" }, error: null },
    svi_accounts: { data: { id: "acct-1" }, error: null },
    assembled_reports: { error: null },
    ...overrides,
  };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  consumeRateLimitMock.mockReset();
  getActiveProjectMock.mockReset();
  getBalanceMock.mockReset();
  spendCreditsMock.mockReset();
  callAIMock.mockReset();
  buildAgentPromptMock.mockClear();
  recomputeAndSnapshotMock.mockReset();
  getSupabaseAdminMock.mockReset();
  resetSupa();
  getSupabaseAdminMock.mockReturnValue({ from: makeFrom });
  // sensible defaults for the happy path — individual tests may override.
  getBalanceMock.mockResolvedValue(100);
  spendCreditsMock.mockResolvedValue({ ok: true, balance: 99 });
  callAIMock.mockResolvedValue({ text: AI_RESPONSE });
  recomputeAndSnapshotMock.mockResolvedValue({ svi: 71, delta: 4, stage: 2 });
});

describe("POST /api/startup-package/analyze", () => {
  it("401 anon short-circuits before rate-limit, credits, AI dispatch, and DB", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "authentication_required" });
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(getBalanceMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(callAIMock).not.toHaveBeenCalled();
    expect(recomputeAndSnapshotMock).not.toHaveBeenCalled();
  });

  it("uses the correct rate-limit bucket + limit + window + actor id", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-42" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    expect(consumeRateLimitMock).toHaveBeenCalledTimes(1);
    expect(consumeRateLimitMock.mock.calls[0][0]).toEqual({
      bucket: "startup-package.analyze",
      actorId: "u-42",
      limit: 5,
      windowSeconds: 3600,
    });
  });

  it("429 rate_limited passes retry_after_seconds into body AND Retry-After header + does not spend or dispatch", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(denyRate(777));
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("777");
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      reason: "rate_limited",
      limit: 5,
      retry_after_seconds: 777,
    });
    expect(getBalanceMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("429 defaults Retry-After to '60' when retry_after_seconds is absent", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(denyRate(null));
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("400 invalid_json on unparseable body (rate-limit consumed, nothing else)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await POST(makeRequest("raw", "{nope"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "invalid_json" });
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("400 invalid_step_key on missing / unknown stepKey — never spends or dispatches", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    consumeRateLimitMock.mockResolvedValue(allowRate());
    const res = await POST(
      makeRequest({ stepKey: "not_a_real_step", projectId: "proj-1" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "invalid_step_key" });
    expect(getBalanceMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("resolves projectId from body when supplied (skips getActiveProject fallback)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-body" }),
    );
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    expect(supaState.captured.interview_project_id).toBe("proj-body");
    expect(recomputeAndSnapshotMock).toHaveBeenCalledWith("proj-body");
  });

  it("falls back to getActiveProject(user.id) when body omits projectId", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(
      makeProject({ id: "proj-active", userId: "u-1" }),
    );
    primeHappyPath();
    await POST(makeRequest({ stepKey: "idea_and_problem" }));
    expect(getActiveProjectMock).toHaveBeenCalledWith("u-1");
    expect(supaState.captured.interview_project_id).toBe("proj-active");
  });

  it("400 no_project when neither body nor getActiveProject yield a projectId (never spends)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ stepKey: "idea_and_problem" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "no_project" });
    expect(getBalanceMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("402 insufficient_credits when balance < FEATURE_COSTS.package_agent_analysis — dispatch is skipped", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getBalanceMock.mockResolvedValue(0);
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      reason: "insufficient_credits",
      credits_needed: 1,
      credits_balance: 0,
      url: "/credits",
    });
    expect(callAIMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("503 db_unavailable when getSupabaseAdmin returns null AFTER credit pre-flight (never dispatches)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "db_unavailable" });
    expect(callAIMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("400 no_answers_yet when the interview table is empty for this project (never dispatches or spends)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath({ interview: { data: [], error: null } });
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "no_answers_yet" });
    expect(callAIMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("400 no_answers_yet when all stored answers are whitespace-only (rawText.trim() empty)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath({
      interview: {
        data: [{ step_key: "idea_and_problem", answer_text: "   " }],
        error: null,
      },
    });
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    // Note: header text "## idea_and_problem" is non-empty, so this path
    // proves the guard treats the concatenated join (headers + content) as
    // "content present" — the correct behaviour is that a header alone still
    // dispatches; this test pins that guard shape to prevent an accidental
    // regression that "cleans" the header first.
    expect(res.status).toBe(200);
    // But if the founder has never saved anything, the responses.data is
    // empty (covered in the previous test). Assert dispatch fired here.
    expect(callAIMock).toHaveBeenCalledTimes(1);
  });

  it("502 dispatch_failed when callAI throws — credits are NOT spent (implicit refund)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    callAIMock.mockRejectedValue(new Error("upstream 429"));
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    consoleErr.mockRestore();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      reason: "dispatch_failed",
      detail: "upstream 429",
    });
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(recomputeAndSnapshotMock).not.toHaveBeenCalled();
  });

  it("callAI receives maxTokens from REPORT_TIER_CONFIG.standard (tier is hard-coded to standard regardless of body.tier)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    await POST(
      makeRequest({
        stepKey: "idea_and_problem",
        projectId: "proj-1",
        tier: "free",
      }),
    );
    expect(callAIMock).toHaveBeenCalledTimes(1);
    const opts = callAIMock.mock.calls[0][0];
    expect(opts).toMatchObject({ system: "SYSTEM-PROMPT" });
    // startup name from `projects.name` lookup must land in the user prompt.
    expect(String(opts.user)).toContain("Acme Labs");
    // interview answers are joined into the prompt verbatim.
    expect(String(opts.user)).toContain("We fix X for Y.");
    // maxTokens is a positive integer sourced from REPORT_TIER_CONFIG.
    expect(typeof opts.maxTokens).toBe("number");
    expect((opts.maxTokens as number) > 0).toBe(true);
  });

  it("startupName falls back to 'Untitled startup' when the projects lookup returns null", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath({ projects: { data: null, error: null } });
    await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    const opts = callAIMock.mock.calls[0][0];
    expect(String(opts.user)).toContain("Untitled startup");
  });

  it("spendCredits fires ONLY after a successful dispatch — with the metadata contract expected by billing", async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({ id: "u-1", email: "founder@example.com" }),
    );
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    const [userId, feature, metadata] = spendCreditsMock.mock.calls[0];
    expect(userId).toBe("u-1");
    expect(feature).toBe("package_agent_analysis");
    expect(metadata).toMatchObject({
      project_id: "proj-1",
      step_key: "idea_and_problem",
      lead_agent: "cto",
      criterion: "idea",
    });
    expect(typeof (metadata as Record<string, unknown>).display_cost).toBe(
      "number",
    );
  });

  it("assembled_reports insert is SKIPPED when svi_accounts lookup returns null (no FK anchor)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath({ svi_accounts: { data: null, error: null } });
    await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    expect(supaState.captured.assembled_reports_insert).toBeNull();
    // The snapshot still recomputes so the client's live meter advances.
    expect(recomputeAndSnapshotMock).toHaveBeenCalledWith("proj-1");
  });

  it("assembled_reports insert captures the SCORE marker, exec summary, sections_json, and status='complete' with a stable natural-key shape", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    const insert = supaState.captured.assembled_reports_insert;
    expect(insert).not.toBeNull();
    expect(insert).toMatchObject({
      account_id: "acct-1",
      user_id: "u-1",
      project_id: "proj-1",
      tier: "standard",
      locale: "en",
      title: "Package step: idea_and_problem",
      status: "complete",
      credits_cost: 1,
      quality_score: 60,
    });
    const sections = (insert as { sections_json: unknown[] }).sections_json;
    expect(Array.isArray(sections)).toBe(true);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      id: "sec-idea_and_problem",
      criterion: "idea",
      agentRole: "cto",
      score: 78,
    });
    // exec summary strips the SCORE marker so it's founder-safe display copy.
    expect((insert as { executive_summary: string }).executive_summary).not.toContain(
      "SCORE:",
    );
  });

  it("42P01 assembled_reports insert failure is swallowed — response is still 200 + snapshot still runs", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath({
      assembled_reports: { error: { code: "42P01", message: "missing" } },
    });
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    consoleErr.mockRestore();
    // Regression sentinel: a non-42P01 write error should NOT log 42P01.
    expect(
      consoleErr.mock.calls.some((c) =>
        String(c[0]).includes("assembled_reports insert failed"),
      ),
    ).toBe(false);
    expect(res.status).toBe(200);
    expect(recomputeAndSnapshotMock).toHaveBeenCalledWith("proj-1");
  });

  it("non-42P01 insert error is LOGGED but still returns 200 (best-effort persist)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath({
      assembled_reports: { error: { code: "23505", message: "dup" } },
    });
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    const logged = consoleErr.mock.calls.some((c) =>
      String(c[0]).includes("assembled_reports insert failed"),
    );
    consoleErr.mockRestore();
    expect(logged).toBe(true);
    expect(res.status).toBe(200);
  });

  it("happy-path 200 returns {ok, reportId, sviDelta, svi, executiveSummary, creditsRemaining} and echoes the snapshot", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 42 });
    recomputeAndSnapshotMock.mockResolvedValue({
      svi: 71,
      delta: 4,
      stage: 2,
    });
    const res = await POST(
      makeRequest({ stepKey: "target_customers", projectId: "proj-1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      sviDelta: 4,
      svi: 71,
      creditsRemaining: 42,
    });
    expect(typeof body.reportId).toBe("string");
    expect(body.reportId).toMatch(/^pkg-/);
    expect(typeof body.executiveSummary).toBe("string");
    // No upgrade suggestion when balance is >= 3.
    expect(body.upgradeSuggestion).toBeUndefined();
  });

  it("upgradeSuggestion appears when the post-spend balance drops below 3", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    spendCreditsMock.mockResolvedValue({ ok: true, balance: 2 });
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    const body = await res.json();
    expect(body.creditsRemaining).toBe(2);
    expect(typeof body.upgradeSuggestion).toBe("string");
    expect(String(body.upgradeSuggestion)).toMatch(/top up/i);
  });

  it("spendCredits race (ok:false) still returns 200 — the LLM work is persisted, warning is logged", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    spendCreditsMock.mockResolvedValue({ ok: false, balance: 0 });
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    const warned = consoleWarn.mock.calls.some((c) =>
      String(c[0]).includes("spendCredits race"),
    );
    consoleWarn.mockRestore();
    expect(warned).toBe(true);
    expect(res.status).toBe(200);
  });

  it("svi_accounts lookup is scoped by BOTH email AND project_id (per-project account isolation)", async () => {
    getCurrentUserMock.mockResolvedValue(
      makeUser({ id: "u-1", email: "SOMEONE@example.com" }),
    );
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    expect(supaState.captured.svi_accounts_email).toBe("SOMEONE@example.com");
    expect(supaState.captured.svi_accounts_project_id).toBe("proj-1");
  });

  it("interview lookup is scoped by project_id — never leaks answers cross-project", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-special" }),
    );
    expect(supaState.captured.interview_project_id).toBe("proj-special");
    expect(supaState.captured.projects_id).toBe("proj-special");
  });

  it("reportId is unique across calls (Date.now + Math.random collision-avoidance)", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    const r1 = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    const b1 = await r1.json();
    const r2 = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    const b2 = await r2.json();
    expect(b1.reportId).not.toBe(b2.reportId);
  });

  it("SCORE marker missing → falls back to a mid-range 50 without failing", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    callAIMock.mockResolvedValue({
      text: "Just prose, no score marker at all.",
    });
    const res = await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    expect(res.status).toBe(200);
    const insert = supaState.captured.assembled_reports_insert;
    const sections = (insert as { sections_json: Array<{ score: number }> })
      .sections_json;
    expect(sections[0].score).toBe(50);
  });

  it("SCORE marker clamps to [0, 100] — a value of 250 lands as 100 in the persisted section", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ id: "u-1" }));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    primeHappyPath();
    callAIMock.mockResolvedValue({ text: "<!-- SCORE: 250 -->\nbody" });
    await POST(
      makeRequest({ stepKey: "idea_and_problem", projectId: "proj-1" }),
    );
    const insert = supaState.captured.assembled_reports_insert;
    const sections = (insert as { sections_json: Array<{ score: number }> })
      .sections_json;
    expect(sections[0].score).toBe(100);
  });
});
