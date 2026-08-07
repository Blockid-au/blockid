// Colocated vitest for POST /api/ai/equity-split — P9-equity-split-route-test.
//
// The route is founder-facing: it takes a list of founders (with cash,
// time, IP, and years of experience), asks the AI advisor for a Slicing-Pie
// equity split, and writes the recommendation into
// `ai_equity_recommendations` for the founder's audit trail.
//
// Silent regressions this suite pins against:
//   - Dropping the auth guard and letting an anonymous caller burn AI
//     tokens (and pollute another founder's `ai_equity_recommendations`).
//   - Regressing the JSON body-parse `catch` and 500-ing on any malformed
//     POST body from the founder wizard.
//   - Dropping the "at least 1 founder" guardrail and letting an empty
//     array reach the AI (wasted tokens for a guaranteed nonsense answer).
//   - Dropping the fenced-code strip and 500-ing on the (very common) AI
//     habit of wrapping JSON in ```json ... ``` — the widget must never
//     fail because the model added a fence.
//   - Regressing the `isSupabaseConfigured()` guard and NPE-ing when
//     Supabase is not configured (local dev / preview envs).
//   - Dropping the `credits_charged: 1.0` audit stamp so the CFO can no
//     longer reconcile the credits burn against `ai_equity_recommendations`.
//   - Regressing the AI-throw `catch` and letting an ai-client outage
//     take the entire wizard step down.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE route import) --------------------------------

const getCurrentUserMock =
  vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const callAIMock = vi.fn<
  (opts: {
    system: string;
    user: string;
    maxTokens?: number;
  }) => Promise<{ text: string; provider: string; model: string }>
>();
vi.mock("@/lib/ai-client", () => ({
  callAI: (opts: { system: string; user: string; maxTokens?: number }) =>
    callAIMock(opts),
}));

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// Route import MUST come after mocks are registered.
import { POST, dynamic } from "./route";

// --- Fake supabase capturing the insert into ai_equity_recommendations ----

type InsertRow = Record<string, unknown>;

interface FakeState {
  inserts: Array<{ table: string; row: InsertRow }>;
  fail?: { insert?: string };
}

function makeFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      return {
        async insert(row: InsertRow) {
          if (state.fail?.insert) {
            return { data: null, error: { message: state.fail.insert } };
          }
          state.inserts.push({ table, row });
          return { data: [row], error: null };
        },
      };
    },
  };
}

const USER = { id: "user-uuid-1", email: "founder@example.com" };

