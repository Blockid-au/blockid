// Colocated vitest for GET + POST + DELETE /api/cap-table — P9-cap-table-route-test.
//
// The `/api/cap-table` collection endpoint powers the founder-facing
// /workspace/cap-table dashboard, feeding the shareholder register + ESOP
// pool + share-class rows into the ASIC s169 register-of-members surface.
// It sits alongside the previously-tested sibling routes:
//   - /api/cap-table/sync      → EVM reconciliation (P9-cap-table-sync-route-test)
//   - /api/cap-table/documents → grant-letter + vesting-agreement DOCX renderer
//                                (P9-cap-table-documents-route-test)
// This suite pins the CRUD half of the surface — the write path a founder
// hits every time they add a shareholder, mint the ESOP pool, issue new
// shares, or edit a founder row before a raise. Silent regressions this
// suite pins against:
//   - dropping the `dynamic = "force-dynamic"` export so per-account
//     cap-table rows land in the static shell and every founder sees the
//     same cached register;
//   - dropping the `.eq("account_id", user.id)` on the ownership pre-check
//     for issue_shares / update_shareholder / DELETE — the final UPDATE /
//     DELETE only filters by id, so the pre-check IS the tenancy boundary;
//   - dropping the project boundary on that same pre-check (S18-A review
//     P1-1) — `.eq("project_id", scope.projectId)` when a project resolves,
//     `.is("project_id", null)` for an owner with no active project — so an
//     editor on project A could mutate the owner's project-B rows by id;
//   - dropping the auth gate on POST or DELETE (a caller could seed / mutate
//     / delete another founder's register by guessing a shareholder id);
//   - dropping the `data.pricePerShare != null` guard on the share_transactions
//     insert so an `add_shareholder` with 0 shares fires an insert with a
//     null price_per_share into a NOT NULL column;
//   - regressing the project-scope guard on GET so a founder with 3 projects
//     sees a union of every cap-table across every project;
//   - regressing the ownership fully-diluted math (esopShares + totalIssued
//     denominator) so a founder sees over-100% ownership after ESOP setup;
//   - dropping the `> 0` guard on setup_esop.totalPoolShares so a 0-share
//     pool silently upserts and breaks the fully-diluted denominator;
//   - dropping the `shares > 0` guard on issue_shares so a caller can fire
//     a 0-share issuance and pollute the share_transactions ledger with
//     empty rows;
//   - dropping the `!== null` guard on the update_shareholder payload
//     assembly so a caller with `{email:null}` blanks the row's email
//     instead of no-oping;
//   - swapping the `esop_pool` upsert `onConflict:"account_id,project_id"`
//     (S18-A review P2-4 / migration 0334) — back to `account_id` alone and
//     the second project's setup overwrites + relabels the first project's
//     pool; dropped entirely and a founder ends up with N rows per project;
//   - dropping the transaction-cascade DELETE on share_transactions so
//     removing a shareholder leaves orphan transaction rows;
//   - regressing the fully-diluted % rounding — 4dp regressions would
//     re-order the founder-facing register vs the DOCX register.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE the SUT import so the module picks them up.
// ---------------------------------------------------------------------------

type SessionUser = { id: string; email: string };

const getCurrentUserMock = vi.fn<() => Promise<SessionUser | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

type GateResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };
const gateMock = vi.fn<(feature: string) => Promise<GateResult>>();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
// S18-A — member-aware scope on top of the existing project-id spy: the
// route now calls getProjectScope(minRole); owner → data keyed on the
// caller, member → keyed on the OWNER (owner@x.test / owner-1).
const scopeRole = vi.hoisted(() => ({ value: "owner" as "owner" | "admin" | "editor" | "viewer" }));
vi.mock("@/lib/projects", async () => {
  const { scopeAdapter } = await import("@/test/project-scope-mock");
  return scopeAdapter(() => getProjectIdFromRequestMock(), scopeRole, {
    callerEmail: "u@x.com",
    callerId: "user-1",
  });
});

// ---------------------------------------------------------------------------
// Fake supabase — records .from(t).select/insert/update/delete/upsert().eq()
// .or().order().single()/.maybeSingle()/awaited-direct.
// ---------------------------------------------------------------------------

interface ChainRecord {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert" | null;
  payload: unknown;
  upsertOpts: Record<string, unknown> | undefined;
  selectCols: string | undefined;
  eqCalls: Array<{ col: string; val: unknown }>;
  isCalls: Array<{ col: string; val: unknown }>;
  orderCalls: Array<{ col: string; opts: Record<string, unknown> | undefined }>;
  orCalls: string[];
  singleCalled: boolean;
  maybeSingleCalled: boolean;
  awaitedDirect: boolean;
}

interface FakeResult {
  data: unknown;
  error: unknown;
}
interface FakeState {
  chains: ChainRecord[];
  results: FakeResult[];
  // Per-table override queue — resolves out-of-order concurrent Promise.all
  // shape (share_classes / shareholders / esop_pool run in parallel) so a
  // test can pin the response for a specific table without depending on
  // JavaScript's expression-evaluation order.
  perTable: Map<string, FakeResult[]>;
}

const state: FakeState = { chains: [], results: [], perTable: new Map() };

