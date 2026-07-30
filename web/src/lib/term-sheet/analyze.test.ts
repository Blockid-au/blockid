import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Term Sheet AI — analyzeTermSheet() branch tests.
//
// This file was previously untested; the sibling `demo.ts`, `schema.ts`, and
// `au-market-data.ts` had colocated tests but the actual analyze pipeline
// (Anthropic parse call, prompt-cache breakpoint, dilution passthrough,
// degrade-to-demo error ladder) was not covered.
//
// The tests below pin (a) the credential-gate + demo fallback contract,
// (b) the exact system-block shape the prompt cache depends on
// (2 blocks, only the AU reference block cached with 1h TTL), (c) the
// dilution passthrough branch matrix, and (d) every error path in the
// try/catch ladder so a silent widening of the parse contract or a rename
// of an Anthropic error class can never let the /tools/term-sheet UI 500.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "APIError";
    }
  }
  class MockRateLimitError extends MockAPIError {
    constructor(message = "rate limit exceeded") {
      super(429, message);
      this.name = "RateLimitError";
    }
  }
  const AnthropicMock = function AnthropicMockCtor() {} as unknown as {
    APIError: typeof MockAPIError;
    RateLimitError: typeof MockRateLimitError;
  };
  AnthropicMock.APIError = MockAPIError;
  AnthropicMock.RateLimitError = MockRateLimitError;
  return { AnthropicMock, MockAPIError, MockRateLimitError };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: mocks.AnthropicMock,
}));

vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({
  zodOutputFormat: (schema: unknown) => ({ __zodOutputFormat: true, schema }),
}));

const parseMock = vi.fn();
const isConfiguredMock = vi.fn();
const getClientMock = vi.fn(() => ({
  messages: { parse: (opts: unknown) => parseMock(opts) },
}));

vi.mock("@/lib/ai-client", () => ({
  isAnthropicConfigured: () => isConfiguredMock(),
  getAnthropicClient: () => getClientMock(),
}));

import { analyzeTermSheet } from "./analyze";
import { DEMO_ANALYSIS } from "./demo";
import { AU_MARKET_REFERENCE } from "./au-market-data";
import type { Holder, Round } from "@/lib/cap-table";

// ── Helpers ────────────────────────────────────────────────────────────

function makeAnalysis(over: Partial<typeof DEMO_ANALYSIS> = {}) {
  return { ...DEMO_ANALYSIS, ...over };
}

function makeUsage(over: Partial<Record<string, number>> = {}) {
  return {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 800,
    cache_creation_input_tokens: 0,
    ...over,
  };
}

function makeParseResponse(over: Partial<Record<string, unknown>> = {}) {
  return {
    usage: makeUsage(),
    parsed_output: makeAnalysis(),
    ...over,
  };
}

const capTable: Holder[] = [
  { id: "f1", name: "Founder A", shares: 5_000_000, shareClass: "common", isFounder: true },
  { id: "f2", name: "Founder B", shares: 5_000_000, shareClass: "common", isFounder: true },
];

const round: Round = {
  preMoneyAud: 10_000_000,
  raiseAud: 2_500_000,
  esopTopUpPct: 12,
  esopTimingPreMoney: true,
  leadInvestorName: "Test Lead",
};

beforeEach(() => {
  parseMock.mockReset();
  isConfiguredMock.mockReset();
  getClientMock.mockClear();
});

// ── Demo fallback (no credentials) ─────────────────────────────────────

