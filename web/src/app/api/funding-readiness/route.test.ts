// Colocated vitest for POST /api/funding-readiness — P9-funding-readiness-route-test.
//
// This route is the public CRO funding-readiness scorer: it wraps the pure
// `scoreFundingReadiness` engine in `@/lib/agents/cro-funding-readiness`, and
// its only jobs are (a) validate + sanitise the incoming JSON into a well
// formed FundingReadinessInput, (b) rate-limit the caller on the `fundraise`
// bucket, and (c) pin the AFSL disclaimer onto every response — success or
// failure — so the route can never leak a scored payload without the
// "general information only" carve-out.
//
// Two silent regressions this pins against:
//
//   - dropping the optional-field bounds (Math.min caps) or the type guards
//     and letting a NaN/negative/wildly-out-of-range numeric field flow into
//     the scorer, producing a bogus score the founder then quotes to
//     investors;
//   - dropping the disclaimer field on the 429 (rate-limited) path — the
//     rate-limited response is the *most* likely path a scraping attacker
//     hits, so it must carry the disclaimer or the platform is exposed to a
//     `s923B` "personal advice" argument.
//
// The route is a thin facade over the pure engine, so the tests here assert
// wiring: validation branches, sanitiser output (via what the mocked engine
// receives), rate-limit behaviour, and response shape. Engine correctness is
// covered by `cro-funding-readiness.test.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE route import) --------------------------------

const checkRateLimitMock =
  vi.fn<(bucket: string, keyParts: string[]) => Promise<{ allowed: boolean; limit: number; remaining: number; resetAt: number }>>();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (bucket: string, keyParts: string[]) => checkRateLimitMock(bucket, keyParts),
}));

const scoreFundingReadinessMock = vi.fn<(input: unknown) => unknown>();
vi.mock("@/lib/agents/cro-funding-readiness", () => ({
  scoreFundingReadiness: (input: unknown) => scoreFundingReadinessMock(input),
}));

// Route import MUST come after mocks are registered.
import { POST, dynamic } from "./route";

// --- Helpers ---------------------------------------------------------------

const DISCLAIMER =
  "General information only. Not financial advice. Score is illustrative and not a guarantee of investor interest.";

function req(body: unknown, opts?: { badJson?: boolean; headers?: Record<string, string> }): Request {
  const payload = opts?.badJson ? "{not json" : JSON.stringify(body);
  return new Request("http://x/api/funding-readiness", {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts?.headers ?? {}) },
    body: payload,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function fakeResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stage: "seed",
    overall: 72,
    verdict: "near-ready",
    pillars: [],
    topGaps: [],
    actions: [],
    summary: "ok",
    ...overrides,
  };
}