function req(body: unknown | string): Request {
  const init: RequestInit = { method: "POST" };
  if (typeof body === "string") {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new Request("http://localhost/api/ai/equity-split", init);
}

function goodAIJson() {
  return JSON.stringify({
    splits: [
      { name: "Ada", percentage: 60, rationale: "Solo IP + full-time" },
      { name: "Ben", percentage: 40, rationale: "Cash + part-time" },
    ],
    vestingRecommendation: "4-year with 1-year cliff",
    esopRecommendation: "10% pool at pre-seed",
    warnings: [],
    benchmarkComparison: "Consistent with AU pre-seed norms",
  });
}

// ---------------------------------------------------------------------------

describe("POST /api/ai/equity-split", () => {
  let state: FakeState;

  beforeEach(() => {
    getCurrentUserMock.mockReset();
    callAIMock.mockReset();
    isSupabaseConfiguredMock.mockReset();
    getSupabaseAdminMock.mockReset();

    state = { inserts: [] };
    getCurrentUserMock.mockResolvedValue(USER);
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase(state));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req({ founders: [{ name: "A", role: "CEO" }] }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "Authentication required",
    });
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(req("not-json{"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "Invalid JSON",
    });
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("returns 400 when founders array is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "At least 1 founder required",
    });
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("returns 400 when founders is an empty array", async () => {
    const res = await POST(req({ founders: [] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "At least 1 founder required",
    });
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("returns 200 with parsed AI JSON on the happy path", async () => {
    callAIMock.mockResolvedValue({
      text: goodAIJson(),
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    const res = await POST(
      req({
        founders: [
          {
            name: "Ada",
            role: "CTO",
            cashContribution: 10000,
            timeCommitment: "full-time",
            ipContribution: "core algo",
            experienceYears: 8,
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.recommendation.splits).toHaveLength(2);
    expect(body.recommendation.vestingRecommendation).toContain("4-year");
  });

  it("strips ```json ...``` code fences before JSON.parse", async () => {
    callAIMock.mockResolvedValue({
      text: "```json\n" + goodAIJson() + "\n```",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    const res = await POST(
      req({ founders: [{ name: "Ada", role: "CEO" }] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.recommendation.splits[0].name).toBe("Ada");
  });

  it("strips bare ``` fences (no language tag) before JSON.parse", async () => {
    callAIMock.mockResolvedValue({
      text: "```\n" + goodAIJson() + "\n```",
      provider: "openai",
      model: "gpt-x",
    });
    const res = await POST(
      req({ founders: [{ name: "Ada", role: "CEO" }] }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("500s when the AI returns un-parseable text", async () => {
    callAIMock.mockResolvedValue({
      text: "sorry, I cannot comply",
      provider: "anthropic",
      model: "claude",
    });
    const res = await POST(
      req({ founders: [{ name: "Ada", role: "CEO" }] }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "AI recommendation failed",
    });
  });

  it("500s when callAI throws (ai-client outage)", async () => {
    callAIMock.mockRejectedValue(new Error("ai down"));
    const res = await POST(
      req({ founders: [{ name: "Ada", role: "CEO" }] }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "AI recommendation failed",
    });
  });

  it("stamps ai_equity_recommendations with account_id + type + credits", async () => {
    callAIMock.mockResolvedValue({
      text: goodAIJson(),
      provider: "a",
      model: "m",
    });
    const founders = [
      { name: "Ada", role: "CEO", cashContribution: 5000 },
      { name: "Ben", role: "COO" },
    ];
    const res = await POST(req({ founders }));
    expect(res.status).toBe(200);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      table: "ai_equity_recommendations",
      row: {
        account_id: USER.id,
        recommendation_type: "equity_split",
        credits_charged: 1.0,
        input_context: { founders },
      },
    });
    expect(state.inserts[0].row.recommendation).toBeDefined();
  });

  it("skips DB insert when Supabase is not configured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    callAIMock.mockResolvedValue({
      text: goodAIJson(),
      provider: "a",
      model: "m",
    });
    const res = await POST(
      req({ founders: [{ name: "Ada", role: "CEO" }] }),
    );
    expect(res.status).toBe(200);
    expect(state.inserts).toHaveLength(0);
    // getSupabaseAdmin() is never dereferenced when the guard is short-circuit
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("forwards founder cash/time/IP/experience into the AI user prompt", async () => {
    callAIMock.mockResolvedValue({
      text: goodAIJson(),
      provider: "a",
      model: "m",
    });
    const res = await POST(
      req({
        founders: [
          {
            name: "Ada",
            role: "CEO",
            cashContribution: 12345,
            timeCommitment: "part-time",
            ipContribution: "brand",
            experienceYears: 15,
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const call = callAIMock.mock.calls[0][0];
    expect(call.system).toContain("Australian");
    expect(call.user).toContain("Ada");
    expect(call.user).toContain("CEO");
    expect(call.user).toContain("A$12345");
    expect(call.user).toContain("part-time");
    expect(call.user).toContain("brand");
    expect(call.user).toContain("15 years");
    expect(call.maxTokens).toBe(1000);
  });

  it("defaults missing founder fields (cash=0, time=full-time, ip=none, years=0)", async () => {
    callAIMock.mockResolvedValue({
      text: goodAIJson(),
      provider: "a",
      model: "m",
    });
    const res = await POST(
      req({ founders: [{ name: "Ada", role: "CEO" }] }),
    );
    expect(res.status).toBe(200);
    const prompt = callAIMock.mock.calls[0][0].user;
    expect(prompt).toContain("A$0");
    expect(prompt).toContain("Time full-time");
    expect(prompt).toContain("IP: none");
    expect(prompt).toContain("0 years");
  });

  it("still 200s when the DB insert errors (audit is best-effort)", async () => {
    state.fail = { insert: "boom" };
    callAIMock.mockResolvedValue({
      text: goodAIJson(),
      provider: "a",
      model: "m",
    });
    const res = await POST(
      req({ founders: [{ name: "Ada", role: "CEO" }] }),
    );
    // The route awaits the insert but does not gate the 200 on error.
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("exports dynamic = 'force-dynamic'", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