function nextResult(table?: string): FakeResult {
  if (table) {
    const q = state.perTable.get(table);
    if (q && q.length) return q.shift()!;
  }
  return state.results.shift() ?? { data: null, error: null };
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      const chain: ChainRecord = {
        table,
        op: null,
        payload: null,
        upsertOpts: undefined,
        selectCols: undefined,
        eqCalls: [],
        isCalls: [],
        orderCalls: [],
        orCalls: [],
        singleCalled: false,
        maybeSingleCalled: false,
        awaitedDirect: false,
      };
      state.chains.push(chain);

      const api = {
        select(cols?: string) {
          if (chain.op === null) chain.op = "select";
          chain.selectCols = cols;
          return api;
        },
        insert(payload: unknown) {
          chain.op = "insert";
          chain.payload = payload;
          return api;
        },
        update(payload: unknown) {
          chain.op = "update";
          chain.payload = payload;
          return api;
        },
        delete() {
          chain.op = "delete";
          return api;
        },
        upsert(payload: unknown, opts?: Record<string, unknown>) {
          chain.op = "upsert";
          chain.payload = payload;
          chain.upsertOpts = opts;
          return api;
        },
        eq(col: string, val: unknown) {
          chain.eqCalls.push({ col, val });
          return api;
        },
        is(col: string, val: unknown) {
          chain.isCalls.push({ col, val });
          return api;
        },
        or(filter: string) {
          chain.orCalls.push(filter);
          return api;
        },
        order(col: string, opts?: Record<string, unknown>) {
          chain.orderCalls.push({ col, opts });
          return api;
        },
        single() {
          chain.singleCalled = true;
          return Promise.resolve(nextResult(table));
        },
        maybeSingle() {
          chain.maybeSingleCalled = true;
          return Promise.resolve(nextResult(table));
        },
        then(resolve: (v: FakeResult) => unknown) {
          chain.awaitedDirect = true;
          return Promise.resolve(nextResult(table)).then(resolve);
        },
      };
      return api;
    },
  };
}

function resetState() {
  state.chains.length = 0;
  state.results.length = 0;
  state.perTable.clear();
}

function queue(...items: FakeResult[]) {
  state.results.push(...items);
}

function queueFor(table: string, ...items: FakeResult[]) {
  const q = state.perTable.get(table) ?? [];
  q.push(...items);
  state.perTable.set(table, q);
}

// GET runs the three tables in parallel via Promise.all — this helper
// dispatches per-table so the test isn't order-dependent on JavaScript's
// array-expression eval order (see `.maybeSingle()` synchronously pulling
// its result at expression time vs `.order()` deferring to `.then`).
function queueGet(
  classes: FakeResult,
  holders: FakeResult,
  esop: FakeResult,
) {
  queueFor("share_classes", classes);
  queueFor("shareholders", holders);
  queueFor("esop_pool", esop);
}

function findChain(table: string, op?: ChainRecord["op"]): ChainRecord | undefined {
  return state.chains.find(
    (c) => c.table === table && (op === undefined || c.op === op),
  );
}

// ---------------------------------------------------------------------------
// SUT import — after mocks so the module picks up the mocked deps.
// ---------------------------------------------------------------------------

import { DELETE, GET, POST, dynamic } from "./route";
import type { NextRequest } from "next/server";

function makeReq(body?: unknown, method: string = "POST"): Request {
  return new Request("http://x/api/cap-table", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });
}

function makeRawReq(rawBody: string, method: string = "POST"): Request {
  return new Request("http://x/api/cap-table", {
    method,
    body: rawBody,
    headers: { "content-type": "application/json" },
  });
}

const USER: SessionUser = { id: "user-1", email: "u@x.com" };

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  gateMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getProjectIdFromRequestMock.mockReset();
  getCurrentUserMock.mockResolvedValue(USER);
  gateMock.mockResolvedValue({ ok: true, user: USER });
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
  getProjectIdFromRequestMock.mockResolvedValue(null);
});

// ===========================================================================
// module exports
// ===========================================================================

describe("module exports", () => {
  it('exports dynamic = "force-dynamic" so per-account cap-table rows never land in the static shell', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ===========================================================================
// GET /api/cap-table
// ===========================================================================

describe("GET /api/cap-table — auth + db gates", () => {
  it("returns 401 { ok:false, error:'Authentication required' } when getCurrentUser() is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET({} as NextRequest);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required" });
  });

  it("does NOT touch supabase on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET({} as NextRequest);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.chains).toHaveLength(0);
  });

  it("returns 503 { ok:false, error:'Database not configured' } when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET({} as NextRequest);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Database not configured" });
  });

  it("checks auth BEFORE db (anonymous in null-supabase env still 401s, never 503)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET({} as NextRequest);
    expect(res.status).toBe(401);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cap-table — chain shape + tenancy", () => {
  it("queries share_classes, shareholders, esop_pool in parallel via Promise.all", async () => {
    queueGet(
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
    );
    await GET({} as NextRequest);
    const tables = state.chains.map((c) => c.table).sort();
    expect(tables).toEqual(["esop_pool", "share_classes", "shareholders"]);
  });

  it("filters each table by account_id = current user id (the ONLY tenancy boundary)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "founder-42", email: "f@x.com" });
    queueGet(
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
    );
    await GET({} as NextRequest);
    for (const c of state.chains) {
      const acc = c.eqCalls.find((e) => e.col === "account_id");
      expect(acc?.val).toBe("founder-42");
    }
  });

  it("does NOT add a project_id filter when getProjectIdFromRequest resolves null", async () => {
    getProjectIdFromRequestMock.mockResolvedValue(null);
    queueGet(
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
    );
    await GET({} as NextRequest);
    for (const c of state.chains) {
      const p = c.eqCalls.find((e) => e.col === "project_id");
      expect(p).toBeUndefined();
    }
  });

  it("adds .eq('project_id', pid) to every table when getProjectIdFromRequest returns a pid", async () => {
    getProjectIdFromRequestMock.mockResolvedValue("proj-xyz");
    queueGet(
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
    );
    await GET({} as NextRequest);
    for (const c of state.chains) {
      const p = c.eqCalls.find((e) => e.col === "project_id");
      expect(p?.val).toBe("proj-xyz");
    }
  });

  it("selects '*' from every table so downstream summaries never surprise-drop a column", async () => {
    queueGet(
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
    );
    await GET({} as NextRequest);
    for (const c of state.chains) expect(c.selectCols).toBe("*");
  });

  it("orders share_classes + shareholders by created_at ASC (register chronology, not most-recent-first)", async () => {
    queueGet(
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
    );
    await GET({} as NextRequest);
    const classes = findChain("share_classes");
    const holders = findChain("shareholders");
    expect(classes?.orderCalls).toEqual([{ col: "created_at", opts: { ascending: true } }]);
    expect(holders?.orderCalls).toEqual([{ col: "created_at", opts: { ascending: true } }]);
  });

  it("uses .maybeSingle() on esop_pool (nullable — a founder may not have set up the pool yet)", async () => {
    queueGet(
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
    );
    await GET({} as NextRequest);
    const esop = findChain("esop_pool");
    expect(esop?.maybeSingleCalled).toBe(true);
  });
});