beforeEach(() => {
  checkRateLimitMock.mockReset().mockResolvedValue({
    allowed: true,
    limit: 60,
    remaining: 59,
    resetAt: Date.now() + 60_000,
  });
  scoreFundingReadinessMock.mockReset().mockReturnValue(fakeResult());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Tests -----------------------------------------------------------------

describe("POST /api/funding-readiness — JSON + body shape validation", () => {
  it("returns 400 with disclaimer on unparseable JSON body", async () => {
    const res = await POST(req({}, { badJson: true }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Invalid JSON body",
      disclaimer: DISCLAIMER,
    });
    expect(scoreFundingReadinessMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("returns 400 with disclaimer when body is null", async () => {
    const res = await POST(
      new Request("http://x/api/funding-readiness", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(null),
      }),
    );
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Request body must be a JSON object.",
      disclaimer: DISCLAIMER,
    });
  });

  it("returns 400 with disclaimer when body is a bare string", async () => {
    const res = await POST(
      new Request("http://x/api/funding-readiness", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify("seed"),
      }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("Request body must be a JSON object.");
  });

  it("returns 400 with disclaimer when body is a number", async () => {
    const res = await POST(
      new Request("http://x/api/funding-readiness", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(42),
      }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("Request body must be a JSON object.");
  });

  it("does not invoke the scorer or the rate-limiter on validation failure", async () => {
    await POST(req({ stage: "gamma-ray" }));
    expect(scoreFundingReadinessMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/funding-readiness — stage validation", () => {
  it("returns 400 with the four valid stages listed when stage is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.disclaimer).toBe(DISCLAIMER);
    expect(String(body.error)).toBe(
      "`stage` must be one of: pre-seed, seed, series-a, series-b.",
    );
  });

  it("returns 400 when stage is a non-string type (number)", async () => {
    const res = await POST(req({ stage: 3 }));
    expect(res.status).toBe(400);
    expect(String((await json(res)).error)).toContain("`stage` must be one of");
  });

  it("returns 400 when stage is a string but not in the whitelist", async () => {
    const res = await POST(req({ stage: "series-z" }));
    expect(res.status).toBe(400);
    expect(String((await json(res)).error)).toContain("`stage` must be one of");
  });

  it("accepts an upper-case stage (case-insensitive lookup)", async () => {
    const res = await POST(req({ stage: "SERIES-A" }));
    expect(res.status).toBe(200);
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as { stage: string };
    expect(input.stage).toBe("series-a");
  });

  it("accepts a stage with surrounding whitespace (trim before lookup)", async () => {
    const res = await POST(req({ stage: "   seed  " }));
    expect(res.status).toBe(200);
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as { stage: string };
    expect(input.stage).toBe("seed");
  });

  it("accepts all four canonical stage values", async () => {
    for (const s of ["pre-seed", "seed", "series-a", "series-b"] as const) {
      scoreFundingReadinessMock.mockClear();
      const res = await POST(req({ stage: s }));
      expect(res.status).toBe(200);
      const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as { stage: string };
      expect(input.stage).toBe(s);
    }
  });
});

describe("POST /api/funding-readiness — optional numeric sanitiser", () => {
  it("passes finite non-negative numerics through untouched", async () => {
    await POST(
      req({
        stage: "seed",
        mrrAud: 12_500,
        users: 340,
        monthlyGrowthPct: 12,
        teamSignal: 75,
        esopPoolPct: 12,
        dataRoomPct: 68,
      }),
    );
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input).toMatchObject({
      stage: "seed",
      mrrAud: 12_500,
      users: 340,
      monthlyGrowthPct: 12,
      teamSignal: 75,
      esopPoolPct: 12,
      dataRoomPct: 68,
    });
  });

  it("caps mrrAud at 1e9 (the field's max)", async () => {
    await POST(req({ stage: "seed", mrrAud: 5e12 }));
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.mrrAud).toBe(1e9);
  });

  it("caps users at 1e9 (the field's max)", async () => {
    await POST(req({ stage: "seed", users: 9.9e10 }));
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.users).toBe(1e9);
  });

  it("caps monthlyGrowthPct at 500 (the field's max)", async () => {
    await POST(req({ stage: "seed", monthlyGrowthPct: 9_999 }));
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.monthlyGrowthPct).toBe(500);
  });

  it("caps teamSignal / esopPoolPct / dataRoomPct at 100 (0-100 fields)", async () => {
    await POST(
      req({ stage: "seed", teamSignal: 400, esopPoolPct: 250, dataRoomPct: 999 }),
    );
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.teamSignal).toBe(100);
    expect(input.esopPoolPct).toBe(100);
    expect(input.dataRoomPct).toBe(100);
  });

  it("drops NaN numerics (falls back to undefined)", async () => {
    await POST(req({ stage: "seed", mrrAud: Number.NaN }));
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.mrrAud).toBeUndefined();
  });

  it("drops Infinity numerics (falls back to undefined)", async () => {
    await POST(req({ stage: "seed", monthlyGrowthPct: Number.POSITIVE_INFINITY }));
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.monthlyGrowthPct).toBeUndefined();
  });

  it("drops negative numerics (falls back to undefined)", async () => {
    await POST(req({ stage: "seed", teamSignal: -5, users: -10 }));
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.teamSignal).toBeUndefined();
    expect(input.users).toBeUndefined();
  });

  it("drops non-number numerics — strings, bools, arrays, objects", async () => {
    await POST(
      req({
        stage: "seed",
        mrrAud: "10000",
        users: true,
        monthlyGrowthPct: [1, 2],
        teamSignal: { n: 50 },
      }),
    );
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.mrrAud).toBeUndefined();
    expect(input.users).toBeUndefined();
    expect(input.monthlyGrowthPct).toBeUndefined();
    expect(input.teamSignal).toBeUndefined();
  });

  it("preserves zero (a valid non-negative)", async () => {
    await POST(
      req({ stage: "pre-seed", mrrAud: 0, users: 0, monthlyGrowthPct: 0, dataRoomPct: 0 }),
    );
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.mrrAud).toBe(0);
    expect(input.users).toBe(0);
    expect(input.monthlyGrowthPct).toBe(0);
    expect(input.dataRoomPct).toBe(0);
  });

  it("treats an explicit null numeric as undefined", async () => {
    await POST(req({ stage: "seed", mrrAud: null, teamSignal: null }));
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.mrrAud).toBeUndefined();
    expect(input.teamSignal).toBeUndefined();
  });
});

