// Colocated vitest for POST /api/cfo-advisor — P9-cfo-advisor-route-test.
//
// The route is a thin wrapper: auth gate → JSON parse → startupName guard →
// signal coercion (toNum + notes slice) → analyzeFinancials(signals, adkModel)
// → JSON. Silent regressions this suite pins against:
//   - Dropping the 401 gate and letting an anonymous request run an AI call
//     billed to the free-model pool with no per-user rate limit anchor.
//   - Dropping the JSON try/catch and 500-ing the widget on malformed body.
//   - Regressing the startupName trim() so a whitespace-only name triggers
//     an AI call instead of the 400 guard.
//   - Regressing toNum() so a numeric string like "12.5" no longer coerces
//     — the CFO would receive `undefined` instead of the founder-supplied
//     runway and render generic advice.
//   - Dropping the notes.slice(0, 2000) cap and letting a paste-bomb ride
//     into the analyst prompt (blows through the 700-token budget silently).
//   - Regressing the ADK adapter so callAI is invoked with the wrong shape
//     (system/user/maxTokens/timeoutMs) — this is the seam every ADK route
//     depends on and any drift breaks the whole agent chain.
//   - Regressing the timeoutMs to 60_000 or lower — CFO advisor chains two
//     LLM calls (analyst → advisor) and needs the full 90s ceiling.
//   - Regressing the 503 branch so an ok:false result surfaces as 200 with
//     empty analysis/recommendations (the widget would render blank).
//   - Dropping the try/catch and surfacing a raw stack to the widget on
//     analyzeFinancials rejection.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  callAI: vi.fn(),
  analyzeFinancials: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));
vi.mock("@/lib/ai-client", () => ({
  callAI: (opts: unknown) => mocks.callAI(opts),
}));
vi.mock("@/lib/adk/agents", () => ({
  analyzeFinancials: (signals: unknown, model: unknown) =>
    mocks.analyzeFinancials(signals, model),
}));

import { POST, dynamic } from "./route";

const USER = { id: "user-1", email: "founder@example.com" };

function req(body: unknown, opts: { raw?: string } = {}) {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
  };
  init.body = opts.raw !== undefined ? opts.raw : JSON.stringify(body);
  return new Request("http://x/api/cfo-advisor", init);
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

const OK_RESULT = {
  ok: true as const,
  analysis: "Health: strong. Metrics: MRR growing 15% MoM.",
  recommendations: "Extend runway to 18 months before next raise.",
};

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.analyzeFinancials.mockResolvedValue(OK_RESULT);
  mocks.callAI.mockResolvedValue({ text: "canned", provider: "free", model: "m" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("route module", () => {
  it("exports dynamic='force-dynamic' so the route never gets statically cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("POST /api/cfo-advisor — auth gate", () => {
  it("returns 401 when getCurrentUser resolves null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ startupName: "Acme" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  it("401 never invokes analyzeFinancials", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST(req({ startupName: "Acme" }));
    expect(mocks.analyzeFinancials).not.toHaveBeenCalled();
  });

  it("401 never invokes callAI", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST(req({ startupName: "Acme" }));
    expect(mocks.callAI).not.toHaveBeenCalled();
  });

  it("propagates a getCurrentUser rejection (upstream should map to 500)", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("auth exploded"));
    await expect(POST(req({ startupName: "Acme" }))).rejects.toThrow("auth exploded");
  });
});

