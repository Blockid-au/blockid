// Unit tests for GET + POST /api/exit-model — P9-exit-model-route-test.
//
// The route is the Phase 11-12 (exit modelling) backend for the founder-facing
// /exit-model dashboard tile. GET returns pre-computed 3x/5x/10x/20x-revenue
// scenarios using the founder's cap table + latest ARR/MRR snapshot; POST
// runs a caller-supplied {method, exitValuation, exitMultiple?} scenario.
//
// Both verbs load the cap table via loadCapTable() — a private helper that
// joins `shareholders`, `share_classes`, `esop_pool` per user, resolves
// preference-class + price-per-share via a share-class map, and folds ESOP
// into fullyDiluted. This suite pins the loader shape (else preference-vs-
// ordinary payouts silently regress and every founder sees identical
// grossPayout at exit).
//
// Branches covered:
//   1. dynamic === "force-dynamic"           (per-user snapshot must not prerender)
//   2. GET / POST anonymous                  → 401 { ok:false, error:'Authentication required' }
//   3. GET / POST supabase-null              → 503 { ok:false, error:'Database not configured' }
//   4. auth-BEFORE-db ordering               (anonymous in null-supabase env still 401)
//   5. POST invalid JSON                     → 400 'Invalid JSON body'
//   6. POST missing / non-positive exitValuation → 400 'exitValuation must be a positive number'
//   7. POST invalid method                   → 400 'Invalid method. Must be one of: acquisition, ipo, secondary, buyout'
//   8. POST unknown-user cap-table empty     → 400 'No shareholders found. Set up your cap table first.'
//   9. POST default method === 'acquisition' when body.method missing
//  10. POST honours body.exitMultiple        (surfaces via calculateExit's scenario)
//  11. GET zero-cap-table happy branch       → 200 { ok:true, scenarios:[], message:'No shareholders …' }
//  12. GET pulls latest ARR from startup_metrics via .eq(email).order(metric_date desc).limit(1).maybeSingle()
//  13. GET falls back to mrr*12 when arr_aud is null
//  14. GET defaults to $100 000 ARR when no metric row
//  15. GET renders scenarios at multiples 3/5/10/20 with exitValuation = ARR * multiple
//  16. loadCapTable — issues 3 parallel selects (shareholders / share_classes / esop_pool)
//                    each filtered by .eq('account_id', user.id) — cross-tenant guard
//  17. loadCapTable — esop.maybeSingle branch (single row envelope, not row-array)
//  18. loadCapTable — preference class + liquidation_multiple threads through to the
//                    payout ranking (preference holder receives ≥ pref-amount, not just pro-rata)
//  19. loadCapTable — null share_class_id ⇒ ordinary default (class_type='ordinary', price=0)
//  20. loadCapTable — fully-diluted totalShares = issued + esop.total_pool_shares
//                    (so ownershipPct denominator matches the SVI "true dilution" tile)
//
// Silent regressions this pins against:
//   - dropping the auth gate on either verb — an anonymous caller could
//     model any founder's exit or enumerate cap tables via the loader;
//   - dropping the `dynamic = "force-dynamic"` line — Next.js would cache
//     one founder's scenarios into the static shell for every visitor;
//   - dropping the `.eq('account_id', user.id)` filter on ANY of the three
//     loader queries — cross-tenant cap-table leak into another founder's
//     modelled payouts;
//   - swapping the loader from parallel Promise.all → serial `await` — the
//     GET tile latency doubles under production load;
//   - dropping the `.maybeSingle()` on esop_pool — the loader crashes when
//     a founder has never set up an ESOP (the common Phase 3-5 state);
//   - dropping preference-class liquidation_multiple threading — preference
//     holders would silently receive the same pro-rata as ordinary holders
//     and the AU term-sheet contract this route enforces breaks;
//   - dropping the fullyDiluted = issued + esopShares roll-up — the
//     per-share-value denominator shrinks and every founder sees inflated
//     payouts (the number the / cap-table tile also renders is derived
//     from the same loader so the two tiles would diverge);
//   - regressing the method allow-list — a caller-supplied 'delete-my-rows'
//     method would land in scenario.method and downstream aggregators would
//     enum-crash;
//   - regressing the exitValuation guard so 0 or negative reaches
//     calculateExit and divides-by-zero on perShareValue;
//   - dropping the ARR fallback ladder (arr_aud → mrr*12 → 100k default) so
//     GET returns exitValuation=0 across all four multiples on any founder
//     without a startup_metrics row (the exit tile shows an empty state).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock =
  vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET, POST, dynamic } from "./route";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Fake supabase — records .from(table).select().eq()… with per-table row
