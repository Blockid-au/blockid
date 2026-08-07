// Colocated vitest for POST + GET /api/feedback — P9-feedback-route-test.
//
// The route is a two-way funnel between founders and the R&D loop:
//   1. POST — founder submits free-text feedback; the R&D-agent AI scores it
//      on specificity / actionability / value (0-10 each); if the total ≥ 15
//      AND is_useful=true the founder is awarded 0.25 / 0.50 / 1.00 credits,
//      capped at 1.00; the row lands in user_feedback with an ai_summary and
//      a status of "rewarded" or "received".
//   2. GET — founder pulls their last 20 rows for the /account feedback tab.
//
// Silent regressions this suite pins against:
//   - Dropping the auth guard on POST or GET and leaking one founder's
//     feedback to another (multi-tenant leak in a shared column).
//   - Regressing the 10-char / 2000-char guardrails and letting empty spam
//     or a 500 KB payload through to the AI and the DB.
//   - Dropping the 5-per-day rate limit and letting a founder farm feedback
//     for infinite credits.
//   - Dropping the AI JSON-parse `catch` and 500-ing the widget on any
//     malformed model output (the fallback is 0.25 credit + a canned
//     ai_summary — the widget must never fail because the AI misbehaved).
//   - Dropping the AI-throw `catch` and letting an ai-client outage take
//     the feedback endpoint down entirely (must save the row with a
//     pending summary and 0.25 credit).
//   - Regressing the `is_useful && score >= 15` gate so every submission
//     silently awards credits (turns the /feedback CTA into an unmetered
//     credit fountain).
//   - Regressing the Math.min(..., 1.00) suggested-credits cap and letting
//     an AI hallucination of "10.0 credits" drain the credits budget.
//   - Flipping the status column so "rewarded" rows show as "received" in
//     the admin dashboard (breaks the R&D funnel triage view).
//   - Regressing the `${creditsAwarded !== 1 ? "s" : ""}` pluralisation
//     so a 1-credit award reads "1 credits" (looks like a template bug in
//     the confirmation toast).
//   - Regressing the grantCredits `.catch(() => {})` and letting a credits
//     outage 500 the widget after the row already landed in the DB.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE route import) --------------------------------

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const grantCreditsMock = vi.fn<
  (
    userId: string,
    amount: number,
    reason: string,
  ) => Promise<{ ok: boolean; balance: number }>
