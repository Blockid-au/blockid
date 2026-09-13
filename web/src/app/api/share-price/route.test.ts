// Colocated tests for GET /api/share-price (S26-B).
//
//   - 401 unauthenticated; 404 no project; viewer allowed; non-member 404
//   - SVI account read through scope.dataEmail (the OWNER's email for a member)
//   - fully diluted = shareholders + esop_pool of the OWNER for the project
//   - connected Stripe MRR → ARR × sector multiple blend, label "from Stripe, 3 Sep"
//   - no signals → SVI-only; no cap table → no_shares (zero price, no NaN)
//   - stale signal (> 90 d) ignored

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", plan: "founder_free" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

const revenue = vi.hoisted(() => ({ signals: [] as unknown[] }));
vi.mock("@/lib/connected-revenue", () => ({ loadConnectedRevenueSignals: async () => revenue.signals }));

import { GET, mapStage } from "./route";
import { computeValuation } from "@/lib/valuation";
import { vcBenchmark } from "@/lib/agents/cfo-valuation";


function seed(over: Record<string, Array<Record<string, unknown>>> = {}, owner = "user-caller") {
  db.sb = fakeSupabase({
    svi_snapshots: [{ dimension_scores: { ftv: 60, mpc: 55, ptd: 50, tre: 40, cgh: 50, iri: 45, lco: 50, svm: 55 } }],
    shareholders: [
      { account_id: owner, project_id: "proj-1", shares_held: 6_000_000 },
      { account_id: owner, project_id: "proj-1", shares_held: 3_000_000 },
      // another project's / another owner's rows never count
      { account_id: owner, project_id: "proj-other", shares_held: 99_000_000 },
      { account_id: "someone-else", project_id: "proj-1", shares_held: 99_000_000 },
    ],
    esop_pool: [{ account_id: owner, project_id: "proj-1", total_pool_shares: 1_000_000 }],
    ...over,
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState({ account: { id: "acct-1", current_svi: 120, current_stage: 2 }, projectExtra: { industry: "saas" } }));
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  revenue.signals = [];
  seed();
}

async function call() {
  const res = await GET();
  return { status: res.status, json: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe("GET /api/share-price", () => {
  beforeEach(reset);

  it("401 unauthenticated, 404 without a project, 404 for a non-member", async () => {
    auth.user = null;
    expect((await call()).status).toBe(401);
    reset();
    scopeState.projectId = null;
    expect((await call()).status).toBe(404);
    reset();
    scopeState.nonMember = true;
    expect((await call()).status).toBe(404);
  });

  it("SVI only: reads the OWNER's SVI account for a viewer and divides by issued + ESOP pool", async () => {
    scopeState.role = "viewer";
    seed({}, "user-owner");
    const { status, json } = await call();
    expect(status).toBe(200);
    expect(scopeState.lastMinRole).toBe("viewer");
    const acct = scopeState.calls.find((c) => c.fn === "findSVIAccountWithFallback");
    expect(acct?.email).toBe("owner@x.test");
    expect(acct?.projectId).toBe("proj-1");
    expect(db.sb!.hasEq("shareholders", "account_id", "user-owner")).toBe(true);
    expect(db.sb!.hasEq("esop_pool", "project_id", "proj-1")).toBe(true);
    expect(json.sharePrice.ok).toBe(true);
    expect(json.sharePrice.method).toBe("svi");
    expect(json.sharePrice.fullyDilutedShares).toBe(10_000_000);
    expect(json.inputs).toMatchObject({ svi: 120, stage: "validation", issuedShares: 9_000_000, esopPoolShares: 1_000_000, arrAud: null, source: null });
    const v = computeValuation({ sviScore: 120, stage: "validation", sector: "saas", dimensions: { ftv: 60, mpc: 55, ptd: 50, tre: 40, cgh: 50, iri: 45, lco: 50, svm: 55 } });
    expect(json.sharePrice.valuation.midAud).toBe(Math.round(v.midAud));
    expect(json.sharePrice.pricePerShare.midAud).toBeCloseTo(v.midAud / 10_000_000, 5);
  });

  it("connected Stripe MRR: ARR × saas multiple blended 40/60, label from Stripe with the capture date", async () => {
    revenue.signals = [{ provider: "stripe", mrrAud: 20_000, capturedAt: "2026-09-03T02:00:00Z" }];
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T00:00:00Z"));
    try {
      const { json } = await call();
      expect(json.sharePrice.method).toBe("svi+arr_multiple");
      expect(json.inputs.arrAud).toBe(240_000);
      expect(json.inputs.source).toEqual({ provider: "stripe", capturedAt: "2026-09-03T02:00:00Z", mrrAud: 20_000 });
      expect(json.sharePrice.sourceLabel).toBe("SVI + ARR multiple (from Stripe, 3 Sep)");
      expect(json.sharePrice.multiple.sector).toBe("saas");
      expect(json.sharePrice.arrValuation.midAud).toBe(Math.round(240_000 * vcBenchmark("saas").arrMultiple.mid));
      expect(json.sharePrice.weights).toEqual({ svi: 0.4, arr: 0.6 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("a stale signal (> 90 days) is ignored → SVI only", async () => {
    revenue.signals = [{ provider: "xero", mrrAud: 20_000, capturedAt: "2020-01-01T00:00:00Z" }];
    const { json } = await call();
    expect(json.sharePrice.method).toBe("svi");
    expect(json.inputs.arrAud).toBeNull();
  });

  it("empty cap table → no_shares with a zero price and no NaN; no SVI account and no revenue → no_valuation", async () => {
    seed({ shareholders: [], esop_pool: [] });
    const { json } = await call();
    expect(json.sharePrice.ok).toBe(false);
    expect(json.sharePrice.reason).toBe("no_shares");
    expect(JSON.stringify(json)).not.toMatch(/NaN|Infinity/);

    scopeState.account = null;
    seed();
    const none = await call();
    expect(none.json.sharePrice.reason).toBe("no_valuation");
    expect(none.json.inputs.svi).toBeNull();
    expect(none.json.inputs.stage).toBe("idea");
  });

  it("mapStage mirrors api/valuation", () => {
    expect(mapStage(null)).toBe("idea");
    expect(mapStage(1)).toBe("idea");
    expect(mapStage(2)).toBe("validation");
    expect(mapStage(4)).toBe("mvp");
    expect(mapStage(7)).toBe("growth");
  });
});