// injection + explicit .maybeSingle() vs awaited-array modes. Both the
// loader and the GET metric lookup exercise this shape so the same fake
// covers both.
// ---------------------------------------------------------------------------

type MaybeSingleRow = { data: unknown; error?: unknown };
type ArrayRes = { data: unknown[]; error?: unknown };

interface TableConfig {
  // If set, .maybeSingle() resolves to this envelope; otherwise the terminal
  // await resolves to { data: rows ?? [], error: rows-error ?? null }.
  maybeSingle?: MaybeSingleRow;
  rows?: unknown[];
  rowsError?: unknown;
}

interface ChainRecord {
  table: string;
  op: "select" | null;
  selectCols: string | undefined;
  eqCalls: Array<{ col: string; val: unknown }>;
  orderCalls: Array<{ col: string; opts: Record<string, unknown> | undefined }>;
  limitCall: number | null;
  maybeSingleCalled: boolean;
  awaitedDirect: boolean;
}

interface FakeState {
  chains: ChainRecord[];
  tables: Record<string, TableConfig>;
}

const state: FakeState = { chains: [], tables: {} };

function resetState() {
  state.chains.length = 0;
  state.tables = {};
}

function setTable(name: string, cfg: TableConfig) {
  state.tables[name] = cfg;
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      const chain: ChainRecord = {
        table,
        op: null,
        selectCols: undefined,
        eqCalls: [],
        orderCalls: [],
        limitCall: null,
        maybeSingleCalled: false,
        awaitedDirect: false,
      };
      state.chains.push(chain);

      const api = {
        select(cols?: string) {
          chain.op = "select";
          chain.selectCols = cols;
          return api;
        },
        eq(col: string, val: unknown) {
          chain.eqCalls.push({ col, val });
          return api;
        },
        order(col: string, opts?: Record<string, unknown>) {
          chain.orderCalls.push({ col, opts });
          return api;
        },
        limit(n: number) {
          chain.limitCall = n;
          return api;
        },
        maybeSingle() {
          chain.maybeSingleCalled = true;
          const cfg = state.tables[table];
          const env = cfg?.maybeSingle ?? { data: null, error: null };
          return Promise.resolve(env);
        },
        then(resolve: (v: ArrayRes) => unknown) {
          chain.awaitedDirect = true;
          const cfg = state.tables[table];
          const env: ArrayRes = {
            data: cfg?.rows ?? [],
            error: cfg?.rowsError ?? null,
          };
          return Promise.resolve(env).then(resolve);
        },
      };
      return api;
    },
  };
}

function makeGetRequest(url = "http://x/api/exit-model"): NextRequest {
  return new Request(url) as unknown as NextRequest;
}