describe("POST /api/funding-readiness — optional boolean sanitiser", () => {
  it("passes true booleans through untouched", async () => {
    await POST(
      req({
        stage: "seed",
        hasTechnicalFounder: true,
        hasFounderVesting: true,
        hasShareholdersAgreement: true,
        hasPitchDeck: true,
        hasFinancialModel: true,
        hasUseOfFunds: true,
        hasWarmIntros: true,
      }),
    );
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.hasTechnicalFounder).toBe(true);
    expect(input.hasFounderVesting).toBe(true);
    expect(input.hasShareholdersAgreement).toBe(true);
    expect(input.hasPitchDeck).toBe(true);
    expect(input.hasFinancialModel).toBe(true);
    expect(input.hasUseOfFunds).toBe(true);
    expect(input.hasWarmIntros).toBe(true);
  });

  it("passes false booleans through untouched (does not confuse with undefined)", async () => {
    await POST(
      req({
        stage: "seed",
        hasTechnicalFounder: false,
        hasPitchDeck: false,
      }),
    );
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.hasTechnicalFounder).toBe(false);
    expect(input.hasPitchDeck).toBe(false);
  });

  it("drops truthy non-boolean values (string 'true', number 1, {}) to undefined", async () => {
    await POST(
      req({
        stage: "seed",
        hasTechnicalFounder: "true",
        hasPitchDeck: 1,
        hasFinancialModel: {},
      }),
    );
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.hasTechnicalFounder).toBeUndefined();
    expect(input.hasPitchDeck).toBeUndefined();
    expect(input.hasFinancialModel).toBeUndefined();
  });

  it("drops missing boolean fields to undefined (not false)", async () => {
    await POST(req({ stage: "seed" }));
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.hasTechnicalFounder).toBeUndefined();
    expect(input.hasFounderVesting).toBeUndefined();
    expect(input.hasShareholdersAgreement).toBeUndefined();
    expect(input.hasPitchDeck).toBeUndefined();
    expect(input.hasFinancialModel).toBeUndefined();
    expect(input.hasUseOfFunds).toBeUndefined();
    expect(input.hasWarmIntros).toBeUndefined();
  });
});

