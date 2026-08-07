// Colocated vitest for POST /api/idea-lab — P9-idea-lab-route-test.
//
// The Idea Lab endpoint sits at the funnel top: an anonymous founder pastes a
// sector, gets 10 startup angles + 5 non-obvious opportunities + 3 competitor
// notes, and (for logged-in callers) burns 3 credits per run. Every branch in
// this route is a public-surface contract because the response shape is what
// the /rnd/idea-lab client renders — a silent drop of `sectorLabel` breaks the
// header; a silent drop of `disclaimer` exposes the platform to an AFSL /
// s923B "personal advice" claim on an exploratory tool.
//
// Pins:
//   1. Input validation — invalid JSON, missing/oversize sector, oversize
//      problemArea. Each returns 400 with no downstream call.
//   2. Audience whitelist — unknown string falls back to "any" verbatim;
//      valid values pass through as-is.
//   3. Sector normalisation — trimmed + lowercased on the way IN, canonical
//      SECTOR_LABELS label re-emitted on the way OUT (with raw fallback for
//      free-form sectors not in the whitelist).
//   4. Rate-limit — shared `default` bucket keyed by (identity, sector);
//      429 body includes retryInSeconds (Math.max(1, ceil(delta/1000))) and
//      the Retry-After header carries the same integer. Anonymous callers
//      also hit a stricter 1-per-24h bucket keyed by (IP, sector) with a
//      copy that nudges to sign in for unlimited runs. Logged-in callers
//      SKIP the anon bucket entirely.
//   5. Anonymous identity — resolved from cf-connecting-ip →
//      x-forwarded-for (first hop) → x-real-ip → "anon" in that order.
//   6. Credit gate — logged-in caller with canAfford.allowed=false returns
//      402 with { creditsRequired, balance } and NEVER calls spendCredits
//      or generateIdeaLab. spendCredits.ok=false also returns 402 with
//      creditsRequired from FEATURE_COSTS.idea_lab (3).
//   7. Credit charge amount — `creditsCharged` in the success body is the
//      cost the AFFORD check reported (not the static FEATURE_COSTS lookup)
//      so a promo override on the affordability side is preserved.
//   8. Anonymous callers do NOT hit canAfford / spendCredits at all.
//   9. Happy path — generateIdeaLab receives the normalised payload
//      (sector, problemArea, audience) verbatim and the response spreads
//      the result under `ok:true` alongside sectorLabel + creditsCharged +
//      disclaimer.
//  10. Safety-net — generateIdeaLab throw is caught and the deterministic
//      seed is returned with source="seed", the same sectorLabel, and the
//      credits are still charged (already deducted before the try).
//  11. Contract — `export const dynamic === "force-dynamic"` (the founder
//      funnel must never render a stale cached response, and the credit
//      side-effect is the reason).
//
// The libs are all mocked so this file asserts pure route wiring; behaviour
// of the rate-limiter, credit ledger, and idea-lab agent is covered by their
// own colocated tests.

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE route import) --------------------------------

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const checkRateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (a: unknown, b: unknown, c?: unknown) =>
    checkRateLimitMock(a, b, c),
}));

const canAffordMock = vi.fn();
const spendCreditsMock = vi.fn();
vi.mock("@/lib/credits", () => ({
  canAfford: (userId: string, feature: string) => canAffordMock(userId, feature),
  spendCredits: (userId: string, feature: string, metadata?: unknown) =>
    spendCreditsMock(userId, feature, metadata),
  FEATURE_COSTS: { idea_lab: 3 },
}));

const getProjectIdMock = vi.fn();
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => getProjectIdMock(),
}));

vi.mock("@/lib/svi-analysis", () => ({
  SECTOR_LABELS: {
    saas: "SaaS / Software",
    fintech: "FinTech",
  },
}));

const generateIdeaLabMock = vi.fn();
vi.mock("@/lib/agents/rnd-idea-lab", () => ({
  generateIdeaLab: (payload: unknown) => generateIdeaLabMock(payload),
}));

const getSeedMock = vi.fn();
vi.mock("@/lib/agents/rnd-idea-lab-seed", () => ({
  getSeed: (sector: string) => getSeedMock(sector),
}));

// Route import MUST come after mocks are registered.
import { POST, dynamic } from "./route";

// --- Helpers ---------------------------------------------------------------

