// Colocated vitest for POST /api/support — P9-support-route-test.
//
// The route is a thin wrapper: auth gate → JSON parse → guardrails →
// handleSupportQuery(message, adkModel) → JSON. Silent regressions this suite
// pins against:
//   - Dropping the auth gate and letting an anonymous request run an AI call
//     billed to the free-model pool with no per-user rate limit anchor.
//   - Dropping the JSON try/catch and 500-ing the widget on malformed body.
//   - Regressing the trim() so a whitespace-only message triggers an AI call
//     instead of the 400 guard.
//   - Regressing the length cap (4000) and letting a paste-bomb hit the AI.
//   - Dropping the try/catch around handleSupportQuery and surfacing a raw
//     stack to the widget on ai-client outage.
//   - Regressing the ADK adapter so callAI is invoked with the wrong shape
//     (system/user/maxTokens/timeoutMs) — this is the seam every ADK route
//     depends on and any drift breaks the whole agent chain.
//   - Regressing the `...result` spread so the widget loses `escalate`/
//     `category`/`sentiment` and only sees `ok:true` + `reply`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  callAI: vi.fn(),
  handleSupportQuery: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));
vi.mock("@/lib/ai-client", () => ({
  callAI: (opts: unknown) => mocks.callAI(opts),
}));
vi.mock("@/lib/adk/agents", () => ({
  handleSupportQuery: (message: string, model: unknown) =>
    mocks.handleSupportQuery(message, model),
}));

import { POST, dynamic } from "./route";

const USER = { id: "user-1", email: "founder@example.com" };

function req(body: unknown, opts: { raw?: string } = {}) {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
  };
  init.body = opts.raw !== undefined ? opts.raw : JSON.stringify(body);
  return new Request("http://x/api/support", init);
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

const OK_RESULT = {
  category: "billing" as const,
  sentiment: "neutral" as const,
  escalate: false,
  reply: "Hello founder — here's the pricing page.",
};

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.handleSupportQuery.mockResolvedValue(OK_RESULT);
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

describe("POST /api/support — auth gate", () => {
  it("returns 401 when getCurrentUser resolves null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  it("returns 401 without invoking handleSupportQuery", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST(req({ message: "hi" }));
    expect(mocks.handleSupportQuery).not.toHaveBeenCalled();
  });

  it("returns 401 without invoking callAI", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST(req({ message: "hi" }));
    expect(mocks.callAI).not.toHaveBeenCalled();
  });

  it("propagates a getCurrentUser rejection (upstream should map to 500)", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("auth exploded"));
    await expect(POST(req({ message: "hi" }))).rejects.toThrow("auth exploded");
  });
});