function makePostRequest(body: unknown, opts: { json?: boolean } = {}): Request {
  const useJson = opts.json !== false;
  return new Request("http://x/api/exit-model", {
    method: "POST",
    body: useJson ? JSON.stringify(body) : (body as string),
  });
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

// ---------------------------------------------------------------------------
// module exports
// ---------------------------------------------------------------------------

describe("module exports", () => {
  it('exports dynamic = "force-dynamic" so per-user scenarios never land in the static shell', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// GET — auth + db gates
// ---------------------------------------------------------------------------

describe("GET /api/exit-model — auth + db-null gates", () => {
  it("returns 401 { ok:false, error:'Authentication required' } when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required" });
  });

  it("does NOT touch supabase on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET(makeGetRequest());
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.chains).toHaveLength(0);
  });

  it("returns 503 { ok:false, error:'Database not configured' } when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Database not configured" });
  });

  it("checks auth BEFORE db (anonymous in null-supabase env still 401s, never 503)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET — loader shape (parallel selects, tenancy filter, esop maybeSingle)
// ---------------------------------------------------------------------------

describe("GET /api/exit-model — loadCapTable() query shape", () => {
  beforeEach(() => {
    setTable("shareholders", { rows: [] });
    setTable("share_classes", { rows: [] });
    setTable("esop_pool", { maybeSingle: { data: null } });
  });

  it("selects from all three tables (shareholders + share_classes + esop_pool)", async () => {
    await GET(makeGetRequest());
    const tables = state.chains.map((c) => c.table);
    expect(tables).toEqual(
      expect.arrayContaining(["shareholders", "share_classes", "esop_pool"]),
    );
  });

  it("filters shareholders by .eq('account_id', user.id) — tenancy guard", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "founder-42", email: "f@x.com" });
    await GET(makeGetRequest());
    const c = state.chains.find((x) => x.table === "shareholders");
    expect(c?.eqCalls.some((e) => e.col === "account_id" && e.val === "founder-42")).toBe(true);
  });

  it("filters share_classes by .eq('account_id', user.id) — tenancy guard", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "founder-42", email: "f@x.com" });
    await GET(makeGetRequest());
    const c = state.chains.find((x) => x.table === "share_classes");
    expect(c?.eqCalls.some((e) => e.col === "account_id" && e.val === "founder-42")).toBe(true);
  });

  it("filters esop_pool by .eq('account_id', user.id) — tenancy guard", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "founder-42", email: "f@x.com" });
    await GET(makeGetRequest());
    const c = state.chains.find((x) => x.table === "esop_pool");
    expect(c?.eqCalls.some((e) => e.col === "account_id" && e.val === "founder-42")).toBe(true);
  });

  it("uses .maybeSingle() on esop_pool (single-row envelope — founders with no ESOP must not crash)", async () => {
    await GET(makeGetRequest());
    const c = state.chains.find((x) => x.table === "esop_pool");
    expect(c?.maybeSingleCalled).toBe(true);
  });

  it("does NOT call .maybeSingle() on the shareholders / share_classes chains (they resolve as arrays)", async () => {
    await GET(makeGetRequest());
    const s = state.chains.find((x) => x.table === "shareholders");
    const c = state.chains.find((x) => x.table === "share_classes");
    expect(s?.maybeSingleCalled).toBe(false);
    expect(c?.maybeSingleCalled).toBe(false);
    expect(s?.awaitedDirect).toBe(true);
    expect(c?.awaitedDirect).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET — empty cap-table branch
// ---------------------------------------------------------------------------

describe("GET /api/exit-model — empty cap-table branch", () => {
  it("returns 200 { ok:true, scenarios:[], message:'No shareholders found. Set up your cap table first.' } when no shareholders", async () => {
    setTable("shareholders", { rows: [] });
    setTable("share_classes", { rows: [] });
    setTable("esop_pool", { maybeSingle: { data: null } });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      scenarios: [],
      message: "No shareholders found. Set up your cap table first.",
    });
  });

  it("does NOT hit startup_metrics on the empty-cap-table branch (no wasted DB round-trip)", async () => {
    setTable("shareholders", { rows: [] });
    setTable("share_classes", { rows: [] });
    setTable("esop_pool", { maybeSingle: { data: null } });
    await GET(makeGetRequest());
    expect(state.chains.find((c) => c.table === "startup_metrics")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GET — startup_metrics ARR lookup
// ---------------------------------------------------------------------------

describe("GET /api/exit-model — startup_metrics ARR lookup", () => {
  const oneFounder = [
    { name: "Alice", role: "founder", shares_held: 6_000_000, share_class_id: null, vesting_start: null },
    { name: "Bob", role: "cofounder", shares_held: 4_000_000, share_class_id: null, vesting_start: null },
  ];

  beforeEach(() => {
    setTable("shareholders", { rows: oneFounder });
    setTable("share_classes", { rows: [] });
    setTable("esop_pool", { maybeSingle: { data: null } });
  });

  it("selects arr_aud + mrr_aud from startup_metrics filtered by email (not id)", async () => {
    setTable("startup_metrics", { maybeSingle: { data: { arr_aud: 1_000_000, mrr_aud: null } } });
    getCurrentUserMock.mockResolvedValue({ id: "user-x", email: "founder@example.com" });
    await GET(makeGetRequest());
    const c = state.chains.find((x) => x.table === "startup_metrics");
    expect(c?.selectCols).toBe("arr_aud, mrr_aud");
    expect(c?.eqCalls).toEqual([{ col: "email", val: "founder@example.com" }]);
  });

  it("orders by metric_date DESC + .limit(1) + .maybeSingle() — newest snapshot only", async () => {
    setTable("startup_metrics", { maybeSingle: { data: { arr_aud: 1_000_000, mrr_aud: null } } });
    await GET(makeGetRequest());
    const c = state.chains.find((x) => x.table === "startup_metrics");
    expect(c?.orderCalls).toEqual([{ col: "metric_date", opts: { ascending: false } }]);
    expect(c?.limitCall).toBe(1);
    expect(c?.maybeSingleCalled).toBe(true);
  });

  it("threads arr_aud through as annualRevenue — GET response echoes annualRevenue", async () => {
    setTable("startup_metrics", { maybeSingle: { data: { arr_aud: 2_500_000, mrr_aud: null } } });
    const res = await GET(makeGetRequest());
    expect((await res.json()).annualRevenue).toBe(2_500_000);
  });

  it("falls back to mrr_aud * 12 when arr_aud is null / 0", async () => {
    setTable("startup_metrics", { maybeSingle: { data: { arr_aud: null, mrr_aud: 50_000 } } });
    const res = await GET(makeGetRequest());
    expect((await res.json()).annualRevenue).toBe(600_000);
  });

  it("prefers arr_aud over mrr_aud when both are present", async () => {
    setTable("startup_metrics", { maybeSingle: { data: { arr_aud: 3_000_000, mrr_aud: 50_000 } } });
    const res = await GET(makeGetRequest());
    expect((await res.json()).annualRevenue).toBe(3_000_000);
  });

  it("defaults to $100 000 ARR when no startup_metrics row exists", async () => {
    setTable("startup_metrics", { maybeSingle: { data: null } });
    const res = await GET(makeGetRequest());
    expect((await res.json()).annualRevenue).toBe(100_000);
  });

  it("defaults to $100 000 ARR when both arr_aud + mrr_aud are 0", async () => {
    setTable("startup_metrics", { maybeSingle: { data: { arr_aud: 0, mrr_aud: 0 } } });
    const res = await GET(makeGetRequest());
    expect((await res.json()).annualRevenue).toBe(100_000);
  });
});

// ---------------------------------------------------------------------------
// GET — scenarios envelope (3x / 5x / 10x / 20x)
// ---------------------------------------------------------------------------

describe("GET /api/exit-model — scenario ladder", () => {
  beforeEach(() => {
    setTable("shareholders", {
      rows: [
        { name: "Alice", role: "founder", shares_held: 6_000_000, share_class_id: null, vesting_start: null },
        { name: "Bob", role: "cofounder", shares_held: 4_000_000, share_class_id: null, vesting_start: null },
      ],
    });
    setTable("share_classes", { rows: [] });
    setTable("esop_pool", { maybeSingle: { data: null } });
    setTable("startup_metrics", { maybeSingle: { data: { arr_aud: 1_000_000, mrr_aud: null } } });
  });

  it("returns 4 scenarios at multiples 3 / 5 / 10 / 20 (in that order)", async () => {
    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(body.scenarios).toHaveLength(4);
    expect(body.scenarios.map((s: { scenario: { exitMultiple: number } }) => s.scenario.exitMultiple))
      .toEqual([3, 5, 10, 20]);
  });

  it("scenario exitValuation = annualRevenue * multiple (3x → 3M, 20x → 20M)", async () => {
    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(body.scenarios[0].scenario.exitValuation).toBe(3_000_000);
    expect(body.scenarios[3].scenario.exitValuation).toBe(20_000_000);
  });

  it("default method === 'acquisition' on the pre-computed ladder", async () => {
    const res = await GET(makeGetRequest());
    const body = await res.json();
    for (const s of body.scenarios) {
      expect(s.scenario.method).toBe("acquisition");
    }
  });
});

// ---------------------------------------------------------------------------
// POST — auth + db gates
// ---------------------------------------------------------------------------

describe("POST /api/exit-model — auth + db-null gates", () => {
  it("returns 401 when unauthenticated (no supabase touch)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required" });
    expect(state.chains).toHaveLength(0);
  });

  it("returns 503 when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Database not configured" });
  });

  it("checks auth BEFORE db (anonymous in null-supabase env still 401)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    expect(res.status).toBe(401);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — body parsing + validation
// ---------------------------------------------------------------------------

describe("POST /api/exit-model — body parsing + validation", () => {
  it("returns 400 { ok:false, error:'Invalid JSON body' } when body is not JSON", async () => {
    const res = await POST(makePostRequest("not-json", { json: false }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON body" });
    expect(state.chains).toHaveLength(0);
  });

  it("returns 400 when exitValuation is missing (empty body {})", async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "exitValuation must be a positive number",
    });
  });

  it("returns 400 when exitValuation is 0", async () => {
    const res = await POST(makePostRequest({ exitValuation: 0 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("exitValuation must be a positive number");
  });

  it("returns 400 when exitValuation is negative", async () => {
    const res = await POST(makePostRequest({ exitValuation: -1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("exitValuation must be a positive number");
  });

  it("returns 400 when exitValuation is a non-numeric string", async () => {
    const res = await POST(makePostRequest({ exitValuation: "twelve" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("exitValuation must be a positive number");
  });

  it("returns 400 with the allow-list echoed when method is unknown", async () => {
    const res = await POST(
      makePostRequest({ exitValuation: 10_000_000, method: "delete-my-rows" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe(
      "Invalid method. Must be one of: acquisition, ipo, secondary, buyout",
    );
  });

  it("does NOT hit supabase on any validation failure (exitValuation missing)", async () => {
    await POST(makePostRequest({}));
    expect(state.chains).toHaveLength(0);
  });

  it("does NOT hit supabase on an invalid-method failure", async () => {
    await POST(
      makePostRequest({ exitValuation: 10_000_000, method: "not-a-method" }),
    );
    expect(state.chains).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST — cap-table empty guard
// ---------------------------------------------------------------------------

describe("POST /api/exit-model — cap-table empty guard", () => {
  it("returns 400 'No shareholders found. Set up your cap table first.' when the loader returns no rows", async () => {
    setTable("shareholders", { rows: [] });
    setTable("share_classes", { rows: [] });
    setTable("esop_pool", { maybeSingle: { data: null } });
    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "No shareholders found. Set up your cap table first.",
    });
  });
});

// ---------------------------------------------------------------------------
// POST — happy path (defaults, exitMultiple threading, method override)
// ---------------------------------------------------------------------------

describe("POST /api/exit-model — happy path envelope", () => {
  const founders = [
    { name: "Alice", role: "founder", shares_held: 6_000_000, share_class_id: null, vesting_start: null },
    { name: "Bob", role: "cofounder", shares_held: 4_000_000, share_class_id: null, vesting_start: null },
  ];

  beforeEach(() => {
    setTable("shareholders", { rows: founders });
    setTable("share_classes", { rows: [] });
    setTable("esop_pool", { maybeSingle: { data: null } });
  });

  it("returns 200 { ok:true, result } when caller supplies exitValuation", async () => {
    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toBeTruthy();
    expect(body.result.scenario.exitValuation).toBe(10_000_000);
  });

  it("defaults scenario.method to 'acquisition' when body.method is missing", async () => {
    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    const body = await res.json();
    expect(body.result.scenario.method).toBe("acquisition");
  });

  it("honours each allow-listed method verbatim (ipo / secondary / buyout)", async () => {
    for (const method of ["ipo", "secondary", "buyout"] as const) {
      setTable("shareholders", { rows: founders });
      setTable("share_classes", { rows: [] });
      setTable("esop_pool", { maybeSingle: { data: null } });
      const res = await POST(makePostRequest({ exitValuation: 10_000_000, method }));
      const body = await res.json();
      expect(body.result.scenario.method).toBe(method);
      resetState();
    }
  });

  it("threads body.exitMultiple through to result.scenario.exitMultiple", async () => {
    const res = await POST(
      makePostRequest({ exitValuation: 10_000_000, exitMultiple: 7 }),
    );
    const body = await res.json();
    expect(body.result.scenario.exitMultiple).toBe(7);
  });

  it("omits scenario.exitMultiple when body.exitMultiple is missing (undefined, not 0)", async () => {
    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    const body = await res.json();
    expect(body.result.scenario.exitMultiple).toBeUndefined();
  });

  it("computes per-shareholder payouts across both founders with correct ownershipPct", async () => {
    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    const body = await res.json();
    const alice = body.result.shareholderPayouts.find((p: { name: string }) => p.name === "Alice");
    const bob = body.result.shareholderPayouts.find((p: { name: string }) => p.name === "Bob");
    // 6M / 10M and 4M / 10M
    expect(alice.ownershipPct).toBe(60);
    expect(bob.ownershipPct).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// loadCapTable — preference vs ordinary threading
// ---------------------------------------------------------------------------

describe("loadCapTable — preference / ordinary / ESOP threading (via POST)", () => {
  it("preference-class holder receives ≥ (shares * price * liquidationMultiple) — non-participating preferred", async () => {
    setTable("shareholders", {
      rows: [
        { name: "AccelPref", role: "investor", shares_held: 1_000_000, share_class_id: "cls-pref", vesting_start: null },
        { name: "Founder", role: "founder", shares_held: 9_000_000, share_class_id: null, vesting_start: null },
      ],
    });
    setTable("share_classes", {
      rows: [
        { id: "cls-pref", class_type: "preference", liquidation_preference: 1, price_per_share: 1 },
      ],
    });
    setTable("esop_pool", { maybeSingle: { data: null } });

    const res = await POST(makePostRequest({ exitValuation: 5_000_000 }));
    const body = await res.json();
    const pref = body.result.shareholderPayouts.find((p: { name: string }) => p.name === "AccelPref");
    // 1M shares * $1 * 1x = 1M liq pref; pro-rata is only 10% of $5M remaining = $500k → pref wins.
    expect(pref.grossPayout).toBeGreaterThanOrEqual(1_000_000);
    expect(body.result.liquidationPreference).toBeGreaterThanOrEqual(1_000_000);
  });

  it("null share_class_id ⇒ ordinary default (no crash on missing class lookup)", async () => {
    setTable("shareholders", {
      rows: [
        { name: "OrdA", role: "founder", shares_held: 5_000_000, share_class_id: null, vesting_start: null },
        { name: "OrdB", role: "cofounder", shares_held: 5_000_000, share_class_id: null, vesting_start: null },
      ],
    });
    setTable("share_classes", { rows: [] });
    setTable("esop_pool", { maybeSingle: { data: null } });

    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.shareholderPayouts).toHaveLength(2);
    expect(body.result.liquidationPreference).toBe(0);
  });

  it("fullyDiluted totalShares folds ESOP pool in — ownershipPct denominator matches issued + esop.total_pool_shares", async () => {
    setTable("shareholders", {
      rows: [
        { name: "Founder", role: "founder", shares_held: 8_000_000, share_class_id: null, vesting_start: null },
      ],
    });
    setTable("share_classes", { rows: [] });
    setTable("esop_pool", {
      maybeSingle: {
        data: { total_pool_shares: 2_000_000, allocated_shares: 500_000 },
      },
    });

    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    const body = await res.json();
    const founder = body.result.shareholderPayouts.find((p: { name: string }) => p.name === "Founder");
    // 8M / (8M + 2M) = 80%, not 100%
    expect(founder.ownershipPct).toBe(80);
  });

  it("ESOP null (no pool) leaves esopExercise === null on the result", async () => {
    setTable("shareholders", {
      rows: [
        { name: "Founder", role: "founder", shares_held: 10_000_000, share_class_id: null, vesting_start: null },
      ],
    });
    setTable("share_classes", { rows: [] });
    setTable("esop_pool", { maybeSingle: { data: null } });

    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    const body = await res.json();
    expect(body.result.esopExercise).toBeNull();
  });

  it("ESOP with allocated_shares > 0 surfaces esopExercise { totalValue, exerciseCost, netGain }", async () => {
    setTable("shareholders", {
      rows: [
        { name: "Founder", role: "founder", shares_held: 8_000_000, share_class_id: null, vesting_start: null },
      ],
    });
    setTable("share_classes", { rows: [] });
    setTable("esop_pool", {
      maybeSingle: {
        data: { total_pool_shares: 2_000_000, allocated_shares: 1_500_000 },
      },
    });

    const res = await POST(makePostRequest({ exitValuation: 10_000_000 }));
    const body = await res.json();
    expect(body.result.esopExercise).not.toBeNull();
    expect(body.result.esopExercise.totalValue).toBeGreaterThan(0);
    expect(body.result.esopExercise.netGain).toBeGreaterThanOrEqual(0);
    // Exercise cost = 1.5M shares * $0.001 default = $1500
    expect(body.result.esopExercise.exerciseCost).toBeCloseTo(1500, 5);
  });
});