function req(
  body: unknown,
  opts?: { badJson?: boolean; headers?: Record<string, string> },
): Request {
  const payload = opts?.badJson
    ? "{not-json"
    : typeof body === "string"
      ? body
      : JSON.stringify(body);
  return new Request("http://x/api/idea-lab", {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts?.headers ?? {}) },
    body: payload,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const USER = { id: "u-1", email: "founder@example.com" };

const HAPPY_AGENT_RESULT = {
  sector: "saas",
  angles: [{ title: "A", oneLiner: "one" }],
  nonObvious: [{ opportunity: "no" }],
  competitors: [{ name: "Comp" }],
  generatedAt: "2026-08-07T00:00:00.000Z",
  source: "ai" as const,
};

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(null);

  // Default: everything green — shared bucket allows, anon bucket allows.
  // The route calls the async signature first (with keyParts array), then the
  // sync signature for the anon branch. We disambiguate by the second arg.
  checkRateLimitMock.mockReset().mockImplementation((_a, b) => {
    if (Array.isArray(b)) {
      return Promise.resolve({
        allowed: true,
        limit: 60,
        remaining: 59,
        resetAt: Date.now() + 60_000,
      });
    }
    return { allowed: true, remaining: 0, resetIn: 86_400_000 };
  });

  canAffordMock.mockReset().mockResolvedValue({
    allowed: true,
    balance: 10,
    cost: 3,
  });
  spendCreditsMock.mockReset().mockResolvedValue({ ok: true, balance: 7 });
  getProjectIdMock.mockReset().mockResolvedValue(null);
  generateIdeaLabMock.mockReset().mockResolvedValue(HAPPY_AGENT_RESULT);
  getSeedMock.mockReset().mockReturnValue({
    angles: [{ title: "seed-a" }],
    nonObvious: [{ opportunity: "seed-no" }],
    competitors: [{ name: "seed-c" }],
  });
});

// --- 1. Input validation ---------------------------------------------------

