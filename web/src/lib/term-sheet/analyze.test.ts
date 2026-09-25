import { describe, it, expect, vi, beforeEach } from "vitest";

// Pin the customer provider boundary, schema validation, deterministic
// dilution passthrough, token usage and explicitly labelled demo fallback.

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
  return { MockAPIError, MockRateLimitError };
});

const parseMock = vi.fn();
const isConfiguredMock = vi.fn();
vi.mock("@/lib/ai-client", () => ({
  isAIConfigured: () => isConfiguredMock(),
  callAI: (opts: unknown) => parseMock(opts),
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
    ...over,
    text: JSON.stringify("parsed_output" in over ? over.parsed_output : makeAnalysis()),
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
});

// ── Demo fallback (no credentials) ─────────────────────────────────────

describe("analyzeTermSheet — credential gate", () => {
  it("returns DEMO_ANALYSIS with mode='demo' when no AI is configured", async () => {
    isConfiguredMock.mockReturnValue(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await analyzeTermSheet({ termSheet: "any" });

    expect(result.analysis).toBe(DEMO_ANALYSIS);
    expect(result.mode).toBe("demo");
    expect(result.usage).toBeUndefined();
    expect(parseMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("No AI credentials"));

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

// ── Live-mode dispatcher and schema contract ──

describe("analyzeTermSheet — live-mode dispatcher invocation", () => {
  beforeEach(() => {
    isConfiguredMock.mockReturnValue(true);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("invokes the restricted dispatcher once with the existing output budget", async () => {
    parseMock.mockResolvedValue(makeParseResponse());
    await analyzeTermSheet({ termSheet: "hello", userId: "user-ledger-1" });
    expect(parseMock).toHaveBeenCalledTimes(1);
    expect(parseMock.mock.calls[0][0]).toMatchObject({ providerPolicy: "deepinfra-only", agentId: "clo-term-sheet", userId: "user-ledger-1", taskClass: "report", maxTokens: 8192 });
    expect(parseMock.mock.calls[0][0]).not.toHaveProperty("model");
  });

  it("preserves the AU reference and supplies the complete output schema without assuming cache discounts", async () => {
    parseMock.mockResolvedValue(makeParseResponse());
    await analyzeTermSheet({ termSheet: "hello" });
    const call = parseMock.mock.calls[0][0];
    expect(call.system).toContain("senior Australian startup lawyer");
    expect(call.system).toContain(AU_MARKET_REFERENCE);
    const schema = JSON.parse(call.system.split("Required JSON schema:\n")[1]);
    expect(schema.properties).toHaveProperty("keyTerms");
    expect(schema.properties).toHaveProperty("redline");
    expect(call).not.toHaveProperty("cache_control");
  });

  it("wraps the pasted term sheet between BEGIN / END markers in the user message", async () => {
    parseMock.mockResolvedValue(makeParseResponse());

    await analyzeTermSheet({ termSheet: "MYSHEET-BODY" });

    const call = parseMock.mock.calls[0][0] as {
      user: string;
    };
    expect(call.user).toContain("--- TERM SHEET BEGIN ---");
    expect(call.user).toContain("MYSHEET-BODY");
    expect(call.user).toContain("--- TERM SHEET END ---");
  });

  it("omits the dilution-context clause when no cap table is provided", async () => {
    parseMock.mockResolvedValue(makeParseResponse());

    await analyzeTermSheet({ termSheet: "hello" });

    const call = parseMock.mock.calls[0][0] as {
      user: string;
    };
    expect(call.user).not.toContain("Cap table provided");
  });

  it("appends the dilution-context clause when cap table + round are supplied", async () => {
    parseMock.mockResolvedValue(makeParseResponse());

    const r = await analyzeTermSheet({ termSheet: "hello", capTable, round });

    const call = parseMock.mock.calls[0][0] as {
      user: string;
    };
    expect(call.user).toContain("Cap table provided");
    expect(call.user).toContain("dilution simulation is being computed locally");
    expect(r.dilution).not.toBeNull();
  });

  it("returns validated model JSON with mode='live'", async () => {
    const parsed = makeAnalysis({ instrumentType: "Series Seed" });
    parseMock.mockResolvedValue(makeParseResponse({ parsed_output: parsed }));

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.mode).toBe("live");
    expect(r.analysis).toEqual(parsed);
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
      text: JSON.stringify(makeAnalysis()),
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

  it("degrades to demo when the dispatcher returns JSON null", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockResolvedValue(makeParseResponse({ parsed_output: null }));

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.mode).toBe("demo");
    expect(r.analysis).toBe(DEMO_ANALYSIS);
    // usage still stamped even on the empty-parsed-output degrade path
    expect(r.usage).toBeDefined();
    expect(err).toHaveBeenCalledWith(expect.stringContaining("response failed output schema"));
    err.mockRestore();
  });

  it("degrades to demo on a provider rate-limit error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValue(new mocks.MockRateLimitError("slow down"));

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.mode).toBe("demo");
    expect(r.analysis).toBe(DEMO_ANALYSIS);
    expect(r.usage).toBeUndefined();
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("provider error"),
      expect.objectContaining({ message: "slow down" }),
    );
    err.mockRestore();
  });

  it("degrades to demo on a provider API error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValue(new mocks.MockAPIError(503, "upstream down"));

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.mode).toBe("demo");
    expect(r.analysis).toBe(DEMO_ANALYSIS);
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("provider error"),
      expect.objectContaining({ message: "upstream down" }),
    );
    err.mockRestore();
  });

  it("degrades to demo on any other thrown error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    parseMock.mockRejectedValue(new Error("ETIMEDOUT"));

    const r = await analyzeTermSheet({ termSheet: "hello" });

    expect(r.mode).toBe("demo");
    expect(r.analysis).toBe(DEMO_ANALYSIS);
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("provider error"),
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


describe("term-sheet schema boundary", () => {
  it.each(["not JSON", '{"instrumentType":"Series Seed"}', '<script>alert(1)</script>'])("rejects invalid customer output %s without a second provider call", async text => {
    isConfiguredMock.mockReturnValue(true);
    parseMock.mockResolvedValue({ text, usage: makeUsage() });
    const result = await analyzeTermSheet({ termSheet: "hello", capTable, round });
    expect(result.mode).toBe("demo");
    expect(result.analysis).toBe(DEMO_ANALYSIS);
    expect(result.dilution?.pricing.postMoneyAud).toBe(12_500_000);
    expect(parseMock).toHaveBeenCalledTimes(1);
    expect(parseMock.mock.calls[0][0].providerPolicy).toBe("deepinfra-only");
  });
});
