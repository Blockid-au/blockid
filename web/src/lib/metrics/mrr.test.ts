import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only real-MRR reader
// (`web/src/lib/metrics/mrr.ts`) — the T-1007 canonical CFO/admin MRR
// source. Pins the observable contract used by every caller:
//   - getRealMrrAud: when getSupabaseAdmin() → null (dev without secrets),
//     resolves the ZERO sentinel rather than throwing; when configured,
//     hits `v_mrr_active` + `v_mrr_by_segment` in parallel with the
//     column projections wired below.
//   - centsToAud (via public shape): cents → AUD with Math.round + /100;
//     null/undefined/NaN → 0; string cents coerced via Number.
//   - Aggregations: mrrCents sums across active rows; activeSubs sums
//     active_subs across active rows; ARR = round(MRR × 12 × 100)/100.
//   - bySegment: 1:1 map of segmentRows preserving segment name + subs
//     (Number-coerced null → 0) + AUD-converted cents.
//   - Null-row-safety: when either query returns `data: null`, the
//     downstream reducers treat it as [].
//
// Fake `SupabaseClient` scripts per-table {data,error} shapes off a map
// so the two Promise.all queries can be scripted independently per test.
// `state.adminConfigured=false` returns null from getSupabaseAdmin to
// exercise the ZERO-sentinel guard.

interface FakeState {
  adminConfigured: boolean;
  responses: Record<string, { data: unknown; error?: unknown }>;
  calls: Array<{ table: string; cols: string | null }>;
}

const state: FakeState = {
  adminConfigured: true,
  responses: {},
  calls: [],
};

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = (cols?: string) => {
    state.calls.push({ table, cols: cols ?? null });
    const next = state.responses[table] ?? { data: null };
    return Promise.resolve({ data: next.data ?? null, error: next.error ?? null });
  };
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from: (table: string) => makeChain(table),
    };
  },
}));

beforeEach(() => {
  state.adminConfigured = true;
  state.responses = {};
  state.calls = [];
});

// ---------------------------------------------------------------------------
// null-admin guard
// ---------------------------------------------------------------------------

