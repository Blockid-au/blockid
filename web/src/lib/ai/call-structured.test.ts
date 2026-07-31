import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Capture every ai_runs insert so tests can assert audit-log rows.
type InsertedRow = Record<string, unknown>;
let inserted: InsertedRow[] = [];
let insertCounter = 0;

function fakeSupabase() {
  return {
    from(table: string) {
      if (table !== "ai_runs") throw new Error("unexpected table " + table);
      let payload: InsertedRow = {};
      const api = {
        insert(row: InsertedRow) {
          payload = row;
          return api;
        },
        select(_cols: string) {
          return api;
        },
        async single() {
          insertCounter += 1;
          const id = `run-${insertCounter}`;
          inserted.push({ id, ...payload });
          return { data: { id }, error: null };
        },
      };
      return api;
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => fakeSupabase(),
}));

// Import AFTER vi.mock so the module picks up the mock.
import { callStructured } from "./call-structured";

const InputSchema = z.object({ q: z.string().min(1) });
const OutputSchema = z.object({ answer: z.string().min(1), score: z.number().min(0).max(100) });

function anthropicResponse(text: string, tokensIn = 100, tokensOut = 50) {
  return {
    ok: true,
    status: 200,
    async text() {
      return "";
    },
    async json() {
      return {
        content: [{ type: "text", text }],
        usage: { input_tokens: tokensIn, output_tokens: tokensOut },
      };
    },
  } as unknown as Response;
}

function errorResponse(status: number, body = "") {
  return {
    ok: false,
    status,
    async text() {
      return body;
    },
    async json() {
      return {};
    },
  } as unknown as Response;
}

beforeEach(() => {
  inserted = [];
  insertCounter = 0;
});

const baseArgs = {
  promptVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  agent: "AIR-004",
  model: "claude-sonnet-5",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  input: { q: "hello" },
  systemPrompt: "You are a JSON-emitting assistant.",
  renderUser: (i: { q: string }) => `Question: ${i.q}`,
  purpose: "customer_report",
  apiKey: "test-key",
} as const;

describe("callStructured — happy path", () => {
  it("parses a valid response, writes an ok ai_runs row, returns data", async () => {
    const fetchImpl = vi.fn(async () =>
      anthropicResponse(JSON.stringify({ answer: "42", score: 72 }), 120, 40),
    );

    const res = await callStructured({
      ...baseArgs,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.data).toEqual({ answer: "42", score: 72 });
    expect(res.runId).toBe("run-1");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.status).toBe("ok");
    expect(inserted[0]!.tokens_in).toBe(120);
    expect(inserted[0]!.tokens_out).toBe(40);
    expect(inserted[0]!.purpose).toBe("customer_report");
    expect(inserted[0]!.output_hash).toBeTruthy();
    // cost = 120 * 3 / 1M + 40 * 15 / 1M = 0.00036 + 0.0006 = 0.00096
    expect(inserted[0]!.cost_usd).toBeCloseTo(0.00096, 6);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("strips ```json fences before parsing", async () => {
    const fetchImpl = vi.fn(async () =>
      anthropicResponse('```json\n{"answer":"ok","score":50}\n```'),
    );
    const res = await callStructured({
      ...baseArgs,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.ok).toBe(true);
  });
});

describe("callStructured — repair pass", () => {
  it("recovers when first attempt fails schema, second succeeds", async () => {
    const fetchImpl = vi
      .fn()
      // first: missing `score`
      .mockResolvedValueOnce(anthropicResponse('{"answer":"hi"}', 100, 20))
      // second (repair): valid
      .mockResolvedValueOnce(anthropicResponse('{"answer":"hi","score":80}', 30, 10));

    const res = await callStructured({
      ...baseArgs,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.data).toEqual({ answer: "hi", score: 80 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.status).toBe("ok");
    // Tokens summed across both attempts.
    expect(inserted[0]!.tokens_in).toBe(130);
    expect(inserted[0]!.tokens_out).toBe(30);

    // The repair prompt must include the previous assistant turn + the
    // error hint so the model can self-correct.
    const secondCallBody = JSON.parse(
      (fetchImpl.mock.calls[1]![1] as { body: string }).body,
    );
    expect(secondCallBody.messages).toHaveLength(3);
    expect(secondCallBody.messages[1].role).toBe("assistant");
    expect(secondCallBody.messages[2].role).toBe("user");
    expect(secondCallBody.messages[2].content).toMatch(/schema validation/i);
  });
});

describe("callStructured — schema fail twice", () => {
  it("returns ok:false with runId + writes schema_fail row", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(anthropicResponse('{"answer":"a"}'))
      .mockResolvedValueOnce(anthropicResponse('{"still":"bad"}'));

    const res = await callStructured({
      ...baseArgs,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.runId).toBe("run-1");
    expect(res.reason).toMatch(/schema_fail/);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.status).toBe("schema_fail");
    expect(inserted[0]!.output_hash).toBeNull();
  });
});

describe("callStructured — model error", () => {
  it("writes model_error row and returns runId when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });

    const res = await callStructured({
      ...baseArgs,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.runId).toBe("run-1");
    expect(res.reason).toMatch(/ECONNRESET/);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.status).toBe("model_error");
    expect(inserted[0]!.tokens_in).toBe(0);
    expect(inserted[0]!.tokens_out).toBe(0);
  });

  it("writes model_error row for a non-429 HTTP failure", async () => {
    const fetchImpl = vi.fn(async () => errorResponse(500, "internal server error"));

    const res = await callStructured({
      ...baseArgs,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(res.ok).toBe(false);
    expect(inserted[0]!.status).toBe("model_error");
  });

  it("writes rate_limited row for a 429", async () => {
    const fetchImpl = vi.fn(async () => errorResponse(429, ""));

    const res = await callStructured({
      ...baseArgs,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(res.ok).toBe(false);
    expect(inserted[0]!.status).toBe("rate_limited");
  });
});

describe("callStructured — input validation", () => {
  it("throws when the input fails inputSchema (programmer error)", async () => {
    const fetchImpl = vi.fn();
    await expect(
      callStructured({
        ...baseArgs,
        input: { q: "" } as unknown as { q: string },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/inputSchema rejected/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });
});