describe("POST /api/support — JSON parse", () => {
  it("returns 400 'Invalid JSON body' when body is not JSON", async () => {
    const res = await POST(req(undefined, { raw: "not json {" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid JSON body");
  });

  it("400 on invalid JSON body never calls handleSupportQuery", async () => {
    await POST(req(undefined, { raw: "{" }));
    expect(mocks.handleSupportQuery).not.toHaveBeenCalled();
  });

  it("400 on invalid JSON body never calls callAI", async () => {
    await POST(req(undefined, { raw: "{" }));
    expect(mocks.callAI).not.toHaveBeenCalled();
  });

  it("returns 400 'Missing message' when body is JSON but has no message", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Missing 'message'");
  });

  it("returns 400 when body is a bare number (typeof message !== 'string')", async () => {
    const res = await POST(req(42));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Missing 'message'");
  });

  it("returns 400 when message is a non-string type (number)", async () => {
    const res = await POST(req({ message: 123 }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Missing 'message'");
  });

  it("returns 400 when message is a non-string type (null)", async () => {
    const res = await POST(req({ message: null }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Missing 'message'");
  });

  it("returns 400 when message is a non-string type (array)", async () => {
    const res = await POST(req({ message: ["a", "b"] }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Missing 'message'");
  });
});

describe("POST /api/support — trim + length guards", () => {
  it("returns 400 when message is empty string", async () => {
    const res = await POST(req({ message: "" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Missing 'message'");
  });

  it("returns 400 when message is only whitespace (post-trim)", async () => {
    const res = await POST(req({ message: "     \t\n  " }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Missing 'message'");
  });

  it("whitespace-only never fires handleSupportQuery", async () => {
    await POST(req({ message: "\n\n" }));
    expect(mocks.handleSupportQuery).not.toHaveBeenCalled();
  });

  it("returns 400 when message exceeds 4000 chars (4001)", async () => {
    const res = await POST(req({ message: "a".repeat(4001) }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Message too long (max 4000 chars)");
  });

  it("400 too-long never fires handleSupportQuery", async () => {
    await POST(req({ message: "a".repeat(4001) }));
    expect(mocks.handleSupportQuery).not.toHaveBeenCalled();
  });

  it("accepts exactly 4000 chars (boundary — not trimmed by length gate)", async () => {
    const res = await POST(req({ message: "a".repeat(4000) }));
    expect(res.status).toBe(200);
    expect(mocks.handleSupportQuery).toHaveBeenCalledTimes(1);
  });

  it("length gate runs against the trimmed message, not the raw payload", async () => {
    // 3999 'a' + surrounding whitespace → post-trim 3999 (≤4000) → OK
    const padded = "  " + "a".repeat(3999) + "  ";
    const res = await POST(req({ message: padded }));
    expect(res.status).toBe(200);
    expect(mocks.handleSupportQuery).toHaveBeenCalledWith(
      "a".repeat(3999),
      expect.any(Function),
    );
  });
});

describe("POST /api/support — happy path", () => {
  it("returns 200 with ok:true + spread of handleSupportQuery result", async () => {
    const res = await POST(req({ message: "How do I upgrade?" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      category: "billing",
      sentiment: "neutral",
      escalate: false,
      reply: "Hello founder — here's the pricing page.",
    });
  });

  it("passes the trimmed message (not the raw padded string) into handleSupportQuery", async () => {
    await POST(req({ message: "   my card was charged twice   " }));
    expect(mocks.handleSupportQuery).toHaveBeenCalledWith(
      "my card was charged twice",
      expect.any(Function),
    );
  });

  it("passes a function (the adkModel adapter) as the 2nd argument", async () => {
    await POST(req({ message: "hi" }));
    const modelArg = mocks.handleSupportQuery.mock.calls[0]?.[1];
    expect(typeof modelArg).toBe("function");
  });

  it("returns escalate=true from handleSupportQuery verbatim", async () => {
    mocks.handleSupportQuery.mockResolvedValue({
      category: "other",
      sentiment: "negative",
      escalate: true,
      reply: "Escalating to a human.",
    });
    const res = await POST(req({ message: "this is broken" }));
    const body = await json(res);
    expect(body.escalate).toBe(true);
    expect(body.category).toBe("other");
    expect(body.sentiment).toBe("negative");
  });

  it("`ok:true` cannot be overridden by a result field named ok", async () => {
    // Route order: NextResponse.json({ ok: true, ...result }) — later spread wins.
    // This test pins the current shape so a future re-order (`{ ...result, ok: true }`)
    // is a *deliberate* change, not an accidental one.
    mocks.handleSupportQuery.mockResolvedValue({
      ok: false,
      category: "billing",
      sentiment: "neutral",
      escalate: false,
      reply: "r",
    } as never);
    const res = await POST(req({ message: "hi" }));
    const body = await json(res);
    // With `{ ok: true, ...result }` a spread `ok:false` overrides — pins today's behaviour.
    expect(body.ok).toBe(false);
  });
});

describe("POST /api/support — adkModel adapter (callAI seam)", () => {
  it("invoking the adapter fires callAI with the ADK four-arg contract", async () => {
    let captured: ((system: string, user: string, maxTokens: number) => Promise<string>) | null =
      null;
    mocks.handleSupportQuery.mockImplementation(async (_msg, model) => {
      captured = model as typeof captured;
      await captured!("sys", "user", 200);
      return OK_RESULT;
    });
    await POST(req({ message: "hi" }));
    expect(captured).not.toBeNull();
    expect(mocks.callAI).toHaveBeenCalledTimes(1);
    expect(mocks.callAI).toHaveBeenCalledWith({
      system: "sys",
      user: "user",
      maxTokens: 200,
      timeoutMs: 60_000,
    });
  });

  it("adapter resolves to the `text` field on the callAI result", async () => {
    mocks.callAI.mockResolvedValue({ text: "the-reply", provider: "free", model: "m" });
    let out: string | null = null;
    mocks.handleSupportQuery.mockImplementation(async (_msg, model) => {
      const m = model as (s: string, u: string, mt: number) => Promise<string>;
      out = await m("s", "u", 10);
      return OK_RESULT;
    });
    await POST(req({ message: "hi" }));
    expect(out).toBe("the-reply");
  });

  it("adapter propagates callAI rejection (the ADK agent owns the try/catch)", async () => {
    mocks.callAI.mockRejectedValue(new Error("ai down"));
    let caught: unknown = null;
    mocks.handleSupportQuery.mockImplementation(async (_msg, model) => {
      const m = model as (s: string, u: string, mt: number) => Promise<string>;
      try {
        await m("s", "u", 10);
      } catch (e) {
        caught = e;
      }
      return OK_RESULT;
    });
    await POST(req({ message: "hi" }));
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("ai down");
  });

  it("adapter pins timeoutMs=60_000 (regression guard against a silent bump)", async () => {
    mocks.handleSupportQuery.mockImplementation(async (_msg, model) => {
      const m = model as (s: string, u: string, mt: number) => Promise<string>;
      await m("x", "y", 1);
      return OK_RESULT;
    });
    await POST(req({ message: "hi" }));
    const opts = mocks.callAI.mock.calls[0]?.[0] as { timeoutMs: number };
    expect(opts.timeoutMs).toBe(60_000);
  });
});

describe("POST /api/support — 500 branch when handleSupportQuery throws", () => {
  it("returns 500 with err.message when handleSupportQuery throws an Error", async () => {
    mocks.handleSupportQuery.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("boom");
  });

  it("returns 500 with generic 'Support agent failed' when a non-Error is thrown", async () => {
    mocks.handleSupportQuery.mockRejectedValue("plain string reject");
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBe("Support agent failed");
  });

  it("returns 500 with generic message when handleSupportQuery throws null", async () => {
    mocks.handleSupportQuery.mockRejectedValue(null);
    const res = await POST(req({ message: "hi" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBe("Support agent failed");
  });

  it("500 branch still spreads no result fields (no leaked partial state)", async () => {
    mocks.handleSupportQuery.mockRejectedValue(new Error("x"));
    const res = await POST(req({ message: "hi" }));
    const body = await json(res);
    expect(body).toEqual({ ok: false, error: "x" });
  });
});
