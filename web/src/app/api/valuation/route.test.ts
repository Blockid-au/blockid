// Colocated tests for GET /api/valuation — S17-B connected-revenue bridge.
//
// Pins that the route reads connected MRR (via loadConnectedRevenueSignals)
// and that the bridge's method / note / label propagate into the response:
//   - no signals        → valuationMethod "svi", methodNote null, range = engine
//   - disagreeing MRR   → "svi+arr_multiple" + DISAGREEMENT_NOTE, widened range
//   - stale MRR         → "svi" + stale note, range unchanged
//   - loader receives the user / project / account scope

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getProjectIdFromRequest: vi.fn(),
  findSVIAccountWithFallback: vi.fn(),
  loadConnectedRevenueSignals: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/credits", () => ({ canAfford: vi.fn(), spendCredits: vi.fn() }));
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => mocks.getProjectIdFromRequest(),
  findSVIAccountWithFallback: (...args: unknown[]) => mocks.findSVIAccountWithFallback(...args),
}));
vi.mock("@/lib/connected-revenue", () => ({
  loadConnectedRevenueSignals: (...args: unknown[]) => mocks.loadConnectedRevenueSignals(...args),
}));

import { GET } from "./route";
import { computeValuation } from "@/lib/valuation";
import { DISAGREEMENT_NOTE } from "@/lib/valuation-mrr-bridge";

const USER = { id: "u-1", email: "founder@example.com" };
const ACCOUNT = { id: "acc-1", current_svi: 120, current_stage: 3 };

function makeSb() {
  const builder = (data: unknown) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = chain;
    b.eq = chain;
    b.order = chain;
    b.limit = chain;
    b.maybeSingle = vi.fn(async () => ({ data }));
    return b;
  };
  const from = vi.fn((table: string) => {
    if (table === "svi_snapshots") return builder({ dimension_scores: { ftv: 60, mpc: 55, ptd: 50, tre: 40, cgh: 50, iri: 45, lco: 50, svm: 55 } });
    if (table === "startup_metrics") return builder(null);
    throw new Error(`unexpected table ${table}`);
  });
  return { from };
}

async function body() {
  const res = await GET();
  return { status: res.status, json: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe("GET /api/valuation — connected revenue bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(USER);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    mocks.getProjectIdFromRequest.mockResolvedValue("p-1");
    mocks.findSVIAccountWithFallback.mockResolvedValue(ACCOUNT);
    mocks.loadConnectedRevenueSignals.mockResolvedValue([]);
  });

  it("401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await body()).status).toBe(401);
  });

  it("no connected signals → engine range untouched, method 'svi'", async () => {
    const { status, json } = await body();
    expect(status).toBe(200);
    expect(json.valuation.valuationMethod).toBe("svi");
    expect(json.valuation.methodNote).toBeNull();
    expect(json.valuation.connectedRevenue).toBeNull();
    expect(json.valuation.lowAud).toBe(json.valuation.sviRange.lowAud);
    expect(json.valuation.highAud).toBe(json.valuation.sviRange.highAud);
    expect(mocks.loadConnectedRevenueSignals).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "u-1", projectId: "p-1", accountId: "acc-1" },
    );
  });

  it("disagreeing connected MRR → widened range + method note + label propagate", async () => {
    // Engine range for this fixture is single-digit millions; A$500k MRR →
    // A$6M ARR × default 4–6× = 24M–36M, disjoint from the SVI range.
    mocks.loadConnectedRevenueSignals.mockResolvedValue([
      { provider: "stripe", mrrAud: 500_000, capturedAt: new Date().toISOString() },
    ]);
    const { status, json } = await body();
    expect(status).toBe(200);
    const engine = computeValuation({ sviScore: 120, stage: "mvp", dimensions: { ftv: 60, mpc: 55, ptd: 50, tre: 40, cgh: 50, iri: 45, lco: 50, svm: 55 } });
    expect(json.valuation.sviRange).toEqual({ lowAud: engine.lowAud, midAud: engine.midAud, highAud: engine.highAud });
    expect(json.valuation.valuationMethod).toBe("svi+arr_multiple");
    expect(json.valuation.methodNote).toBe(DISAGREEMENT_NOTE);
    expect(json.valuation.method).toContain("connected ARR multiple cross-check");
    expect(json.valuation.lowAud).toBe(engine.lowAud);
    expect(json.valuation.highAud).toBe(36_000_000);
    expect(json.valuation.connectedRevenue).toMatchObject({
      provider: "stripe",
      mrrAud: 500_000,
      arrAud: 6_000_000,
      relation: "disjoint",
      label: "Includes connected revenue (A$500K MRR from Stripe)",
    });
  });

  it("stale connected MRR → ignored with a note, range unchanged", async () => {
    mocks.loadConnectedRevenueSignals.mockResolvedValue([
      { provider: "xero", mrrAud: 500_000, capturedAt: "2025-01-01T00:00:00Z" },
    ]);
    const { json } = await body();
    expect(json.valuation.valuationMethod).toBe("svi");
    expect(json.valuation.methodNote).toContain("older than 90 days");
    expect(json.valuation.connectedRevenue).toBeNull();
    expect(json.valuation.lowAud).toBe(json.valuation.sviRange.lowAud);
  });
});