describe("analyzeTermSheet — credential gate", () => {
  it("returns DEMO_ANALYSIS with mode='demo' when Anthropic is not configured", async () => {
    isConfiguredMock.mockReturnValue(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await analyzeTermSheet({ termSheet: "any" });

    expect(result.analysis).toBe(DEMO_ANALYSIS);
    expect(result.mode).toBe("demo");
    expect(result.usage).toBeUndefined();
    expect(parseMock).not.toHaveBeenCalled();
    expect(getClientMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("No Anthropic credentials"));

    warn.mockRestore();
  });

  it("still computes dilution passthrough on the demo path when cap table + round are supplied", async () => {
    isConfiguredMock.mockReturnValue(false);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await analyzeTermSheet({ termSheet: "any", capTable, round });

    expect(result.mode).toBe("demo");
    expect(result.dilution).not.toBeNull();
    expect(result.dilution?.pricing.preMoneyAud).toBe(10_000_000);
    expect(result.dilution?.pricing.postMoneyAud).toBe(12_500_000);
  });
});

// ── maybeDilution branch matrix (via public analyzeTermSheet contract) ──

describe("analyzeTermSheet — dilution passthrough", () => {
  beforeEach(() => {
    isConfiguredMock.mockReturnValue(false);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("dilution === null when capTable is missing", async () => {
    const r = await analyzeTermSheet({ termSheet: "t", round });
    expect(r.dilution).toBeNull();
  });

  it("dilution === null when round is missing", async () => {
    const r = await analyzeTermSheet({ termSheet: "t", capTable });
    expect(r.dilution).toBeNull();
  });

  it("dilution === null when capTable is explicitly null", async () => {
    const r = await analyzeTermSheet({ termSheet: "t", capTable: null, round });
    expect(r.dilution).toBeNull();
  });

  it("dilution === null when round is explicitly null", async () => {
    const r = await analyzeTermSheet({ termSheet: "t", capTable, round: null });
    expect(r.dilution).toBeNull();
  });

  it("dilution === null when capTable is empty", async () => {
    const r = await analyzeTermSheet({ termSheet: "t", capTable: [], round });
    expect(r.dilution).toBeNull();
  });

  it("dilution === null when capTable is not an array (TS-erased runtime guard)", async () => {
    // The `Array.isArray` guard in maybeDilution defends the runtime from a
    // caller who's silently bypassed TS (e.g. route decoded a stringified
    // "null" as the empty string). We pin the runtime contract here.
    const r = await analyzeTermSheet({
      termSheet: "t",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capTable: "oops" as any,
      round,
    });
    expect(r.dilution).toBeNull();
  });

  it("dilution round-trips computeDiff() output when both inputs are supplied", async () => {
    const r = await analyzeTermSheet({ termSheet: "t", capTable, round });
    expect(r.dilution).not.toBeNull();
    expect(r.dilution?.before.totalShares).toBe(10_000_000);
    // 2 founders + esop-topup row (synthesized because no existing pool) + new investor
    expect(r.dilution?.rows.length).toBeGreaterThanOrEqual(3);
    const investor = r.dilution?.rows.find((row) => row.isNewInvestor);
    expect(investor?.name).toBe("Test Lead");
  });
});

// ── Live-mode wiring (system blocks / model config / cache breakpoint) ──

describe("analyzeTermSheet — live-mode Anthropic invocation", () => {
  beforeEach(() => {
    isConfiguredMock.mockReturnValue(true);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("invokes client.messages.parse exactly once with the pinned model + max_tokens + adaptive thinking + medium effort", async () => {
    parseMock.mockResolvedValue(makeParseResponse());

    await analyzeTermSheet({ termSheet: "hello" });

    expect(parseMock).toHaveBeenCalledTimes(1);
    const call = parseMock.mock.calls[0][0] as {
      model: string;
      max_tokens: number;
      thinking: { type: string };
      output_config: { effort: string; format: unknown };
    };
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.max_tokens).toBe(8192);
    expect(call.thinking).toEqual({ type: "adaptive" });
    expect(call.output_config.effort).toBe("medium");
    expect(call.output_config.format).toMatchObject({ __zodOutputFormat: true });
  });

  it("emits system as exactly two text blocks with cache_control only on the AU reference block", async () => {
    parseMock.mockResolvedValue(makeParseResponse());

    await analyzeTermSheet({ termSheet: "hello" });

    const call = parseMock.mock.calls[0][0] as {
      system: Array<{ type: string; text: string; cache_control?: unknown }>;
    };
    expect(call.system).toHaveLength(2);
    expect(call.system[0].type).toBe("text");
    expect(call.system[0].cache_control).toBeUndefined();
    expect(call.system[0].text).toContain("senior Australian startup lawyer");
    expect(call.system[1].type).toBe("text");
    expect(call.system[1].text).toContain(AU_MARKET_REFERENCE);
    expect(call.system[1].text.startsWith("# Australian Private Capital Market")).toBe(true);
    expect(call.system[1].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("wraps the pasted term sheet between BEGIN / END markers in the user message", async () => {
    parseMock.mockResolvedValue(makeParseResponse());

    await analyzeTermSheet({ termSheet: "MYSHEET-BODY" });

    const call = parseMock.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].role).toBe("user");
    expect(call.messages[0].content).toContain("--- TERM SHEET BEGIN ---");
    expect(call.messages[0].content).toContain("MYSHEET-BODY");
    expect(call.messages[0].content).toContain("--- TERM SHEET END ---");
  });

  it("omits the dilution-context clause when no cap table is provided", async () => {
    parseMock.mockResolvedValue(makeParseResponse());

    await analyzeTermSheet({ termSheet: "hello" });

    const call = parseMock.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(call.messages[0].content).not.toContain("Cap table provided");
  });

  it("appends the dilution-context clause when cap table + round are supplied", async () => {
    parseMock.mockResolvedValue(makeParseResponse());

    const r = await analyzeTermSheet({ termSheet: "hello", capTable, round });

    const call = parseMock.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(call.messages[0].content).toContain("Cap table provided");
    expect(call.messages[0].content).toContain("dilution simulation is being computed locally");
    expect(r.dilution).not.toBeNull();
  });

  it("returns the SDK's parsed_output verbatim with mode='live'", async () => {
    const parsed = makeAnalysis({ instrumentType: "Series Seed" });
    parseMock.mockResolvedValue(makeParseResponse({ parsed_output: parsed }));

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.mode).toBe("live");
    expect(r.analysis).toBe(parsed);
    expect(r.analysis.instrumentType).toBe("Series Seed");
  });

  it("passes usage stats through to the caller on the happy path", async () => {
    parseMock.mockResolvedValue(
      makeParseResponse({
        usage: {
          input_tokens: 250,
          output_tokens: 1_400,
          cache_read_input_tokens: 12_000,
          cache_creation_input_tokens: 3_000,
        },
      }),
    );

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.usage).toEqual({
      input_tokens: 250,
      output_tokens: 1_400,
      cache_read_input_tokens: 12_000,
      cache_creation_input_tokens: 3_000,
    });
  });

  it("defaults missing usage counters to 0 (SDK may omit any of the four fields)", async () => {
    parseMock.mockResolvedValue({
      usage: {}, // deliberately empty — every ?? 0 branch fires
      parsed_output: makeAnalysis(),
    });

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.usage).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
  });

  it("emits a grep-friendly [blockid:termsheet] cache line so operators can verify the cache hit rate", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    parseMock.mockResolvedValue(
      makeParseResponse({
        usage: {
          input_tokens: 111,
          output_tokens: 222,
          cache_read_input_tokens: 333,
          cache_creation_input_tokens: 444,
        },
      }),
    );

    await analyzeTermSheet({ termSheet: "hello" });

    expect(log).toHaveBeenCalledWith(
      "[blockid:termsheet] cache_read=333 cache_create=444 input=111 output=222",
    );
    log.mockRestore();
  });
});

// ── Live-mode degrade-to-demo error ladder ──────────────────────────────

describe("analyzeTermSheet — degrade-to-demo error ladder", () => {
  beforeEach(() => {
    isConfiguredMock.mockReturnValue(true);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("degrades to demo when parse() returns a response without parsed_output", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockResolvedValue(makeParseResponse({ parsed_output: null }));

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.mode).toBe("demo");
    expect(r.analysis).toBe(DEMO_ANALYSIS);
    // usage still stamped even on the empty-parsed-output degrade path
    expect(r.usage).toBeDefined();
    expect(err).toHaveBeenCalledWith(expect.stringContaining("parse() returned no parsed_output"));
    err.mockRestore();
  });

  it("degrades to demo on Anthropic.RateLimitError with a rate-limit log line", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValue(new mocks.MockRateLimitError("slow down"));

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.mode).toBe("demo");
    expect(r.analysis).toBe(DEMO_ANALYSIS);
    expect(r.usage).toBeUndefined();
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("Anthropic rate limit"),
      "slow down",
    );
    err.mockRestore();
  });

  it("degrades to demo on a generic Anthropic.APIError with the HTTP status stamped in the log", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValue(new mocks.MockAPIError(503, "upstream down"));

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.mode).toBe("demo");
    expect(r.analysis).toBe(DEMO_ANALYSIS);
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("Anthropic API error 503"),
      "upstream down",
    );
    err.mockRestore();
  });

  it("degrades to demo on any non-Anthropic thrown value (network error / oom / etc.)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValue(new Error("ETIMEDOUT"));

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.mode).toBe("demo");
    expect(r.analysis).toBe(DEMO_ANALYSIS);
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("Unexpected error in analyze"),
      expect.any(Error),
    );
    err.mockRestore();
  });

  it("preserves dilution passthrough across every error branch (RateLimitError)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValue(new mocks.MockRateLimitError("slow"));

    const r = await analyzeTermSheet({ termSheet: "hello", capTable, round });

    expect(r.mode).toBe("demo");
    expect(r.dilution).not.toBeNull();
    expect(r.dilution?.pricing.postMoneyAud).toBe(12_500_000);
  });

  it("preserves dilution passthrough across every error branch (APIError)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValue(new mocks.MockAPIError(500, "boom"));

    const r = await analyzeTermSheet({ termSheet: "hello", capTable, round });

    expect(r.mode).toBe("demo");
    expect(r.dilution).not.toBeNull();
  });

  it("preserves dilution passthrough across every error branch (generic Error)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValue(new TypeError("weird"));

    const r = await analyzeTermSheet({ termSheet: "hello", capTable, round });

    expect(r.mode).toBe("demo");
    expect(r.dilution).not.toBeNull();
  });

  it("preserves dilution passthrough on the empty-parsed-output degrade path", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockResolvedValue(makeParseResponse({ parsed_output: null }));

    const r = await analyzeTermSheet({ termSheet: "hello", capTable, round });

    expect(r.mode).toBe("demo");
    expect(r.dilution).not.toBeNull();
    expect(r.usage).toBeDefined();
  });
});
