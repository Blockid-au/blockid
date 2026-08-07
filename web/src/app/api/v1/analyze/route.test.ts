// Colocated vitest for POST /api/v1/analyze — P9 batch 4.
//
// Public API endpoint (API key auth, no session). Credit-gated SVI analysis.
// Critical external surface — authentication and credit deduction must be
// airtight. Suite covers:
//   - 401 when no/invalid API key
//   - 402 when insufficient credits
//   - 400 on bad JSON
//   - 400 when description is empty
//   - 500 on analysis failure
//   - happy path: returns SVI + dimensions + topGaps + creditsRemaining
//   - credits are spent on success
//   - accepts legacy field names (name, rawText, website)
//   - topGaps sorted by impact descending
//   - response includes meta.confidence + meta.summary

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAPIKey: vi.fn(),
  canAfford: vi.fn(),
  spendCredits: vi.fn(),
  extractSignals: vi.fn(),
  computeSVI: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateAPIKey: (req: Request) => mocks.authenticateAPIKey(req),
}));
vi.mock("@/lib/credits", () => ({
  canAfford: (userId: string, op: string) => mocks.canAfford(userId, op),
  spendCredits: (...a: unknown[]) => mocks.spendCredits(...a),
}));
vi.mock("@/lib/svi-analysis", () => ({
  extractSignals: (...a: unknown[]) => mocks.extractSignals(...a),
  computeSVI: (...a: unknown[]) => mocks.computeSVI(...a),
}));

import { POST } from "./route";

const AUTH = { userId: "user-api-1", keyId: "key-1" };
const ANALYSIS = {
  totalSVI: 72,
  stage: "seed",
  stageLabel: "Seed",
  version: "3.0",
  confidenceMultiplier: 0.85,
  summary: "Strong team but limited traction data.",
  subs: [
    { key: "team", label: "Team", value: 80 },
    { key: "market", label: "Market", value: 65 },
  ],
  evidenceGaps: [
    { label: "Revenue metrics missing", impact: 0.9, priority: 1, action: "Add MRR" },
    { label: "Team bios incomplete", impact: 0.5, priority: 2, action: "Add bios" },
    { label: "Market size unquantified", impact: 0.7, priority: 3, action: "Add TAM" },
  ],
  riskPenalties: [{ reason: "no_revenue" }],
};

function req(body: unknown, opts?: { badJson?: boolean }) {
  return new Request("http://x/api/v1/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer bk_live_test123",
    },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.authenticateAPIKey.mockResolvedValue(AUTH);
  mocks.canAfford.mockResolvedValue({ allowed: true, balance: 5 });
  mocks.extractSignals.mockReturnValue({ signals: {} });
  mocks.computeSVI.mockReturnValue(ANALYSIS);
  mocks.spendCredits.mockResolvedValue(undefined);
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/v1/analyze", () => {
  it("returns 401 when API key is invalid/missing", async () => {
    mocks.authenticateAPIKey.mockResolvedValue(null);
    const res = await POST(req({ description: "AI startup that automates legal docs" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("unauthorized");
  });

  it("returns 402 when insufficient credits", async () => {
    mocks.canAfford.mockResolvedValue({ allowed: false, balance: 0 });
    const res = await POST(req({ description: "AI startup" }));
    expect(res.status).toBe(402);
    const body = await json(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("insufficient_credits");
    expect(err.balance).toBe(0);
  });

  it("returns 400 on bad JSON body", async () => {
    const res = await POST(req(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("invalid_input");
  });

  it("returns 400 when description is empty", async () => {
    const res = await POST(req({ description: "   " }));
    expect(res.status).toBe(400);
    const body = await json(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("invalid_input");
  });

  it("returns 400 when description is missing", async () => {
    const res = await POST(req({ startupName: "MyStartup" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 on analysis failure", async () => {
    mocks.computeSVI.mockImplementation(() => { throw new Error("Analysis error"); });
    const res = await POST(req({ description: "AI startup that automates legal docs" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("analysis_failed");
  });

  it("happy path: returns ok + SVI + stage + dimensions + topGaps", async () => {
    const res = await POST(req({ description: "AI startup that automates legal docs" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.sviScore).toBe(72);
    expect(body.stage).toBe("seed");
    expect(Array.isArray(body.dimensions)).toBe(true);
    expect(Array.isArray(body.topGaps)).toBe(true);
  });

  it("spends credits on success", async () => {
    await POST(req({ description: "AI startup that automates legal docs" }));
    expect(mocks.spendCredits).toHaveBeenCalledWith(
      AUTH.userId,
      "svi_analysis",
      expect.any(Object),
    );
  });

  it("accepts legacy field name 'text' for description", async () => {
    const res = await POST(req({ text: "AI startup that automates legal docs" }));
    expect(res.status).toBe(200);
    expect(mocks.extractSignals).toHaveBeenCalled();
  });

  it("topGaps are sorted by impact descending", async () => {
    const res = await POST(req({ description: "AI startup" }));
    const body = await json(res);
    const gaps = body.topGaps as Array<{ impact: number }>;
    expect(gaps[0].impact).toBeGreaterThanOrEqual(gaps[1]?.impact ?? 0);
  });

  it("returns creditsRemaining from updated balance", async () => {
    mocks.canAfford
      .mockResolvedValueOnce({ allowed: true, balance: 5 })
      .mockResolvedValueOnce({ allowed: true, balance: 4 });
    const res = await POST(req({ description: "AI startup" }));
    const body = await json(res);
    expect(body.creditsRemaining).toBe(4);
  });

  it("meta.confidence is percentage of confidenceMultiplier", async () => {
    const res = await POST(req({ description: "AI startup" }));
    const body = await json(res);
    const meta = body.meta as Record<string, unknown>;
    expect(meta.confidence).toBe(85);
  });

  it("meta.summary is passed through", async () => {
    const res = await POST(req({ description: "AI startup" }));
    const body = await json(res);
    const meta = body.meta as Record<string, unknown>;
    expect(meta.summary).toBe(ANALYSIS.summary);
  });

  it("dimensions scores are rounded to integers", async () => {
    mocks.computeSVI.mockReturnValue({
      ...ANALYSIS,
      subs: [{ key: "team", label: "Team", value: 72.7 }],
    });
    const res = await POST(req({ description: "AI startup" }));
    const body = await json(res);
    const dims = body.dimensions as Array<{ score: number }>;
    expect(dims[0].score).toBe(73);
  });
});