describe("GET /api/cap-table — error path", () => {
  it("returns 500 { ok:false, error:'Failed to fetch cap table' } when any query errors", async () => {
    queueGet(
      { data: null, error: { message: "boom" } },
      { data: [], error: null },
      { data: null, error: null },
    );
    const res = await GET({} as NextRequest);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to fetch cap table" });
  });

  it("does NOT leak the underlying supabase error message into the response body", async () => {
    queueGet(
      { data: null, error: { message: "connection refused: pgbouncer" } },
      { data: [], error: null },
      { data: null, error: null },
    );
    const res = await GET({} as NextRequest);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toContain("pgbouncer");
  });
});

describe("GET /api/cap-table — response envelope + math", () => {
  it("returns 200 { ok:true, shareClasses, shareholders, esopPool, summary } on happy path with empty data", async () => {
    queueGet(
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
    );
    const res = await GET({} as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      shareClasses: [],
      shareholders: [],
      esopPool: null,
      summary: {
        totalAuthorized: 0,
        totalIssued: 0,
        fullyDilutedTotal: 0,
        esopShares: 0,
        esopAvailable: 0,
      },
    });
  });

  it("sums total_authorized across every share_class row", async () => {
    queueGet(
      { data: [{ total_authorized: 1_000_000 }, { total_authorized: 500_000 }], error: null },
      { data: [], error: null },
      { data: null, error: null },
    );
    const res = await GET({} as NextRequest);
    expect((await res.json()).summary.totalAuthorized).toBe(1_500_000);
  });

  it("sums shares_held across every shareholder row (totalIssued)", async () => {
    queueGet(
      { data: [], error: null },
      { data: [{ shares_held: 600_000 }, { shares_held: 400_000 }], error: null },
      { data: null, error: null },
    );
    const res = await GET({} as NextRequest);
    expect((await res.json()).summary.totalIssued).toBe(1_000_000);
  });

  it("coerces string numerics (PostgREST numeric → string) to numbers on both sums", async () => {
    // Supabase returns numeric columns as strings; the route's Number() cast
    // must not concatenate them.
    queueGet(
      { data: [{ total_authorized: "700000" }], error: null },
      { data: [{ shares_held: "300000" }, { shares_held: "200000" }], error: null },
      { data: null, error: null },
    );
    const res = await GET({} as NextRequest);
    const body = await res.json();
    expect(body.summary.totalAuthorized).toBe(700_000);
    expect(body.summary.totalIssued).toBe(500_000);
  });

  it("fully-diluted denominator = totalIssued + esopShares — 900k issued + 100k pool → 1_000_000", async () => {
    queueGet(
      { data: [], error: null },
      { data: [{ shares_held: 900_000 }], error: null },
      { data: { total_pool_shares: 100_000, allocated_shares: 0 }, error: null },
    );
    const res = await GET({} as NextRequest);
    const body = await res.json();
    expect(body.summary.fullyDilutedTotal).toBe(1_000_000);
    expect(body.summary.esopShares).toBe(100_000);
  });

  it("esopAvailable = total_pool_shares - allocated_shares", async () => {
    queueGet(
      { data: [], error: null },
      { data: [], error: null },
      { data: { total_pool_shares: 100_000, allocated_shares: 25_000 }, error: null },
    );
    const res = await GET({} as NextRequest);
    expect((await res.json()).summary.esopAvailable).toBe(75_000);
  });

  it("computes ownership_pct + fully_diluted_pct per shareholder to 2dp against the FD denominator", async () => {
    queueGet(
      { data: [], error: null },
      { data: [{ id: "sh-a", shares_held: 500_000 }, { id: "sh-b", shares_held: 300_000 }], error: null },
      { data: { total_pool_shares: 200_000, allocated_shares: 0 }, error: null },
    );
    const res = await GET({} as NextRequest);
    const body = await res.json();
    // FD total = 500k + 300k + 200k = 1_000_000
    expect(body.shareholders[0].ownership_pct).toBe(50);
    expect(body.shareholders[0].fully_diluted_pct).toBe(50);
    expect(body.shareholders[1].ownership_pct).toBe(30);
    expect(body.shareholders[1].fully_diluted_pct).toBe(30);
  });

  it("returns ownership_pct = 0 for every shareholder when fully-diluted denominator is 0 (no issued + no pool)", async () => {
    queueGet(
      { data: [], error: null },
      { data: [{ id: "sh-a", shares_held: 0 }], error: null },
      { data: null, error: null },
    );
    const res = await GET({} as NextRequest);
    const body = await res.json();
    expect(body.shareholders[0].ownership_pct).toBe(0);
    expect(body.shareholders[0].fully_diluted_pct).toBe(0);
  });

  it("preserves every original shareholder field (spread `...s`) in the enriched row", async () => {
    queueGet(
      { data: [], error: null },
      { data: [{ id: "sh-a", name: "Ava", email: "a@x.com", shares_held: 100 }], error: null },
      { data: null, error: null },
    );
    const res = await GET({} as NextRequest);
    const body = await res.json();
    expect(body.shareholders[0]).toMatchObject({
      id: "sh-a",
      name: "Ava",
      email: "a@x.com",
      shares_held: 100,
    });
  });
});

// ===========================================================================
// POST /api/cap-table — top-level gates
// ===========================================================================