>();
vi.mock("@/lib/credits", () => ({
  grantCredits: (userId: string, amount: number, reason: string) =>
    grantCreditsMock(userId, amount, reason),
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

// Route import MUST come after mocks are registered.
import { POST, GET, dynamic } from "./route";

// --- Fake supabase capturing the count-select + insert + list-select chains

interface InsertPayload {
  user_id?: unknown;
  email?: unknown;
  feedback?: unknown;
  category?: unknown;
  page?: unknown;
  ai_score?: unknown;
  ai_summary?: unknown;
  credits_awarded?: unknown;
  status?: unknown;
}

interface CountSelectCall {
  cols: string;
  options: { count?: string; head?: boolean } | undefined;
  eqCol: string | null;
  eqVal: unknown;
  gteCol: string | null;
  gteVal: unknown;
}

interface ListSelectCall {
  cols: string;
  eqCol: string | null;
  eqVal: unknown;
  orderCol: string | null;
  orderOpts: { ascending?: boolean } | null;
  limitN: number | null;
}

interface FakeState {
  insertTable: string | null;
  insertPayload: InsertPayload | null;
  insertError: { message: string } | null;

  countValue: number | null;
  countSelects: CountSelectCall[];

  listData: unknown[] | null;
  listSelects: ListSelectCall[];

  fromCalls: number;
}

const state: FakeState = {
  insertTable: null,
  insertPayload: null,
  insertError: null,
  countValue: 0,
  countSelects: [],
  listData: [],
  listSelects: [],
  fromCalls: 0,
};

function resetState() {
  state.insertTable = null;
  state.insertPayload = null;
  state.insertError = null;
  state.countValue = 0;
  state.countSelects = [];
  state.listData = [];
  state.listSelects = [];
  state.fromCalls = 0;
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      return {
        insert(payload: InsertPayload) {
          state.insertTable = table;
          state.insertPayload = payload;
          return Promise.resolve({ error: state.insertError });
        },
        select(
          cols: string,
          options?: { count?: string; head?: boolean },
        ) {
          // Two distinct select chains land here:
          //   - count-head chain: select("id", { count, head }).eq().gte() → { count }
          //   - list chain:       select(cols).eq().order().limit()        → { data }
          if (options?.head) {
            const call: CountSelectCall = {
              cols,
              options,
              eqCol: null,
              eqVal: null,
              gteCol: null,
              gteVal: null,
            };
            state.countSelects.push(call);
            return {
              eq(eqCol: string, eqVal: unknown) {
                call.eqCol = eqCol;
                call.eqVal = eqVal;
                return {
                  gte(gteCol: string, gteVal: unknown) {
                    call.gteCol = gteCol;
                    call.gteVal = gteVal;
                    return Promise.resolve({ count: state.countValue });
                  },
                };
              },
            };
          }
          const listCall: ListSelectCall = {
            cols,
            eqCol: null,
            eqVal: null,
            orderCol: null,
            orderOpts: null,
            limitN: null,
          };
          state.listSelects.push(listCall);
          return {
            eq(eqCol: string, eqVal: unknown) {
              listCall.eqCol = eqCol;
              listCall.eqVal = eqVal;
              return {
                order(orderCol: string, orderOpts?: { ascending?: boolean }) {
                  listCall.orderCol = orderCol;
                  listCall.orderOpts = orderOpts ?? null;
                  return {
                    limit(n: number) {
                      listCall.limitN = n;
                      return Promise.resolve({ data: state.listData });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function aiJson(obj: unknown, opts: { fence?: boolean } = {}): string {
  const s = JSON.stringify(obj);
  return opts.fence ? "```json\n" + s + "\n```" : s;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  grantCreditsMock.mockReset();
  callAIMock.mockReset();
  resetState();
  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
  getSupabaseAdminMock.mockImplementation(() => makeFakeSupabase());
  grantCreditsMock.mockResolvedValue({ ok: true, balance: 1 });
  callAIMock.mockResolvedValue({
    text: aiJson({
      specificity: 8,
      actionability: 8,
      value: 8,
      summary: "Clear + actionable",
      is_useful: true,
      suggested_credits: 0.5,
    }),
    provider: "claude",
    model: "test",
  });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Tests -----------------------------------------------------------------

describe("/api/feedback — module surface", () => {
  it('exports dynamic = "force-dynamic" so per-user GET is never prerendered', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("POST — auth + service guards", () => {
  it("returns 401 when getCurrentUser resolves null (login required)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Login required to submit feedback",
    });
  });

  it("does not touch supabase or the AI on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(callAIMock).not.toHaveBeenCalled();
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("returns 503 { error: 'Service unavailable' } when supabase is unconfigured", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Service unavailable" });
    // AI must not be called after the service guard trips
    expect(callAIMock).not.toHaveBeenCalled();
  });
});

describe("POST — body validation", () => {
  it("returns 400 { error: 'Invalid request' } when the body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      body: "{not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid request" });
  });

  it("returns 400 when the feedback field is missing entirely", async () => {
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Feedback must be at least 10 characters",
    });
  });

  it("returns 400 when the feedback is under 10 characters after trim", async () => {
    const res = await POST(jsonReq({ feedback: "short" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least 10/);
  });

  it("rejects whitespace-only strings using the trim() check (9 spaces + short letters)", async () => {
    const res = await POST(jsonReq({ feedback: "         hi" }));
    // trimmed length = 2 → under 10 → 400
    expect(res.status).toBe(400);
  });

  it("returns 400 when the feedback exceeds 2000 characters", async () => {
    const big = "x".repeat(2001);
    const res = await POST(jsonReq({ feedback: big }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/under 2000/);
  });

  it("accepts a feedback of exactly 10 chars (lower boundary is inclusive)", async () => {
    const res = await POST(jsonReq({ feedback: "1234567890" }));
    expect(res.status).toBe(200);
  });

  it("accepts a feedback of exactly 2000 chars (upper boundary is inclusive)", async () => {
    const res = await POST(jsonReq({ feedback: "y".repeat(2000) }));
    expect(res.status).toBe(200);
  });
});

describe("POST — daily rate limit (5-per-user)", () => {
  it("returns 429 when the user already has 5 feedback rows in the last 24h", async () => {
    state.countValue = 5;
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Maximum 5 feedback submissions per day",
    });
    // Must not insert or call AI once rate-limited
    expect(state.insertPayload).toBeNull();
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("also 429s at count > 5 (safety net — never lets a race squeak past)", async () => {
    state.countValue = 42;
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(res.status).toBe(429);
  });

  it("allows the 5th submission (count === 4 means 4 already exist, this is #5)", async () => {
    state.countValue = 4;
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(res.status).toBe(200);
  });

  it("issues a HEAD count-select against user_feedback filtered to the last 24h", async () => {
    await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(state.countSelects).toHaveLength(1);
    const call = state.countSelects[0]!;
    expect(call.cols).toBe("id");
    expect(call.options).toEqual({ count: "exact", head: true });
    expect(call.eqCol).toBe("user_id");
    expect(call.eqVal).toBe("u-1");
    expect(call.gteCol).toBe("created_at");
    const cutoff = new Date(call.gteVal as string).getTime();
    const now = Date.now();
    const delta = now - cutoff;
    expect(delta).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(delta).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it("coerces a null count value to 0 (never NaN-compares into a false 429)", async () => {
    state.countValue = null;
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(res.status).toBe(200);
  });
});

describe("POST — AI evaluation branch", () => {
  it("passes the R&D-agent system prompt + the founder's feedback + category + page to callAI", async () => {
    await POST(
      jsonReq({
        feedback: "add a CSV export to the cap table page",
        category: "feature-request",
        page: "/cap-table",
      }),
    );
    expect(callAIMock).toHaveBeenCalledTimes(1);
    const args = callAIMock.mock.calls[0]![0];
    expect(args.system).toMatch(/R&D Agent/i);
    expect(args.user).toContain("add a CSV export to the cap table page");
    expect(args.user).toContain("feature-request");
    expect(args.user).toContain("/cap-table");
    expect(args.maxTokens).toBe(200);
  });

  it("truncates the feedback slice at 500 chars in the AI prompt (protects tokens)", async () => {
    const feedback = "z".repeat(1500);
    await POST(jsonReq({ feedback }));
    const args = callAIMock.mock.calls[0]![0];
    // The prompt embeds feedback.slice(0, 500) — the full 1500 must never land in the model input
    const zCount = (args.user.match(/z/g) ?? []).length;
    expect(zCount).toBe(500);
  });

  it("defaults category to 'general' and page to 'unknown' in the AI prompt when omitted", async () => {
    await POST(jsonReq({ feedback: "meaningful feedback text" }));
    const args = callAIMock.mock.calls[0]![0];
    expect(args.user).toContain("Category: general");
    expect(args.user).toContain("Page: unknown");
  });

  it("awards the AI-suggested credit amount when total ≥ 15 and is_useful=true", async () => {
    callAIMock.mockResolvedValue({
      text: aiJson({
        specificity: 5,
        actionability: 5,
        value: 5,
        summary: "OK",
        is_useful: true,
        suggested_credits: 0.5,
      }),
      provider: "claude",
      model: "test",
    });
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    const body = await res.json();
    expect(body.creditsAwarded).toBe(0.5);
    expect(state.insertPayload?.credits_awarded).toBe(0.5);
    expect(state.insertPayload?.status).toBe("rewarded");
    expect(grantCreditsMock).toHaveBeenCalledWith("u-1", 0.5, "feedback_reward");
  });

  it("caps credits at 1.00 even when the AI hallucinates a suggestion above the max", async () => {
    callAIMock.mockResolvedValue({
      text: aiJson({
        specificity: 10,
        actionability: 10,
        value: 10,
        summary: "Excellent",
        is_useful: true,
        suggested_credits: 42,
      }),
      provider: "claude",
      model: "test",
    });
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    const body = await res.json();
    expect(body.creditsAwarded).toBe(1.0);
    expect(state.insertPayload?.credits_awarded).toBe(1.0);
    expect(grantCreditsMock).toHaveBeenCalledWith("u-1", 1.0, "feedback_reward");
  });

  it("awards 0 credits when is_useful=false, even if score ≥ 15 (both gates required)", async () => {
    callAIMock.mockResolvedValue({
      text: aiJson({
        specificity: 8,
        actionability: 8,
        value: 8,
        summary: "Not really useful though",
        is_useful: false,
        suggested_credits: 1.0,
      }),
      provider: "claude",
      model: "test",
    });
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    const body = await res.json();
    expect(body.creditsAwarded).toBe(0);
    expect(state.insertPayload?.credits_awarded).toBe(0);
    expect(state.insertPayload?.status).toBe("received");
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("awards 0 credits when the AI score sums under 15, even if is_useful=true", async () => {
    callAIMock.mockResolvedValue({
      text: aiJson({
        specificity: 3,
        actionability: 3,
        value: 3,
        summary: "Thin",
        is_useful: true,
        suggested_credits: 0.25,
      }),
      provider: "claude",
      model: "test",
    });
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    const body = await res.json();
    expect(body.creditsAwarded).toBe(0);
    expect(state.insertPayload?.status).toBe("received");
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("strips a ```json fenced-code AI response before JSON.parse (models sometimes wrap it)", async () => {
    callAIMock.mockResolvedValue({
      text: aiJson(
        {
          specificity: 7,
          actionability: 7,
          value: 7,
          summary: "Fenced but valid",
          is_useful: true,
          suggested_credits: 0.5,
        },
        { fence: true },
      ),
      provider: "claude",
      model: "test",
    });
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    const body = await res.json();
    expect(body.creditsAwarded).toBe(0.5);
    expect(body.aiSummary).toBe("Fenced but valid");
  });

  it("falls back to 0.25 credits + canned summary when the AI response is not valid JSON", async () => {
    callAIMock.mockResolvedValue({
      text: "sorry I have no idea what you want",
      provider: "claude",
      model: "test",
    });
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    const body = await res.json();
    expect(body.creditsAwarded).toBe(0.25);
    expect(body.aiSummary).toBe("Feedback received (AI evaluation unavailable)");
    expect(state.insertPayload?.ai_score).toBe(15);
    expect(state.insertPayload?.status).toBe("rewarded");
    expect(grantCreditsMock).toHaveBeenCalledWith("u-1", 0.25, "feedback_reward");
  });

  it("falls back to 0.25 credits + pending summary when callAI itself throws (outage)", async () => {
    callAIMock.mockRejectedValue(new Error("ai-outage-boom"));
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.creditsAwarded).toBe(0.25);
    expect(body.aiSummary).toBe("Feedback received (AI evaluation pending)");
    expect(state.insertPayload?.ai_score).toBe(15);
    expect(state.insertPayload?.status).toBe("rewarded");
    expect(grantCreditsMock).toHaveBeenCalledWith("u-1", 0.25, "feedback_reward");
  });
});

describe("POST — DB insert shape + failure branch", () => {
  it("inserts into user_feedback with the full row shape (id, email, trim, defaults, ai fields)", async () => {
    await POST(
      jsonReq({
        feedback: "   surrounding whitespace should be trimmed   ",
        category: "bug",
        page: "/dashboard",
      }),
    );
    expect(state.insertTable).toBe("user_feedback");
    expect(state.insertPayload?.user_id).toBe("u-1");
    expect(state.insertPayload?.email).toBe("founder@x.com");
    expect(state.insertPayload?.feedback).toBe(
      "surrounding whitespace should be trimmed",
    );
    expect(state.insertPayload?.category).toBe("bug");
    expect(state.insertPayload?.page).toBe("/dashboard");
    expect(state.insertPayload?.ai_score).toBe(24); // 8+8+8 from beforeEach default
    expect(state.insertPayload?.ai_summary).toBe("Clear + actionable");
    expect(state.insertPayload?.credits_awarded).toBe(0.5);
    expect(state.insertPayload?.status).toBe("rewarded");
  });

  it("stores category='general' and page=null when the client omitted them", async () => {
    await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(state.insertPayload?.category).toBe("general");
    expect(state.insertPayload?.page).toBeNull();
  });

  it("returns 500 { error: 'Failed to save feedback' } when the INSERT reports an error", async () => {
    state.insertError = { message: "unique-violation" };
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to save feedback" });
    // Credits must NOT be granted when the DB write failed
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});

describe("POST — credit granting + response shape", () => {
  it("does not grant credits when creditsAwarded is 0 (no wasted RPC on rejected feedback)", async () => {
    callAIMock.mockResolvedValue({
      text: aiJson({
        specificity: 1,
        actionability: 1,
        value: 1,
        summary: "no",
        is_useful: false,
        suggested_credits: 0,
      }),
      provider: "claude",
      model: "test",
    });
    await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("still returns 200 with creditsAwarded set when grantCredits itself rejects (swallowed)", async () => {
    grantCreditsMock.mockRejectedValue(new Error("credits-outage"));
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creditsAwarded).toBe(0.5);
  });

  it("uses 'credits' (plural) in the reward message for 0.25 awards (0.25 !== 1)", async () => {
    callAIMock.mockResolvedValue({
      text: aiJson({
        specificity: 5,
        actionability: 5,
        value: 5,
        summary: "ok",
        is_useful: true,
        suggested_credits: 0.25,
      }),
      provider: "claude",
      model: "test",
    });
    const body = await (
      await POST(jsonReq({ feedback: "meaningful feedback text" }))
    ).json();
    expect(body.message).toContain("0.25 credit");
    expect(body.message).toContain("credits.");
  });

  it("uses 'credit' (singular) in the reward message for exactly 1.00 awards", async () => {
    callAIMock.mockResolvedValue({
      text: aiJson({
        specificity: 10,
        actionability: 10,
        value: 10,
        summary: "excellent",
        is_useful: true,
        suggested_credits: 1.0,
      }),
      provider: "claude",
      model: "test",
    });
    const body = await (
      await POST(jsonReq({ feedback: "meaningful feedback text" }))
    ).json();
    // "1 credit." — no trailing s
    expect(body.message).toMatch(/1 credit\./);
    expect(body.message).not.toMatch(/1 credits\./);
  });

  it("returns the non-reward thank-you copy when creditsAwarded is 0", async () => {
    callAIMock.mockResolvedValue({
      text: aiJson({
        specificity: 1,
        actionability: 1,
        value: 1,
        summary: "no",
        is_useful: false,
        suggested_credits: 0,
      }),
      provider: "claude",
      model: "test",
    });
    const body = await (
      await POST(jsonReq({ feedback: "meaningful feedback text" }))
    ).json();
    expect(body.message).toBe(
      "Thank you for your feedback! We've recorded it for our team to review.",
    );
  });
});

// --- GET -------------------------------------------------------------------

describe("GET — auth + service guards", () => {
  it("returns 401 { error: 'Auth required' } for an anonymous caller", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Auth required" });
  });

  it("does not touch supabase on the anonymous branch (no cross-tenant leak surface)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });

  it("returns 503 { error: 'Service unavailable' } when supabase is unconfigured", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Service unavailable" });
  });
});

describe("GET — happy path", () => {
  it("returns { ok:true, feedback: rows } scoped to the current user, capped at 20 rows", async () => {
    const rows = [
      { id: "f1", feedback: "a", credits_awarded: 0.5 },
      { id: "f2", feedback: "b", credits_awarded: 0.25 },
    ];
    state.listData = rows;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, feedback: rows });
    expect(state.listSelects).toHaveLength(1);
    const call = state.listSelects[0]!;
    expect(call.cols).toBe(
      "id, feedback, category, ai_summary, credits_awarded, status, created_at",
    );
    expect(call.eqCol).toBe("user_id");
    expect(call.eqVal).toBe("u-1");
    expect(call.orderCol).toBe("created_at");
    expect(call.orderOpts).toEqual({ ascending: false });
    expect(call.limitN).toBe(20);
  });

  it("coerces a null data payload to [] so the UI never receives feedback:null", async () => {
    state.listData = null;
    const body = await (await GET()).json();
    expect(body).toEqual({ ok: true, feedback: [] });
  });
});

// Guard: keep console noise from the intentional insert-error branch in check.
describe("POST — logs the insert error to console.error (dev-visibility, not leaked)", () => {
  it("logs but does NOT include the raw supabase error in the 500 response body", async () => {
    state.insertError = { message: "sensitive-db-hint" };
    const res = await POST(jsonReq({ feedback: "meaningful feedback text" }));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("sensitive-db-hint");
    expect(errorSpy).toHaveBeenCalled();
  });
});
