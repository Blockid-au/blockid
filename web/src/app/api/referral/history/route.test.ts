// Unit tests for GET /api/referral/history — P9-referral-history-route-test.
//
// Route lists the current user's individual referral rows for the
// dashboard referral panel. Three exit paths matter:
//   1. anonymous  → 401 {ok:false, error:"Authentication required"}
//   2. supabase unconfigured → 200 {ok:true, referrals:[], total:0}
//   3. db error  → 200 {ok:true, referrals:[], total:0}  (soft-fail)
//   4. happy path → 200 {ok:true, referrals: rows, total: count}
//
// Silent regressions this pins against:
//   - dropping the auth gate and leaking referrals across users (the
//     .eq("referrer_id", user.id) filter is the ONLY tenancy boundary
//     on this table);
//   - swapping .order(desc) for asc and rendering the oldest referrals
//     first in the dashboard panel;
//   - dropping .limit(50) and streaming a million-row payload back;
//   - swapping the soft-fail branches (unconfigured / db error) to a
//     5xx and breaking the referral panel for every founder in dev
//     when the env is intentionally stripped.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET, dynamic } from "./route";

interface FakeState {
  data: Record<string, unknown>[] | null;
  count: number | null;
  error: { message: string } | null;
  table: string | null;
  selectCols: string | null;
  selectOpts: { count?: string } | null;
  eqCol: string | null;
  eqVal: unknown;
  orderCol: string | null;
  orderOpts: { ascending?: boolean } | null;
  limitN: number | null;
  fromCalls: number;
  selectCalls: number;
  eqCalls: number;
  orderCalls: number;
  limitCalls: number;
}