describe("POST /api/funding-readiness — rate limiting (bucket=fundraise)", () => {
  it("calls checkRateLimit on the fundraise bucket with the route tag", async () => {
    await POST(req({ stage: "seed" }));
    expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
    const [bucket, parts] = checkRateLimitMock.mock.calls[0]!;
    expect(bucket).toBe("fundraise");
    expect(parts[0]).toBe("funding-readiness");
  });

  it("uses cf-connecting-ip when present as the identity key part", async () => {
    await POST(
      req(
        { stage: "seed" },
        { headers: { "cf-connecting-ip": "203.0.113.9" } },
      ),
    );
    const [, parts] = checkRateLimitMock.mock.calls[0]!;
    expect(parts[1]).toBe("203.0.113.9");
  });

  it("falls back to x-forwarded-for's first entry when cf-connecting-ip is absent", async () => {
    await POST(
      req(
        { stage: "seed" },
        { headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" } },
      ),
    );
    const [, parts] = checkRateLimitMock.mock.calls[0]!;
    expect(parts[1]).toBe("198.51.100.7");
  });

  it("falls back to x-real-ip when cf-connecting-ip + x-forwarded-for are absent", async () => {
    await POST(
      req({ stage: "seed" }, { headers: { "x-real-ip": "192.0.2.4" } }),
    );
    const [, parts] = checkRateLimitMock.mock.calls[0]!;
    expect(parts[1]).toBe("192.0.2.4");
  });

  it("falls back to 'anon' when no IP header is present", async () => {
    await POST(req({ stage: "seed" }));
    const [, parts] = checkRateLimitMock.mock.calls[0]!;
    expect(parts[1]).toBe("anon");
  });

  it("returns 429 with Retry-After header + retryInSeconds + disclaimer on rate-limit", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: Date.now() + 42_000,
    });
    const res = await POST(req({ stage: "seed" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.disclaimer).toBe(DISCLAIMER);
    expect(String(body.error)).toContain("Too many requests");
    expect(typeof body.retryInSeconds).toBe("number");
    expect(Number(body.retryInSeconds)).toBeGreaterThanOrEqual(1);
    expect(Number(body.retryInSeconds)).toBeLessThanOrEqual(43);
  });

  it("clamps retryInSeconds to at least 1 even when resetAt is already in the past", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: Date.now() - 5_000,
    });
    const res = await POST(req({ stage: "seed" }));
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.retryInSeconds).toBe(1);
    expect(res.headers.get("Retry-After")).toBe("1");
  });

  it("does not invoke the scorer when the rate-limiter denies", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });
    await POST(req({ stage: "seed" }));
    expect(scoreFundingReadinessMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/funding-readiness — success response shape", () => {
  it("returns 200 with {ok, result, disclaimer} on a valid call", async () => {
    scoreFundingReadinessMock.mockReturnValue(
      fakeResult({ overall: 81, verdict: "investor-ready" }),
    );
    const res = await POST(req({ stage: "series-a", mrrAud: 100_000 }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      result: fakeResult({ overall: 81, verdict: "investor-ready" }),
      disclaimer: DISCLAIMER,
    });
  });

  it("invokes the scorer exactly once per accepted request", async () => {
    await POST(req({ stage: "seed" }));
    expect(scoreFundingReadinessMock).toHaveBeenCalledTimes(1);
  });

  it("forwards the sanitised FundingReadinessInput unchanged to the scorer", async () => {
    await POST(
      req({
        stage: "seed",
        mrrAud: 20_000,
        hasPitchDeck: true,
        dataRoomPct: 50,
      }),
    );
    const input = scoreFundingReadinessMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input).toEqual({
      stage: "seed",
      mrrAud: 20_000,
      users: undefined,
      monthlyGrowthPct: undefined,
      teamSignal: undefined,
      hasTechnicalFounder: undefined,
      hasFounderVesting: undefined,
      hasShareholdersAgreement: undefined,
      esopPoolPct: undefined,
      dataRoomPct: 50,
      hasPitchDeck: true,
      hasFinancialModel: undefined,
      hasUseOfFunds: undefined,
      hasWarmIntros: undefined,
    });
  });

  it("never leaks a 200 response without the disclaimer field", async () => {
    const res = await POST(req({ stage: "pre-seed" }));
    expect((await json(res)).disclaimer).toBe(DISCLAIMER);
  });
});

describe("route module exports", () => {
  it("declares dynamic = 'force-dynamic' so the route is never statically prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