describe("POST /api/idea-lab — input validation", () => {
  it("400s on invalid JSON body — no downstream calls", async () => {
    const res = await POST(req({}, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid JSON body");
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(generateIdeaLabMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("400s when sector is missing (empty string after trim)", async () => {
    const res = await POST(req({ sector: "   " }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/`sector` is required/);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("400s when sector is non-string", async () => {
    const res = await POST(req({ sector: 42 }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/`sector` is required/);
  });

  it("400s when sector exceeds 60 chars", async () => {
    const long = "a".repeat(61);
    const res = await POST(req({ sector: long }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/max 60 chars/);
    expect(generateIdeaLabMock).not.toHaveBeenCalled();
  });

  it("accepts sector exactly at the 60-char boundary", async () => {
    const exact = "a".repeat(60);
    const res = await POST(req({ sector: exact }));
    expect(res.status).toBe(200);
  });

  it("400s when problemArea exceeds 500 chars", async () => {
    const long = "b".repeat(501);
    const res = await POST(req({ sector: "saas", problemArea: long }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/problemArea.*500 characters/);
    expect(generateIdeaLabMock).not.toHaveBeenCalled();
  });

  it("accepts problemArea exactly at the 500-char boundary", async () => {
    const exact = "b".repeat(500);
    const res = await POST(req({ sector: "saas", problemArea: exact }));
    expect(res.status).toBe(200);
  });
});

// --- 2. Audience whitelist -------------------------------------------------

describe("POST /api/idea-lab — audience whitelist", () => {
  it("falls back to 'any' when audience is unknown", async () => {
    await POST(req({ sector: "saas", audience: "aliens" }));
    expect(generateIdeaLabMock).toHaveBeenCalledTimes(1);
    const payload = generateIdeaLabMock.mock.calls[0][0] as { audience: string };
    expect(payload.audience).toBe("any");
  });

  it("falls back to 'any' when audience is non-string", async () => {
    await POST(req({ sector: "saas", audience: 3 }));
    const payload = generateIdeaLabMock.mock.calls[0][0] as { audience: string };
    expect(payload.audience).toBe("any");
  });

  it.each(["consumer", "smb", "enterprise", "any"] as const)(
    "passes through valid audience %s",
    async (aud) => {
      await POST(req({ sector: "saas", audience: aud }));
      const payload = generateIdeaLabMock.mock.calls[0][0] as {
        audience: string;
      };
      expect(payload.audience).toBe(aud);
    },
  );
});

// --- 3. Sector normalisation ----------------------------------------------

describe("POST /api/idea-lab — sector normalisation", () => {
  it("lowercases + trims the sector before forwarding", async () => {
    await POST(req({ sector: "  SaaS  " }));
    const payload = generateIdeaLabMock.mock.calls[0][0] as { sector: string };
    expect(payload.sector).toBe("saas");
  });

  it("re-emits canonical SECTOR_LABELS label in the response", async () => {
    const res = await POST(req({ sector: "SaaS" }));
    const body = await json(res);
    expect(body.sectorLabel).toBe("SaaS / Software");
  });

  it("falls back to the raw sector when it is NOT in SECTOR_LABELS", async () => {
    const res = await POST(req({ sector: "moonshot" }));
    const body = await json(res);
    expect(body.sectorLabel).toBe("moonshot");
  });

  it("trims + lowercases the problem area is NOT applied (raw text preserved for the agent)", async () => {
    await POST(req({ sector: "saas", problemArea: "  Founders Suffer  " }));
    const payload = generateIdeaLabMock.mock.calls[0][0] as {
      problemArea: string;
    };
    expect(payload.problemArea).toBe("Founders Suffer");
  });
});

// --- 4. Rate-limit — shared `default` bucket -------------------------------

describe("POST /api/idea-lab — shared default bucket rate-limit", () => {
  it("429s with Retry-After header + retryInSeconds body when the shared bucket denies", async () => {
    const now = Date.now();
    checkRateLimitMock.mockImplementation((_a, b) => {
      if (Array.isArray(b)) {
        return Promise.resolve({
          allowed: false,
          limit: 60,
          remaining: 0,
          resetAt: now + 12_000,
        });
      }
      return { allowed: true, remaining: 0, resetIn: 86_400_000 };
    });
    const res = await POST(req({ sector: "saas" }));
    expect(res.status).toBe(429);
    const retryHeader = res.headers.get("Retry-After");
    expect(retryHeader).not.toBeNull();
    // Delta is ~12s so retryInSeconds should be in [11, 13] depending on now.
    const body = await json(res);
    const retryBody = body.retryInSeconds as number;
    expect(retryBody).toBeGreaterThanOrEqual(1);
    expect(retryBody).toBeLessThanOrEqual(13);
    expect(Number(retryHeader)).toBe(retryBody);
    expect(generateIdeaLabMock).not.toHaveBeenCalled();
  });

  it("floors retryInSeconds at 1 when the reset time is already in the past", async () => {
    checkRateLimitMock.mockImplementation((_a, b) => {
      if (Array.isArray(b)) {
        return Promise.resolve({
          allowed: false,
          limit: 60,
          remaining: 0,
          resetAt: Date.now() - 5_000,
        });
      }
      return { allowed: true, remaining: 0, resetIn: 86_400_000 };
    });
    const res = await POST(req({ sector: "saas" }));
    const body = await json(res);
    expect(body.retryInSeconds).toBe(1);
  });

  it("keys the shared bucket on ('idea-lab', identity, sector)", async () => {
    await POST(req({ sector: "SaaS" }));
    const bucketCall = checkRateLimitMock.mock.calls.find((c) =>
      Array.isArray(c[1]),
    );
    expect(bucketCall).toBeDefined();
    expect(bucketCall![0]).toBe("default");
    expect(bucketCall![1]).toEqual(["idea-lab", "anon", "saas"]);
  });
});

// --- 5. Anonymous identity resolution + anon rate-limit --------------------

describe("POST /api/idea-lab — anonymous identity + 1/day bucket", () => {
  it("resolves identity from cf-connecting-ip when present", async () => {
    await POST(
      req(
        { sector: "saas" },
        { headers: { "cf-connecting-ip": "1.2.3.4" } },
      ),
    );
    const bucketCall = checkRateLimitMock.mock.calls.find((c) =>
      Array.isArray(c[1]),
    );
    expect((bucketCall![1] as string[])[1]).toBe("1.2.3.4");
  });

  it("falls back to first x-forwarded-for hop when cf-connecting-ip is absent", async () => {
    await POST(
      req(
        { sector: "saas" },
        { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } },
      ),
    );
    const bucketCall = checkRateLimitMock.mock.calls.find((c) =>
      Array.isArray(c[1]),
    );
    expect((bucketCall![1] as string[])[1]).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip when neither cf nor xff is present", async () => {
    await POST(
      req({ sector: "saas" }, { headers: { "x-real-ip": "7.7.7.7" } }),
    );
    const bucketCall = checkRateLimitMock.mock.calls.find((c) =>
      Array.isArray(c[1]),
    );
    expect((bucketCall![1] as string[])[1]).toBe("7.7.7.7");
  });

  it("uses literal 'anon' when no IP headers are present", async () => {
    await POST(req({ sector: "saas" }));
    const bucketCall = checkRateLimitMock.mock.calls.find((c) =>
      Array.isArray(c[1]),
    );
    expect((bucketCall![1] as string[])[1]).toBe("anon");
  });

  it("hits the anon 1/day bucket for anonymous callers", async () => {
    await POST(req({ sector: "saas" }));
    const anonCall = checkRateLimitMock.mock.calls.find(
      (c) => typeof c[1] === "number",
    );
    expect(anonCall).toBeDefined();
    expect(anonCall![0]).toBe("idea-lab-anon:anon:saas");
    expect(anonCall![1]).toBe(1);
    expect(anonCall![2]).toBe(24 * 60 * 60_000);
  });

  it("429s with a sign-in nudge copy when the anon bucket denies", async () => {
    checkRateLimitMock.mockImplementation((_a, b) => {
      if (Array.isArray(b)) {
        return Promise.resolve({
          allowed: true,
          limit: 60,
          remaining: 59,
          resetAt: Date.now() + 60_000,
        });
      }
      return { allowed: false, remaining: 0, resetIn: 12_000 };
    });
    const res = await POST(req({ sector: "saas" }));
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.error).toMatch(/Free tier: one Idea Lab request per sector per day/);
    expect(body.error).toMatch(/Sign in for unlimited runs/);
    expect(body.retryInSeconds).toBe(12);
    expect(res.headers.get("Retry-After")).toBe("12");
    expect(generateIdeaLabMock).not.toHaveBeenCalled();
  });

  it("floors anon retryInSeconds at 1", async () => {
    checkRateLimitMock.mockImplementation((_a, b) => {
      if (Array.isArray(b)) {
        return Promise.resolve({
          allowed: true,
          limit: 60,
          remaining: 59,
          resetAt: Date.now() + 60_000,
        });
      }
      return { allowed: false, remaining: 0, resetIn: 0 };
    });
    const res = await POST(req({ sector: "saas" }));
    const body = await json(res);
    expect(body.retryInSeconds).toBe(1);
  });

  it("logged-in callers SKIP the anon bucket entirely", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    await POST(req({ sector: "saas" }));
    const anonCall = checkRateLimitMock.mock.calls.find(
      (c) => typeof c[1] === "number",
    );
    expect(anonCall).toBeUndefined();
  });

  it("logged-in identity uses user.id (not IP) in the shared bucket key", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    await POST(
      req(
        { sector: "saas" },
        { headers: { "cf-connecting-ip": "1.2.3.4" } },
      ),
    );
    const bucketCall = checkRateLimitMock.mock.calls.find((c) =>
      Array.isArray(c[1]),
    );
    expect((bucketCall![1] as string[])[1]).toBe("u-1");
  });
});

// --- 6. Credit gate --------------------------------------------------------

describe("POST /api/idea-lab — credit gate", () => {
  it("402s with balance + creditsRequired when canAfford denies — never calls spendCredits or the agent", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canAffordMock.mockResolvedValue({
      allowed: false,
      balance: 1,
      cost: 3,
      reason: "insufficient_credits",
    });
    const res = await POST(req({ sector: "saas" }));
    expect(res.status).toBe(402);
    const body = await json(res);
    expect(body.error).toBe("Insufficient credits.");
    expect(body.creditsRequired).toBe(3);
    expect(body.balance).toBe(1);
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(generateIdeaLabMock).not.toHaveBeenCalled();
  });

  it("402s when spendCredits returns ok:false — agent NOT invoked", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    spendCreditsMock.mockResolvedValue({ ok: false, balance: 2 });
    const res = await POST(req({ sector: "saas" }));
    expect(res.status).toBe(402);
    const body = await json(res);
    expect(body.error).toMatch(/Could not deduct credits/);
    expect(body.creditsRequired).toBe(3);
    expect(body.balance).toBe(2);
    expect(generateIdeaLabMock).not.toHaveBeenCalled();
  });

  it("forwards user.id, feature 'idea_lab', and metadata to spendCredits on the happy path", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getProjectIdMock.mockResolvedValue("proj-42");
    await POST(
      req({ sector: "saas", problemArea: "founders lose data", audience: "smb" }),
    );
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    const [userId, feature, metadata] = spendCreditsMock.mock.calls[0];
    expect(userId).toBe("u-1");
    expect(feature).toBe("idea_lab");
    expect(metadata).toEqual({
      sector: "saas",
      problemArea: "founders lose data",
      audience: "smb",
      project_id: "proj-42",
    });
  });

  it("truncates a long problemArea to 120 chars inside the spend metadata (but forwards full text to the agent)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    const long = "x".repeat(300);
    await POST(req({ sector: "saas", problemArea: long }));
    const meta = spendCreditsMock.mock.calls[0][2] as { problemArea: string };
    expect(meta.problemArea.length).toBe(120);
    const agentPayload = generateIdeaLabMock.mock.calls[0][0] as {
      problemArea: string;
    };
    expect(agentPayload.problemArea.length).toBe(300);
  });

  it("creditsCharged in the success body echoes affordCheck.cost (not FEATURE_COSTS lookup)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canAffordMock.mockResolvedValue({ allowed: true, balance: 100, cost: 7 });
    const res = await POST(req({ sector: "saas" }));
    const body = await json(res);
    expect(body.creditsCharged).toBe(7);
  });

  it("anonymous callers NEVER touch canAfford / spendCredits", async () => {
    await POST(req({ sector: "saas" }));
    expect(canAffordMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("anonymous happy path reports creditsCharged=0", async () => {
    const res = await POST(req({ sector: "saas" }));
    const body = await json(res);
    expect(body.creditsCharged).toBe(0);
  });
});

// --- 7. Happy path + response shape ---------------------------------------

describe("POST /api/idea-lab — happy path + response shape", () => {
  it("forwards normalised (sector, problemArea, audience) into generateIdeaLab", async () => {
    await POST(
      req({ sector: " FinTech ", problemArea: " KYC pain ", audience: "enterprise" }),
    );
    expect(generateIdeaLabMock).toHaveBeenCalledTimes(1);
    expect(generateIdeaLabMock.mock.calls[0][0]).toEqual({
      sector: "fintech",
      problemArea: "KYC pain",
      audience: "enterprise",
    });
  });

  it("200 body spreads the agent result + sectorLabel + creditsCharged + disclaimer", async () => {
    const res = await POST(req({ sector: "saas" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.sector).toBe("saas");
    expect(body.sectorLabel).toBe("SaaS / Software");
    expect(body.angles).toEqual([{ title: "A", oneLiner: "one" }]);
    expect(body.nonObvious).toEqual([{ opportunity: "no" }]);
    expect(body.competitors).toEqual([{ name: "Comp" }]);
    expect(body.source).toBe("ai");
    expect(body.creditsCharged).toBe(0);
    expect(body.disclaimer).toBe(
      "Ideas provided for exploration only. Not investment advice.",
    );
  });
});

// --- 8. Safety-net — agent throw falls back to seed -----------------------

describe("POST /api/idea-lab — safety-net seed fallback", () => {
  it("returns 200 with source='seed' when generateIdeaLab throws", async () => {
    generateIdeaLabMock.mockRejectedValue(new Error("network blew up"));
    const res = await POST(req({ sector: "saas" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.source).toBe("seed");
    expect(body.angles).toEqual([{ title: "seed-a" }]);
    expect(body.nonObvious).toEqual([{ opportunity: "seed-no" }]);
    expect(body.competitors).toEqual([{ name: "seed-c" }]);
    expect(body.sectorLabel).toBe("SaaS / Software");
    expect(body.disclaimer).toBe(
      "Ideas provided for exploration only. Not investment advice.",
    );
  });

  it("seed fallback still emits a generatedAt ISO string", async () => {
    generateIdeaLabMock.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ sector: "moonshot" }));
    const body = await json(res);
    expect(typeof body.generatedAt).toBe("string");
    expect((body.generatedAt as string).endsWith("Z")).toBe(true);
  });

  it("seed fallback preserves the (already-deducted) creditsCharged for logged-in callers", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    canAffordMock.mockResolvedValue({ allowed: true, balance: 50, cost: 3 });
    generateIdeaLabMock.mockRejectedValue(new Error("agent gone"));
    const res = await POST(req({ sector: "saas" }));
    const body = await json(res);
    expect(body.source).toBe("seed");
    // spendCredits was called BEFORE the try — credits are gone, so the
    // response must credit the caller with the same charge.
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    expect(body.creditsCharged).toBe(3);
  });

  it("seed fallback resolves the raw (lowercased) sector via getSeed", async () => {
    generateIdeaLabMock.mockRejectedValue(new Error("boom"));
    await POST(req({ sector: "  MoonShot  " }));
    expect(getSeedMock).toHaveBeenCalledWith("moonshot");
  });
});

// --- 9. Route contract -----------------------------------------------------

describe("POST /api/idea-lab — route contract", () => {
  it("exports dynamic = 'force-dynamic' (no caching of the credit side-effect)", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