describe("POST /api/cfo-advisor — JSON parse", () => {
  it("returns 400 'Invalid JSON body' when body is not JSON", async () => {
    const res = await POST(req(undefined, { raw: "not json {" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid JSON body");
  });

  it("400 on invalid JSON body never calls analyzeFinancials", async () => {
    await POST(req(undefined, { raw: "{" }));
    expect(mocks.analyzeFinancials).not.toHaveBeenCalled();
  });
});

describe("POST /api/cfo-advisor — startupName guard", () => {
  it("returns 400 when startupName is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Missing 'startupName'");
  });

  it("returns 400 when startupName is a non-string type (number)", async () => {
    const res = await POST(req({ startupName: 42 }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Missing 'startupName'");
  });

  it("returns 400 when startupName is a non-string type (null)", async () => {
    const res = await POST(req({ startupName: null }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Missing 'startupName'");
  });

  it("returns 400 when startupName is empty string", async () => {
    const res = await POST(req({ startupName: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when startupName is only whitespace (post-trim)", async () => {
    const res = await POST(req({ startupName: "   \t\n  " }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Missing 'startupName'");
  });

  it("whitespace-only startupName never calls analyzeFinancials", async () => {
    await POST(req({ startupName: "\n\n" }));
    expect(mocks.analyzeFinancials).not.toHaveBeenCalled();
  });
});

describe("POST /api/cfo-advisor — signal coercion", () => {
  it("trims startupName before forwarding into signals", async () => {
    await POST(req({ startupName: "  Acme Corp  " }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(signals.startupName).toBe("Acme Corp");
  });

  it("passes through stage when it is a string", async () => {
    await POST(req({ startupName: "Acme", stage: "seed" }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(signals.stage).toBe("seed");
  });

  it("drops stage to undefined when it is not a string", async () => {
    await POST(req({ startupName: "Acme", stage: 42 }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(signals.stage).toBeUndefined();
  });

  it("toNum: numeric field passes through as number", async () => {
    await POST(req({ startupName: "Acme", monthlyRevenueAud: 12345 }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(signals.monthlyRevenueAud).toBe(12345);
  });

  it("toNum: numeric-string field coerces (e.g. '12.5' → 12.5)", async () => {
    await POST(req({ startupName: "Acme", monthlyBurnAud: "12.5" }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(signals.monthlyBurnAud).toBe(12.5);
  });

  it("toNum: non-numeric string returns undefined", async () => {
    await POST(req({ startupName: "Acme", runwayMonths: "not-a-number" }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(signals.runwayMonths).toBeUndefined();
  });

  it("toNum: NaN input returns undefined (Number.isFinite guard)", async () => {
    await POST(req({ startupName: "Acme", cashAud: NaN }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(signals.cashAud).toBeUndefined();
  });

  it("toNum: Infinity returns undefined (Number.isFinite guard)", async () => {
    await POST(req({ startupName: "Acme", cashAud: "Infinity" }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(signals.cashAud).toBeUndefined();
  });

  it("toNum: boolean input returns undefined (not number-or-string)", async () => {
    await POST(req({ startupName: "Acme", monthlyRevenueAud: true }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(signals.monthlyRevenueAud).toBeUndefined();
  });

  it("passes notes through when it is a string within 2000 chars", async () => {
    await POST(req({ startupName: "Acme", notes: "3 founders, 12 pilot customers" }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(signals.notes).toBe("3 founders, 12 pilot customers");
  });

  it("caps notes at 2000 characters (paste-bomb guard)", async () => {
    const bomb = "x".repeat(5000);
    await POST(req({ startupName: "Acme", notes: bomb }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((signals.notes as string).length).toBe(2000);
  });

  it("drops notes to undefined when it is not a string", async () => {
    await POST(req({ startupName: "Acme", notes: 42 }));
    const signals = mocks.analyzeFinancials.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(signals.notes).toBeUndefined();
  });

  it("passes a function (the adkModel adapter) as the 2nd argument to analyzeFinancials", async () => {
    await POST(req({ startupName: "Acme" }));
    const modelArg = mocks.analyzeFinancials.mock.calls[0]?.[1];
    expect(typeof modelArg).toBe("function");
  });
});

describe("POST /api/cfo-advisor — happy path", () => {
  it("returns 200 with ok:true + analysis + recommendations from analyzeFinancials", async () => {
    const res = await POST(req({ startupName: "Acme" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      analysis: OK_RESULT.analysis,
      recommendations: OK_RESULT.recommendations,
    });
  });

  it("does NOT spread other fields from analyzeFinancials result (only analysis + recommendations)", async () => {
    mocks.analyzeFinancials.mockResolvedValue({
      ok: true,
      analysis: "a",
      recommendations: "r",
      extra: "should not leak",
    } as never);
    const res = await POST(req({ startupName: "Acme" }));
    const body = await json(res);
    expect(body).not.toHaveProperty("extra");
    expect(body).not.toHaveProperty("ok", false);
  });
});

describe("POST /api/cfo-advisor — advisor unavailable", () => {
  it("returns 503 when analyzeFinancials returns ok:false", async () => {
    mocks.analyzeFinancials.mockResolvedValue({
      ok: false,
      analysis: "",
      recommendations: "",
    });
    const res = await POST(req({ startupName: "Acme" }));
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Advisor unavailable — no AI provider responded");
  });

  it("503 response does not leak the empty analysis/recommendations", async () => {
    mocks.analyzeFinancials.mockResolvedValue({
      ok: false,
      analysis: "partial",
      recommendations: "partial",
    });
    const res = await POST(req({ startupName: "Acme" }));
    const body = await json(res);
    expect(body).not.toHaveProperty("analysis");
    expect(body).not.toHaveProperty("recommendations");
  });
});

describe("POST /api/cfo-advisor — thrown error", () => {
  it("returns 500 with the Error.message when analyzeFinancials rejects", async () => {
    mocks.analyzeFinancials.mockRejectedValue(new Error("agent timeout"));
    const res = await POST(req({ startupName: "Acme" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("agent timeout");
  });

  it("returns 500 with fallback 'CFO advisor failed' when reject value is not an Error", async () => {
    mocks.analyzeFinancials.mockRejectedValue("string reject");
    const res = await POST(req({ startupName: "Acme" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBe("CFO advisor failed");
  });
});

describe("POST /api/cfo-advisor — adkModel adapter (callAI seam)", () => {
  it("invoking the adapter fires callAI with the ADK four-arg contract + 90s timeout", async () => {
    let captured: ((system: string, user: string, maxTokens: number) => Promise<string>) | null =
      null;
    mocks.analyzeFinancials.mockImplementation(async (_signals, model) => {
      captured = model as typeof captured;
      await captured!("sys", "user", 700);
      return OK_RESULT;
    });
    await POST(req({ startupName: "Acme" }));
    expect(captured).not.toBeNull();
    expect(mocks.callAI).toHaveBeenCalledTimes(1);
    expect(mocks.callAI).toHaveBeenCalledWith({
      system: "sys",
      user: "user",
      maxTokens: 700,
      timeoutMs: 90_000,
    });
  });

  it("adapter resolves to the `text` field on the callAI result", async () => {
    mocks.callAI.mockResolvedValue({ text: "the-analysis", provider: "free", model: "m" });
    let out: string | null = null;
    mocks.analyzeFinancials.mockImplementation(async (_signals, model) => {
      const m = model as (s: string, u: string, mt: number) => Promise<string>;
      out = await m("s", "u", 100);
      return OK_RESULT;
    });
    await POST(req({ startupName: "Acme" }));
    expect(out).toBe("the-analysis");
  });
});