describe("mrr — null-admin guard", () => {
  it("returns the ZERO sentinel when getSupabaseAdmin() returns null", async () => {
    state.adminConfigured = false;
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out).toEqual({ mrrAud: 0, arrAud: 0, activeSubs: 0, bySegment: [] });
  });

  it("does NOT query any view when admin is null", async () => {
    state.adminConfigured = false;
    const { getRealMrrAud } = await import("./mrr");
    await getRealMrrAud();
    expect(state.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// query wiring
// ---------------------------------------------------------------------------

describe("mrr — query wiring", () => {
  it("hits v_mrr_active with plan_id + active_subs + mrr_cents cols", async () => {
    state.responses["v_mrr_active"] = { data: [] };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    await getRealMrrAud();
    const active = state.calls.find((c) => c.table === "v_mrr_active");
    expect(active).toBeDefined();
    expect(active?.cols).toBe("plan_id, active_subs, mrr_cents");
  });

  it("hits v_mrr_by_segment with segment + active_subs + mrr_cents cols", async () => {
    state.responses["v_mrr_active"] = { data: [] };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    await getRealMrrAud();
    const seg = state.calls.find((c) => c.table === "v_mrr_by_segment");
    expect(seg).toBeDefined();
    expect(seg?.cols).toBe("segment, active_subs, mrr_cents");
  });

  it("fires BOTH view queries in a single Promise.all pass (no ordering assumption)", async () => {
    state.responses["v_mrr_active"] = { data: [] };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    await getRealMrrAud();
    const tables = state.calls.map((c) => c.table).sort();
    expect(tables).toEqual(["v_mrr_active", "v_mrr_by_segment"]);
  });
});

// ---------------------------------------------------------------------------
// aggregation math
// ---------------------------------------------------------------------------

describe("mrr — aggregation", () => {
  it("sums mrr_cents across active rows and converts to AUD", async () => {
    state.responses["v_mrr_active"] = {
      data: [
        { plan_id: "founder", active_subs: 3, mrr_cents: 14900 },
        { plan_id: "pro", active_subs: 2, mrr_cents: 9900 },
      ],
    };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.mrrAud).toBe(248); // (14900 + 9900) / 100
  });

  it("sums active_subs across active rows", async () => {
    state.responses["v_mrr_active"] = {
      data: [
        { plan_id: "a", active_subs: 3, mrr_cents: 100 },
        { plan_id: "b", active_subs: 7, mrr_cents: 100 },
        { plan_id: "c", active_subs: 1, mrr_cents: 100 },
      ],
    };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.activeSubs).toBe(11);
  });

  it("derives arrAud as mrrAud * 12 with 2-decimal rounding", async () => {
    state.responses["v_mrr_active"] = {
      data: [{ plan_id: "x", active_subs: 1, mrr_cents: 4999 }],
    };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    // 4999c → $49.99 MRR → $599.88 ARR
    expect(out.mrrAud).toBe(49.99);
    expect(out.arrAud).toBe(599.88);
  });

  it("returns 0 for everything when both views resolve empty arrays", async () => {
    state.responses["v_mrr_active"] = { data: [] };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out).toEqual({ mrrAud: 0, arrAud: 0, activeSubs: 0, bySegment: [] });
  });
});

// ---------------------------------------------------------------------------
// null / undefined / NaN robustness
// ---------------------------------------------------------------------------

describe("mrr — null and NaN robustness", () => {
  it("treats null active_subs as 0 in the sub sum", async () => {
    state.responses["v_mrr_active"] = {
      data: [
        { plan_id: "a", active_subs: null, mrr_cents: 100 },
        { plan_id: "b", active_subs: 4, mrr_cents: 100 },
      ],
    };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.activeSubs).toBe(4);
  });

  it("treats null mrr_cents as 0 in the mrr sum", async () => {
    state.responses["v_mrr_active"] = {
      data: [
        { plan_id: "a", active_subs: 1, mrr_cents: null },
        { plan_id: "b", active_subs: 1, mrr_cents: 5000 },
      ],
    };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.mrrAud).toBe(50);
  });

  it("falls back to [] when v_mrr_active returns data:null (RPC error shape)", async () => {
    state.responses["v_mrr_active"] = { data: null };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.mrrAud).toBe(0);
    expect(out.activeSubs).toBe(0);
  });

  it("falls back to [] when v_mrr_by_segment returns data:null", async () => {
    state.responses["v_mrr_active"] = { data: [] };
    state.responses["v_mrr_by_segment"] = { data: null };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.bySegment).toEqual([]);
  });

  it("centsToAud → 0 when mrr_cents is NaN (Number.isFinite guard)", async () => {
    state.responses["v_mrr_active"] = {
      data: [{ plan_id: "a", active_subs: 1, mrr_cents: Number.NaN }],
    };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.mrrAud).toBe(0);
    expect(out.arrAud).toBe(0);
  });

  it("coerces string mrr_cents (Postgres numeric-as-string) into the sum", async () => {
    state.responses["v_mrr_active"] = {
      data: [
        { plan_id: "a", active_subs: 1, mrr_cents: "1500" as unknown as number },
        { plan_id: "b", active_subs: 1, mrr_cents: "2500" as unknown as number },
      ],
    };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.mrrAud).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// bySegment shape
// ---------------------------------------------------------------------------

describe("mrr — bySegment mapping", () => {
  it("maps each segment row 1:1 preserving order + segment name", async () => {
    state.responses["v_mrr_active"] = { data: [] };
    state.responses["v_mrr_by_segment"] = {
      data: [
        { segment: "founder", active_subs: 10, mrr_cents: 14900 },
        { segment: "investor", active_subs: 5, mrr_cents: 24900 },
        { segment: "reseller", active_subs: 2, mrr_cents: 4900 },
      ],
    };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.bySegment).toHaveLength(3);
    expect(out.bySegment.map((s) => s.segment)).toEqual(["founder", "investor", "reseller"]);
  });

  it("converts each segment's mrr_cents to AUD via centsToAud", async () => {
    state.responses["v_mrr_active"] = { data: [] };
    state.responses["v_mrr_by_segment"] = {
      data: [
        { segment: "founder", active_subs: 1, mrr_cents: 14900 },
      ],
    };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.bySegment[0].mrrAud).toBe(149);
  });

  it("Number-coerces null active_subs on a segment row to 0", async () => {
    state.responses["v_mrr_active"] = { data: [] };
    state.responses["v_mrr_by_segment"] = {
      data: [{ segment: "founder", active_subs: null, mrr_cents: 0 }],
    };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.bySegment[0].subs).toBe(0);
  });

  it("returns bySegment: [] when segment view is empty", async () => {
    state.responses["v_mrr_active"] = {
      data: [{ plan_id: "a", active_subs: 1, mrr_cents: 100 }],
    };
    state.responses["v_mrr_by_segment"] = { data: [] };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.bySegment).toEqual([]);
  });

  it("independently populates aggregate + bySegment (segments do NOT feed into total MRR)", async () => {
    // Active view drives mrrAud; segment view is a diagnostic breakdown.
    state.responses["v_mrr_active"] = {
      data: [{ plan_id: "founder", active_subs: 2, mrr_cents: 20000 }],
    };
    state.responses["v_mrr_by_segment"] = {
      // Purposely inconsistent segment total to prove it doesn't leak.
      data: [{ segment: "founder", active_subs: 999, mrr_cents: 999900 }],
    };
    const { getRealMrrAud } = await import("./mrr");
    const out = await getRealMrrAud();
    expect(out.mrrAud).toBe(200); // sourced from active view, NOT segments
    expect(out.activeSubs).toBe(2); // sourced from active view, NOT segments
    expect(out.bySegment[0].mrrAud).toBe(9999); // segment view stays independent
    expect(out.bySegment[0].subs).toBe(999);
  });
});