describe("POST /api/cap-table — gate + db", () => {
  it("returns the gate's own response verbatim when gateRequireFeature rejects (401 example)", async () => {
    gateMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "Authentication required" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    });
    const res = await POST(makeReq({ action: "add_class", data: { name: "Ordinary" } }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required" });
    expect(state.chains).toHaveLength(0);
  });

  it("passes the 'share_management' feature key into gateRequireFeature", async () => {
    queue({ data: { id: "cls-1" }, error: null });
    await POST(makeReq({ action: "add_class", data: { name: "Ordinary" } }));
    expect(gateMock).toHaveBeenCalledWith("share_management");
  });

  it("returns 503 { ok:false, error:'Database not configured' } when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(makeReq({ action: "add_class", data: { name: "Ordinary" } }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Database not configured" });
  });

  it("returns 400 { ok:false, error:'Invalid JSON body' } on unparseable JSON", async () => {
    const res = await POST(makeRawReq("{ not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON body" });
    expect(state.chains).toHaveLength(0);
  });

  it("returns 400 { ok:false, error:'action and data are required' } when action is missing", async () => {
    const res = await POST(makeReq({ data: { name: "Ordinary" } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "action and data are required" });
  });

  it("returns 400 { ok:false, error:'action and data are required' } when data is missing", async () => {
    const res = await POST(makeReq({ action: "add_class" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 with `Unknown action: <name>` for an unrecognised action", async () => {
    const res = await POST(makeReq({ action: "delete_universe", data: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Unknown action: delete_universe" });
  });
});

// ===========================================================================
// POST add_class
// ===========================================================================

describe("POST /api/cap-table action=add_class", () => {
  it("returns 400 when name is missing", async () => {
    const res = await POST(makeReq({ action: "add_class", data: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Class name is required" });
    expect(state.chains).toHaveLength(0);
  });

  it("returns 201 { ok:true, shareClass } on happy path", async () => {
    const row = { id: "cls-1", name: "Ordinary" };
    queue({ data: row, error: null });
    const res = await POST(makeReq({ action: "add_class", data: { name: "Ordinary" } }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, shareClass: row });
  });

  it("targets the share_classes table with insert + select().single() chain", async () => {
    queue({ data: { id: "cls-1" }, error: null });
    await POST(makeReq({ action: "add_class", data: { name: "Ordinary" } }));
    const c = findChain("share_classes", "insert");
    expect(c).toBeDefined();
    expect(c?.singleCalled).toBe(true);
  });

  it("stamps account_id from the gated user, plus schema defaults (class_type/total_authorized/price/voting)", async () => {
    queue({ data: { id: "cls-1" }, error: null });
    await POST(makeReq({ action: "add_class", data: { name: "Ordinary" } }));
    const c = findChain("share_classes", "insert");
    expect(c?.payload).toEqual({
      account_id: "user-1",
      project_id: null, // S18-A: stamped so the project-filtered GET sees the row
      name: "Ordinary",
      class_type: "ordinary",
      total_authorized: 10_000_000,
      price_per_share: 0.001,
      voting_rights: true,
      dividend_preference: null,
      liquidation_preference: null,
    });
  });

  it("respects explicit overrides bit-for-bit (classType, totalAuthorized, pricePerShare, votingRights false)", async () => {
    queue({ data: { id: "cls-1" }, error: null });
    await POST(
      makeReq({
        action: "add_class",
        data: {
          name: "Preferred Seed",
          classType: "preferred",
          totalAuthorized: 5_000_000,
          pricePerShare: 1.25,
          votingRights: false,
          dividendPreference: 8,
          liquidationPreference: 1,
        },
      }),
    );
    const c = findChain("share_classes", "insert");
    expect(c?.payload).toMatchObject({
      class_type: "preferred",
      total_authorized: 5_000_000,
      price_per_share: 1.25,
      voting_rights: false,
      dividend_preference: 8,
      liquidation_preference: 1,
    });
  });

  it("returns 500 { ok:false, error:'Failed to add share class' } on insert error", async () => {
    queue({ data: null, error: { message: "unique constraint" } });
    const res = await POST(makeReq({ action: "add_class", data: { name: "Ordinary" } }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to add share class" });
  });
});

// ===========================================================================
// POST add_shareholder
// ===========================================================================

describe("POST /api/cap-table action=add_shareholder", () => {
  it("returns 400 when name is missing", async () => {
    const res = await POST(makeReq({ action: "add_shareholder", data: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Shareholder name is required" });
  });

  it("returns 201 { ok:true, shareholder } on happy path with 0 shares", async () => {
    const row = { id: "sh-1", name: "Ava" };
    queue({ data: row, error: null });
    const res = await POST(
      makeReq({ action: "add_shareholder", data: { name: "Ava" } }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, shareholder: row });
    // 0 shares → no share_transactions insert follows.
    expect(findChain("share_transactions")).toBeUndefined();
  });

  it("stamps account_id + defaults (role='founder', vesting_months=48, cliff_months=12, email=null)", async () => {
    queue({ data: { id: "sh-1" }, error: null });
    await POST(makeReq({ action: "add_shareholder", data: { name: "Ava" } }));
    const c = findChain("shareholders", "insert");
    expect(c?.payload).toEqual({
      account_id: "user-1",
      project_id: null,
      name: "Ava",
      email: null,
      role: "founder",
      share_class_id: null,
      shares_held: 0,
      vesting_start: null,
      vesting_months: 48,
      cliff_months: 12,
      notes: null,
    });
  });

  it("inserts a paired share_transactions row ONLY when sharesHeld > 0 AND shareClassId is present", async () => {
    queue({ data: { id: "sh-1" }, error: null }, { data: null, error: null });
    await POST(
      makeReq({
        action: "add_shareholder",
        data: {
          name: "Ava",
          shareClassId: "cls-1",
          sharesHeld: 1_000,
          pricePerShare: 0.001,
          roundName: "Founding",
        },
      }),
    );
    const tx = findChain("share_transactions", "insert");
    expect(tx).toBeDefined();
    expect(tx?.payload).toMatchObject({
      account_id: "user-1",
      transaction_type: "issue",
      to_shareholder_id: "sh-1",
      share_class_id: "cls-1",
      shares: 1_000,
      price_per_share: 0.001,
      total_value: 1,
      round_name: "Founding",
      notes: "Initial issue to Ava",
    });
  });

  it("does NOT insert a share_transactions row when sharesHeld > 0 but shareClassId is missing", async () => {
    queue({ data: { id: "sh-1" }, error: null });
    await POST(
      makeReq({
        action: "add_shareholder",
        data: { name: "Ava", sharesHeld: 1_000 }, // no shareClassId
      }),
    );
    expect(findChain("share_transactions")).toBeUndefined();
  });

  it("stamps share_transactions.price_per_share = null when caller omits pricePerShare", async () => {
    queue({ data: { id: "sh-1" }, error: null }, { data: null, error: null });
    await POST(
      makeReq({
        action: "add_shareholder",
        data: { name: "Ava", shareClassId: "cls-1", sharesHeld: 100 },
      }),
    );
    const tx = findChain("share_transactions", "insert");
    expect((tx?.payload as Record<string, unknown>).price_per_share).toBeNull();
    expect((tx?.payload as Record<string, unknown>).total_value).toBeNull();
  });

  it("defaults roundName to 'Founding' when the caller omits it", async () => {
    queue({ data: { id: "sh-1" }, error: null }, { data: null, error: null });
    await POST(
      makeReq({
        action: "add_shareholder",
        data: { name: "Ava", shareClassId: "cls-1", sharesHeld: 100 },
      }),
    );
    const tx = findChain("share_transactions", "insert");
    expect((tx?.payload as Record<string, unknown>).round_name).toBe("Founding");
  });

  it("returns 500 { ok:false, error:'Failed to add shareholder' } on shareholders insert error (no tx row follows)", async () => {
    queue({ data: null, error: { message: "boom" } });
    const res = await POST(
      makeReq({ action: "add_shareholder", data: { name: "Ava", shareClassId: "cls-1", sharesHeld: 100 } }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to add shareholder" });
    expect(findChain("share_transactions")).toBeUndefined();
  });
});

// ===========================================================================
// POST issue_shares
// ===========================================================================

describe("POST /api/cap-table action=issue_shares", () => {
  it("returns 400 when shareholderId is missing", async () => {
    const res = await POST(
      makeReq({ action: "issue_shares", data: { shareClassId: "cls-1", shares: 100 } }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "shareholderId, shareClassId, and shares (> 0) are required",
    });
  });

  it("returns 400 when shares is 0 or negative (> 0 guard)", async () => {
    const res = await POST(
      makeReq({ action: "issue_shares", data: { shareholderId: "sh-1", shareClassId: "cls-1", shares: 0 } }),
    );
    expect(res.status).toBe(400);
    const res2 = await POST(
      makeReq({ action: "issue_shares", data: { shareholderId: "sh-1", shareClassId: "cls-1", shares: -50 } }),
    );
    expect(res2.status).toBe(400);
    expect(state.chains).toHaveLength(0);
  });

  it("returns 404 { ok:false, error:'Shareholder not found' } when the ownership pre-check misses", async () => {
    queue({ data: null, error: null });
    const res = await POST(
      makeReq({
        action: "issue_shares",
        data: { shareholderId: "sh-1", shareClassId: "cls-1", shares: 100 },
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Shareholder not found" });
    // Ownership pre-check chain fired; UPDATE + tx-insert did NOT.
    expect(findChain("shareholders", "select")).toBeDefined();
    expect(findChain("shareholders", "update")).toBeUndefined();
    expect(findChain("share_transactions")).toBeUndefined();
  });

  it("ownership pre-check filters by BOTH id AND account_id (tenancy boundary)", async () => {
    queue({ data: null, error: null });
    await POST(
      makeReq({
        action: "issue_shares",
        data: { shareholderId: "sh-1", shareClassId: "cls-1", shares: 100 },
      }),
    );
    const pre = findChain("shareholders", "select");
    const cols = pre?.eqCalls.map((e) => e.col).sort();
    expect(cols).toEqual(["account_id", "id"]);
  });

  it("increments existing shares_held by the issued amount and writes back on the UPDATE payload", async () => {
    queue(
      { data: { id: "sh-1", shares_held: 400 }, error: null }, // ownership pre-check
      { data: null, error: null }, // UPDATE
      { data: null, error: null }, // share_transactions insert
    );
    const res = await POST(
      makeReq({
        action: "issue_shares",
        data: { shareholderId: "sh-1", shareClassId: "cls-1", shares: 100 },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, newSharesHeld: 500 });
    const upd = findChain("shareholders", "update");
    expect(upd?.payload).toEqual({ shares_held: 500, share_class_id: "cls-1" });
  });

  it("returns 500 { ok:false, error:'Failed to issue shares' } on UPDATE error", async () => {
    queue(
      { data: { id: "sh-1", shares_held: 400 }, error: null },
      { data: null, error: { message: "boom" } },
    );
    const res = await POST(
      makeReq({
        action: "issue_shares",
        data: { shareholderId: "sh-1", shareClassId: "cls-1", shares: 100 },
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to issue shares" });
  });

  it("logs a share_transactions row with transaction_type='issue' + to_shareholder_id + shares", async () => {
    queue(
      { data: { id: "sh-1", shares_held: 0 }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    );
    await POST(
      makeReq({
        action: "issue_shares",
        data: {
          shareholderId: "sh-1",
          shareClassId: "cls-1",
          shares: 250,
          pricePerShare: 0.5,
          roundName: "Seed",
          notes: "Bridge",
        },
      }),
    );
    const tx = findChain("share_transactions", "insert");
    expect(tx?.payload).toEqual({
      account_id: "user-1",
      project_id: null,
      transaction_type: "issue",
      to_shareholder_id: "sh-1",
      share_class_id: "cls-1",
      shares: 250,
      price_per_share: 0.5,
      total_value: 125,
      round_name: "Seed",
      notes: "Bridge",
    });
  });
});

// ===========================================================================
// POST setup_esop
// ===========================================================================

describe("POST /api/cap-table action=setup_esop", () => {
  it("returns 400 when totalPoolShares is 0", async () => {
    const res = await POST(
      makeReq({ action: "setup_esop", data: { totalPoolShares: 0, poolPct: 10 } }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "totalPoolShares must be greater than 0",
    });
    expect(state.chains).toHaveLength(0);
  });

  it("returns 400 when totalPoolShares is negative", async () => {
    const res = await POST(
      makeReq({ action: "setup_esop", data: { totalPoolShares: -100, poolPct: 10 } }),
    );
    expect(res.status).toBe(400);
  });

  it("upserts esop_pool with onConflict:'account_id,project_id' so a re-setup replaces THIS project's row only (0334)", async () => {
    queue({ data: { id: "pool-1" }, error: null });
    await POST(
      makeReq({ action: "setup_esop", data: { totalPoolShares: 500_000, poolPct: 12 } }),
    );
    const c = findChain("esop_pool", "upsert");
    expect(c).toBeDefined();
    expect(c?.upsertOpts).toEqual({ onConflict: "account_id,project_id" });
    expect(c?.payload).toEqual({
      account_id: "user-1",
      project_id: null,
      total_pool_shares: 500_000,
      pool_pct: 12,
      allocated_shares: 0,
    });
  });

  it("defaults poolPct to 10 when the caller omits it", async () => {
    queue({ data: { id: "pool-1" }, error: null });
    await POST(
      makeReq({ action: "setup_esop", data: { totalPoolShares: 100_000 } }),
    );
    const c = findChain("esop_pool", "upsert");
    expect((c?.payload as Record<string, unknown>).pool_pct).toBe(10);
  });

  it("returns 201 { ok:true, esopPool } on happy path", async () => {
    const row = { id: "pool-1", total_pool_shares: 100_000, pool_pct: 10 };
    queue({ data: row, error: null });
    const res = await POST(
      makeReq({ action: "setup_esop", data: { totalPoolShares: 100_000 } }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, esopPool: row });
  });

  it("returns 500 { ok:false, error:'Failed to setup ESOP' } on upsert error", async () => {
    queue({ data: null, error: { message: "boom" } });
    const res = await POST(
      makeReq({ action: "setup_esop", data: { totalPoolShares: 100_000 } }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to setup ESOP" });
  });
});

// ===========================================================================
// POST update_shareholder
// ===========================================================================

describe("POST /api/cap-table action=update_shareholder", () => {
  it("returns 400 when shareholderId is missing", async () => {
    const res = await POST(
      makeReq({ action: "update_shareholder", data: { name: "Renamed" } }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "shareholderId is required" });
  });

  it("returns 404 { ok:false, error:'Shareholder not found' } when the ownership pre-check misses", async () => {
    queue({ data: null, error: null });
    const res = await POST(
      makeReq({ action: "update_shareholder", data: { shareholderId: "sh-1", name: "Renamed" } }),
    );
    expect(res.status).toBe(404);
    expect(findChain("shareholders", "update")).toBeUndefined();
  });

  it("ownership pre-check filters by BOTH id AND account_id (tenancy boundary)", async () => {
    queue({ data: null, error: null });
    await POST(
      makeReq({ action: "update_shareholder", data: { shareholderId: "sh-1", name: "Renamed" } }),
    );
    const pre = findChain("shareholders", "select");
    const cols = pre?.eqCalls.map((e) => e.col).sort();
    expect(cols).toEqual(["account_id", "id"]);
  });

  it("partial-update contract — only fields the caller provided are in the UPDATE payload", async () => {
    queue(
      { data: { id: "sh-1" }, error: null },
      { data: { id: "sh-1", name: "Renamed" }, error: null },
    );
    await POST(
      makeReq({
        action: "update_shareholder",
        data: { shareholderId: "sh-1", name: "Renamed" },
      }),
    );
    const upd = findChain("shareholders", "update");
    expect(upd?.payload).toEqual({ name: "Renamed" });
  });

  it("camelCase → snake_case mapping across every known column", async () => {
    queue(
      { data: { id: "sh-1" }, error: null },
      { data: { id: "sh-1" }, error: null },
    );
    await POST(
      makeReq({
        action: "update_shareholder",
        data: {
          shareholderId: "sh-1",
          name: "N",
          email: "e@x.com",
          role: "advisor",
          shareClassId: "cls-2",
          sharesHeld: 999,
          vestingStart: "2026-01-01",
          vestingMonths: 24,
          cliffMonths: 6,
          notes: "n",
          evmAddress: "0xabc",
        },
      }),
    );
    const upd = findChain("shareholders", "update");
    expect(upd?.payload).toEqual({
      name: "N",
      email: "e@x.com",
      role: "advisor",
      share_class_id: "cls-2",
      shares_held: 999,
      vesting_start: "2026-01-01",
      vesting_months: 24,
      cliff_months: 6,
      notes: "n",
      evm_address: "0xabc",
    });
  });

  it("`!= null` guard drops explicitly-null fields (a null caller value does NOT blank the DB column)", async () => {
    queue(
      { data: { id: "sh-1" }, error: null },
      { data: { id: "sh-1" }, error: null },
    );
    await POST(
      makeReq({
        action: "update_shareholder",
        data: { shareholderId: "sh-1", email: null, name: "Keep" },
      }),
    );
    const upd = findChain("shareholders", "update");
    expect(upd?.payload).toEqual({ name: "Keep" });
    expect((upd?.payload as Record<string, unknown>).email).toBeUndefined();
  });

  it("returns 200 { ok:true, shareholder } on happy path with the updated row echoed", async () => {
    const row = { id: "sh-1", name: "Renamed" };
    queue({ data: { id: "sh-1" }, error: null }, { data: row, error: null });
    const res = await POST(
      makeReq({ action: "update_shareholder", data: { shareholderId: "sh-1", name: "Renamed" } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, shareholder: row });
  });

  it("returns 500 { ok:false, error:'Failed to update shareholder' } on UPDATE error", async () => {
    queue({ data: { id: "sh-1" }, error: null }, { data: null, error: { message: "boom" } });
    const res = await POST(
      makeReq({ action: "update_shareholder", data: { shareholderId: "sh-1", name: "Renamed" } }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to update shareholder" });
  });
});

// ===========================================================================
// DELETE /api/cap-table
// ===========================================================================

describe("DELETE /api/cap-table", () => {
  it("returns gate response verbatim when gateRequireFeature rejects", async () => {
    gateMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "Payment required" }), {
        status: 402,
        headers: { "content-type": "application/json" },
      }),
    });
    const res = await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    expect(res.status).toBe(402);
    expect(state.chains).toHaveLength(0);
  });

  it("passes 'share_management' feature key into gateRequireFeature", async () => {
    queue({ data: { id: "sh-1" }, error: null }, { data: null, error: null }, { data: null, error: null });
    await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    expect(gateMock).toHaveBeenCalledWith("share_management");
  });

  it("returns 503 when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Database not configured" });
  });

  it("returns 400 on unparseable JSON body", async () => {
    const res = await DELETE(makeRawReq("{ not json", "DELETE"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON body" });
    expect(state.chains).toHaveLength(0);
  });

  it("returns 400 when shareholderId is missing", async () => {
    const res = await DELETE(makeReq({}, "DELETE"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "shareholderId is required" });
    expect(state.chains).toHaveLength(0);
  });

  it("returns 404 when ownership pre-check misses (no cascade + no delete follow-through)", async () => {
    queue({ data: null, error: null });
    const res = await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Shareholder not found" });
    expect(findChain("share_transactions")).toBeUndefined();
    expect(findChain("shareholders", "delete")).toBeUndefined();
  });

  it("ownership pre-check filters by BOTH id AND account_id (tenancy boundary)", async () => {
    queue({ data: null, error: null });
    await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    const pre = findChain("shareholders", "select");
    const cols = pre?.eqCalls.map((e) => e.col).sort();
    expect(cols).toEqual(["account_id", "id"]);
  });

  it("cascades a DELETE on share_transactions using an OR filter on from_ / to_ shareholder_id", async () => {
    queue({ data: { id: "sh-1" }, error: null }, { data: null, error: null }, { data: null, error: null });
    await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    const tx = findChain("share_transactions", "delete");
    expect(tx).toBeDefined();
    expect(tx?.orCalls[0]).toBe(
      "from_shareholder_id.eq.sh-1,to_shareholder_id.eq.sh-1",
    );
  });

  it("deletes the shareholder row by id after the cascade completes", async () => {
    queue({ data: { id: "sh-1" }, error: null }, { data: null, error: null }, { data: null, error: null });
    await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    const del = findChain("shareholders", "delete");
    expect(del).toBeDefined();
    expect(del?.eqCalls).toEqual([{ col: "id", val: "sh-1" }]);
  });

  it("returns 500 { ok:false, error:'Failed to delete shareholder' } on shareholders DELETE error", async () => {
    queue(
      { data: { id: "sh-1" }, error: null },
      { data: null, error: null },
      { data: null, error: { message: "boom" } },
    );
    const res = await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to delete shareholder" });
  });

  it("returns 200 { ok:true } on happy path", async () => {
    queue({ data: { id: "sh-1" }, error: null }, { data: null, error: null }, { data: null, error: null });
    const res = await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ===========================================================================
// S18-A — member access (getProjectScope): viewer reads, editor writes,
// every row keyed on the project OWNER's account_id + project_id.
// ===========================================================================

describe("S18-A member access", () => {
  beforeEach(() => {
    getProjectIdFromRequestMock.mockResolvedValue("proj-shared");
  });
  afterEach(() => {
    scopeRole.value = "owner";
  });

  it("GET as viewer: allowed; every table filtered on the OWNER's account_id + project_id", async () => {
    scopeRole.value = "viewer";
    queueGet({ data: [], error: null }, { data: [], error: null }, { data: null, error: null });
    const res = await GET({} as NextRequest);
    expect(res.status).toBe(200);
    for (const c of state.chains) {
      expect(c.eqCalls.find((e) => e.col === "account_id")?.val).toBe("owner-1");
      expect(c.eqCalls.find((e) => e.col === "project_id")?.val).toBe("proj-shared");
    }
  });

  it("POST as viewer: 403 forbidden before any DB chain", async () => {
    scopeRole.value = "viewer";
    const res = await POST(makeReq({ action: "add_shareholder", data: { name: "Ava" } }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(state.chains).toEqual([]);
  });

  it("POST add_shareholder as editor: stamped with the OWNER's account_id + project_id", async () => {
    scopeRole.value = "editor";
    queue({ data: { id: "sh-1" }, error: null });
    const res = await POST(makeReq({ action: "add_shareholder", data: { name: "Ava" } }));
    expect(res.status).toBe(201);
    const c = findChain("shareholders", "insert");
    expect(c?.payload).toMatchObject({ account_id: "owner-1", project_id: "proj-shared" });
  });

  it("POST issue_shares as editor: ownership pre-check keyed on the OWNER's account_id", async () => {
    scopeRole.value = "editor";
    queue({ data: { id: "sh-1", shares_held: 10 }, error: null }, { data: null, error: null }, { data: null, error: null });
    await POST(makeReq({ action: "issue_shares", data: { shareholderId: "sh-1", shareClassId: "cls-1", shares: 5 } }));
    const pre = findChain("shareholders", "select");
    expect(pre?.eqCalls.find((e) => e.col === "account_id")?.val).toBe("owner-1");
  });

  it("DELETE as viewer: 403; DELETE as editor: pre-check keyed on the OWNER's account_id", async () => {
    scopeRole.value = "viewer";
    const denied = await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    expect(denied.status).toBe(403);
    expect(state.chains).toEqual([]);

    scopeRole.value = "editor";
    queue({ data: { id: "sh-1" }, error: null }, { data: null, error: null }, { data: null, error: null });
    const res = await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    expect(res.status).toBe(200);
    const pre = findChain("shareholders", "select");
    expect(pre?.eqCalls.find((e) => e.col === "account_id")?.val).toBe("owner-1");
  });
});

// ===========================================================================
// S18-A review P1-1 — id-keyed mutations are bounded by project_id, not just
// the owner's account_id. An editor on project A holding a shareholder id
// from the owner's project B must 404 (pre-check misses) and nothing is
// written. An owner with no active project only reaches legacy
// (project_id IS NULL) rows.
// ===========================================================================

describe("S18-A review P1-1 — project boundary on id-keyed mutations", () => {
  afterEach(() => {
    scopeRole.value = "owner";
  });

  it("issue_shares as editor on A: pre-check carries .eq('project_id', A); a foreign-project row → 404, no UPDATE, no tx insert", async () => {
    getProjectIdFromRequestMock.mockResolvedValue("proj-A");
    scopeRole.value = "editor";
    queue({ data: null, error: null }); // the B row does not match project A
    const res = await POST(
      makeReq({ action: "issue_shares", data: { shareholderId: "sh-in-B", shareClassId: "cls-1", shares: 5 } }),
    );
    expect(res.status).toBe(404);
    const pre = findChain("shareholders", "select");
    expect(pre?.eqCalls).toEqual(
      expect.arrayContaining([
        { col: "id", val: "sh-in-B" },
        { col: "account_id", val: "owner-1" },
        { col: "project_id", val: "proj-A" },
      ]),
    );
    expect(pre?.isCalls).toEqual([]);
    expect(findChain("shareholders", "update")).toBeUndefined();
    expect(findChain("share_transactions")).toBeUndefined();
  });

  it("update_shareholder as editor on A: foreign-project row → 404, no UPDATE", async () => {
    getProjectIdFromRequestMock.mockResolvedValue("proj-A");
    scopeRole.value = "editor";
    queue({ data: null, error: null });
    const res = await POST(
      makeReq({ action: "update_shareholder", data: { shareholderId: "sh-in-B", name: "Renamed" } }),
    );
    expect(res.status).toBe(404);
    const pre = findChain("shareholders", "select");
    expect(pre?.eqCalls.find((e) => e.col === "project_id")?.val).toBe("proj-A");
    expect(findChain("shareholders", "update")).toBeUndefined();
  });

  it("DELETE as editor on A: foreign-project row → 404, no cascade, no delete", async () => {
    getProjectIdFromRequestMock.mockResolvedValue("proj-A");
    scopeRole.value = "editor";
    queue({ data: null, error: null });
    const res = await DELETE(makeReq({ shareholderId: "sh-in-B" }, "DELETE"));
    expect(res.status).toBe(404);
    const pre = findChain("shareholders", "select");
    expect(pre?.eqCalls.find((e) => e.col === "project_id")?.val).toBe("proj-A");
    expect(findChain("share_transactions")).toBeUndefined();
    expect(findChain("shareholders", "delete")).toBeUndefined();
  });

  it("owner on the same project: pre-check carries the project_id and the mutation proceeds", async () => {
    getProjectIdFromRequestMock.mockResolvedValue("proj-A");
    queue({ data: { id: "sh-1", shares_held: 10 }, error: null }, { data: null, error: null }, { data: null, error: null });
    const res = await POST(
      makeReq({ action: "issue_shares", data: { shareholderId: "sh-1", shareClassId: "cls-1", shares: 5 } }),
    );
    expect(res.status).toBe(200);
    const pre = findChain("shareholders", "select");
    expect(pre?.eqCalls.find((e) => e.col === "project_id")?.val).toBe("proj-A");
    expect(findChain("shareholders", "update")).toBeDefined();
  });

  it("owner with NO active project: pre-check uses .is('project_id', null) (legacy rows only) on issue_shares / update_shareholder / DELETE", async () => {
    getProjectIdFromRequestMock.mockResolvedValue(null);

    queue({ data: null, error: null });
    await POST(makeReq({ action: "issue_shares", data: { shareholderId: "sh-1", shareClassId: "cls-1", shares: 5 } }));
    let pre = findChain("shareholders", "select");
    expect(pre?.isCalls).toEqual([{ col: "project_id", val: null }]);
    expect(pre?.eqCalls.find((e) => e.col === "project_id")).toBeUndefined();

    resetState();
    queue({ data: null, error: null });
    await POST(makeReq({ action: "update_shareholder", data: { shareholderId: "sh-1", name: "X" } }));
    pre = findChain("shareholders", "select");
    expect(pre?.isCalls).toEqual([{ col: "project_id", val: null }]);

    resetState();
    queue({ data: null, error: null });
    await DELETE(makeReq({ shareholderId: "sh-1" }, "DELETE"));
    pre = findChain("shareholders", "select");
    expect(pre?.isCalls).toEqual([{ col: "project_id", val: null }]);
  });
});

// ===========================================================================
// S18-A review P2-4 — esop_pool is one-per-(account, project), not
// one-per-account: setting up project B's pool must not overwrite A's.
// ===========================================================================

describe("S18-A review P2-4 — esop_pool per project", () => {
  afterEach(() => {
    scopeRole.value = "owner";
  });

  it("owner on project B: the upsert is keyed on (account_id, project_id) and stamps B — A's row is a different conflict target", async () => {
    getProjectIdFromRequestMock.mockResolvedValue("proj-B");
    queue({ data: { id: "pool-B" }, error: null });
    const res = await POST(makeReq({ action: "setup_esop", data: { totalPoolShares: 100_000 } }));
    expect(res.status).toBe(201);
    const c = findChain("esop_pool", "upsert");
    expect(c?.upsertOpts).toEqual({ onConflict: "account_id,project_id" });
    expect(c?.payload).toMatchObject({ account_id: "user-1", project_id: "proj-B" });
  });

  it("editor on the owner's project A: pool stamped with the OWNER's account_id + project A, same composite conflict target", async () => {
    scopeRole.value = "editor";
    getProjectIdFromRequestMock.mockResolvedValue("proj-A");
    queue({ data: { id: "pool-A" }, error: null });
    const res = await POST(makeReq({ action: "setup_esop", data: { totalPoolShares: 100_000 } }));
    expect(res.status).toBe(201);
    const c = findChain("esop_pool", "upsert");
    expect(c?.upsertOpts).toEqual({ onConflict: "account_id,project_id" });
    expect(c?.payload).toMatchObject({ account_id: "owner-1", project_id: "proj-A" });
  });

  it("owner with no active project: legacy row (project_id null) still upserts on the same composite key (NULLS NOT DISTINCT)", async () => {
    getProjectIdFromRequestMock.mockResolvedValue(null);
    queue({ data: { id: "pool-legacy" }, error: null });
    const res = await POST(makeReq({ action: "setup_esop", data: { totalPoolShares: 100_000 } }));
    expect(res.status).toBe(201);
    const c = findChain("esop_pool", "upsert");
    expect(c?.upsertOpts).toEqual({ onConflict: "account_id,project_id" });
    expect(c?.payload).toMatchObject({ account_id: "user-1", project_id: null });
  });
});