const state: FakeState = {
  data: [],
  count: 0,
  error: null,
  table: null,
  selectCols: null,
  selectOpts: null,
  eqCol: null,
  eqVal: null,
  orderCol: null,
  orderOpts: null,
  limitN: null,
  fromCalls: 0,
  selectCalls: 0,
  eqCalls: 0,
  orderCalls: 0,
  limitCalls: 0,
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      state.table = table;
      return {
        select(cols: string, opts?: { count?: string }) {
          state.selectCalls += 1;
          state.selectCols = cols;
          state.selectOpts = opts ?? null;
          return {
            eq(col: string, val: unknown) {
              state.eqCalls += 1;
              state.eqCol = col;
              state.eqVal = val;
              return {
                order(col2: string, opts2?: { ascending?: boolean }) {
                  state.orderCalls += 1;
                  state.orderCol = col2;
                  state.orderOpts = opts2 ?? null;
                  return {
                    limit(n: number) {
                      state.limitCalls += 1;
                      state.limitN = n;
                      return Promise.resolve({
                        data: state.data,
                        count: state.count,
                        error: state.error,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function resetState() {
  state.data = [];
  state.count = 0;
  state.error = null;
  state.table = null;
  state.selectCols = null;
  state.selectOpts = null;
  state.eqCol = null;
  state.eqVal = null;
  state.orderCol = null;
  state.orderOpts = null;
  state.limitN = null;
  state.fromCalls = 0;
  state.selectCalls = 0;
  state.eqCalls = 0;
  state.orderCalls = 0;
  state.limitCalls = 0;
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

describe("GET /api/referral/history — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user results never prerender', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/referral/history — anonymous branch", () => {
  it("returns 401 {ok:false, error:'Authentication required'} when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "Authentication required",
    });
  });

  it("does NOT touch supabase on the anonymous branch (guard short-circuits before getSupabaseAdmin)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });
});

describe("GET /api/referral/history — supabase-unconfigured branch", () => {
  it("returns 200 {ok:true, referrals:[], total:0} when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, referrals: [], total: 0 });
  });

  it("does NOT throw or 500 when env is unconfigured (soft-fail for the dashboard panel)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(state.fromCalls).toBe(0);
  });
});

describe("GET /api/referral/history — happy path", () => {
  it("returns 200 {ok:true, referrals: rows, total: count} on a clean fetch", async () => {
    state.data = [
      {
        id: "r1",
        referred_email: "a@x.com",
        status: "signed_up",
        credits_awarded: 50,
        created_at: "2026-07-30T00:00:00Z",
      },
      {
        id: "r2",
        referred_email: "b@x.com",
        status: "pending",
        credits_awarded: 0,
        created_at: "2026-07-29T00:00:00Z",
      },
    ];
    state.count = 2;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      referrals: state.data,
      total: 2,
    });
  });

  it("queries the referrals table (not a rename like referral or referral_events)", async () => {
    await GET();
    expect(state.table).toBe("referrals");
  });

  it("selects exactly the 5 dashboard-panel columns (widening the SELECT bloats the payload; narrowing it breaks the panel)", async () => {
    await GET();
    expect(state.selectCols).toBe(
      "id, referred_email, status, credits_awarded, created_at",
    );
  });

  it("passes { count: 'exact' } so the panel can render a total distinct from the returned slice", async () => {
    await GET();
    expect(state.selectOpts).toEqual({ count: "exact" });
  });

  it("filters by referrer_id = current user (the ONLY tenancy boundary on this table — dropping this filter leaks referrals across founders)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "founder-42",
      email: "f@x.com",
    });
    await GET();
    expect(state.eqCol).toBe("referrer_id");
    expect(state.eqVal).toBe("founder-42");
  });

  it("orders by created_at descending so the newest referral is first in the panel", async () => {
    await GET();
    expect(state.orderCol).toBe("created_at");
    expect(state.orderOpts).toEqual({ ascending: false });
  });

  it("caps the result at 50 rows (page-size contract for the dashboard panel)", async () => {
    await GET();
    expect(state.limitN).toBe(50);
  });

  it("makes exactly one from/select/eq/order/limit chain (no wasted round-trip)", async () => {
    await GET();
    expect(state.fromCalls).toBe(1);
    expect(state.selectCalls).toBe(1);
    expect(state.eqCalls).toBe(1);
    expect(state.orderCalls).toBe(1);
    expect(state.limitCalls).toBe(1);
  });

  it("returns rows verbatim (no server-side transform or field renaming)", async () => {
    state.data = [
      {
        id: "r9",
        referred_email: "V@x.com",
        status: "converted",
        credits_awarded: 250,
        created_at: "2026-07-01T12:34:56Z",
        extra_leak: "should-not-appear-if-server-narrows",
      },
    ];
    state.count = 1;
    const body = await (await GET()).json();
    expect(body.referrals[0]).toEqual(state.data[0]);
    expect(body.referrals[0].extra_leak).toBe(
      "should-not-appear-if-server-narrows",
    );
  });

  it("returns total = count from supabase, not referrals.length (a count-only query can outrun the row slice)", async () => {
    state.data = [
      {
        id: "r1",
        referred_email: "a@x.com",
        status: "pending",
        credits_awarded: 0,
        created_at: "2026-07-30T00:00:00Z",
      },
    ];
    state.count = 137;
    const body = await (await GET()).json();
    expect(body.referrals).toHaveLength(1);
    expect(body.total).toBe(137);
  });

  it("coerces a null data payload to [] and null count to 0 (dashboard renderer expects arrays + numbers)", async () => {
    state.data = null;
    state.count = null;
    const body = await (await GET()).json();
    expect(body).toEqual({ ok: true, referrals: [], total: 0 });
  });

  it("returns ok:true even when supabase yields zero rows for a founder with no referrals", async () => {
    state.data = [];
    state.count = 0;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, referrals: [], total: 0 });
  });
});

describe("GET /api/referral/history — db error branch", () => {
  it("returns 200 {ok:true, referrals:[], total:0} on a supabase error (soft-fail for the panel)", async () => {
    state.error = { message: "boom" };
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, referrals: [], total: 0 });
  });

  it("does NOT surface the underlying db error message (leak-safe soft-fail)", async () => {
    state.error = { message: "invalid input syntax for type uuid" };
    const body = await (await GET()).json();
    expect(JSON.stringify(body)).not.toContain("invalid input");
    expect(body.ok).toBe(true);
  });

  it("still ran the full query chain when a db error is surfaced (the error is DB-authoritative, not a routing short-circuit)", async () => {
    state.error = { message: "boom" };
    await GET();
    expect(state.fromCalls).toBe(1);
    expect(state.limitCalls).toBe(1);
  });

  it("returns [] on error even if driver populates data alongside error (defensive on driver behaviour)", async () => {
    state.data = [
      {
        id: "leaked",
        referred_email: "l@x.com",
        status: "converted",
        credits_awarded: 999,
        created_at: "2026-07-30T00:00:00Z",
      },
    ];
    state.count = 1;
    state.error = { message: "explosion" };
    const body = await (await GET()).json();
    expect(body.referrals).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe("GET /api/referral/history — response envelope", () => {
  it("wraps every response in an {ok, ...} envelope so the client can branch on a single field", async () => {
    const anon = await (await GET.call(null)).json().catch(() => null);
    // rerun with fresh mock states
    getCurrentUserMock.mockResolvedValue(null);
    const anonBody = await (await GET()).json();
    expect(anonBody.ok).toBe(false);

    getCurrentUserMock.mockResolvedValue({ id: "u", email: "e@x.com" });
    getSupabaseAdminMock.mockReturnValue(null);
    const softBody = await (await GET()).json();
    expect(softBody.ok).toBe(true);

    // silence "unused" complaint on anon
    expect(anon === null || typeof anon === "object").toBe(true);
  });
});
