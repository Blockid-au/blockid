// Colocated vitest for GET + POST /api/cap-table/sync — P9-cap-table-sync-route-test.
//
// The sync route reconciles the founder's off-chain cap-table (Supabase
// `shareholders.shares_held`) against the on-chain SVT ERC-20 balance
// (chainId 420, private BlockID EVM at chain.blockid.au/evm). GET diffs the
// two ledgers and returns the mismatches; POST classifies each shareholder as
// synced / needs-mint (DB > chain) / mismatch (chain > DB) / skipped
// (no evm_address) so the admin UI can drive a MetaMask `mintTokens` call
// for the missing supply. The route underpins the P5_investor_readiness_score
// + P9_ship exit criteria in docs/plans/atlassian-standard-mapping-goal.md —
// a silent regression here quietly re-orders the ASIC-facing register of
// members, or worse, tells an admin to mint tokens against a stale
// off-chain snapshot and inflates the token supply beyond the s169 register.
//
// The suite pins the following route contract:
//   1.  `dynamic = "force-dynamic"` — per-account sync results must never
//       be cached across founders.
//   2.  GET is admin-only — non-admin caller returns 403.
//   3.  GET returns 403 when getCurrentUser() is null.
//   4.  GET returns 503 when getSupabaseAdmin() is null.
//   5.  GET returns 500 when the shareholders SELECT errors.
//   6.  GET SELECTs `shareholders` filtered by account_id=user.id (NOT email,
//       and NOT unscoped — a missing filter would leak another founder's
//       cap-table).
//   7.  GET returns 502 when the `decimals()` RPC call throws — differentiates
//       chain-down from DB-down.
//   8.  GET happy path (in-sync) returns { ok:true, inSync:true, mismatches:[] }.
//   9.  GET reports a mismatch when the DB share count differs from the
//       chain balance (post-decimals divisor).
//  10.  GET skips a shareholder with a null/empty `evm_address` (no RPC call,
//       no mismatch row).
//  11.  GET tolerates a null `shares_held` on the DB row by coercing to 0
//       (else the BigInt() ctor throws and the whole GET 500s).
//  12.  GET records a shareholder as `chainShares:"error"` when the
//       balanceOf RPC throws (per-shareholder failure never fails the whole
//       sync tick).
//  13.  GET aggregates mismatches across multiple shareholders in one pass.
//  14.  GET calls balanceOf() with the ERC-20 selector 0x70a08231 + the
//       padded address (proves the calldata layout hasn't drifted).
//  15.  GET calls decimals() with 0x313ce567 against the SVT contract address.
//  16.  GET calldata targets the SVT contract (0xa16E…d2be) and hits the
//       chain.blockid.au RPC endpoint.
//  17.  GET decodes decimals + balance from the JSON-RPC hex `result`.
//  18.  GET returns { inSync:true } for the empty-shareholder-list case.
//  19.  POST enforces gateRequireFeature("share_management") — the gate's
//       own response is returned verbatim (401/402/503 shape).
//  20.  POST admin-only — non-admin caller (via a gate-ok user) returns 403.
//  21.  POST returns 503 when getSupabaseAdmin() is null.
//  22.  POST returns 500 when the shareholders SELECT errors.
//  23.  POST returns 502 when the `decimals()` RPC call throws.
//  24.  POST counts synced shareholders (chain balance == DB balance).
//  25.  POST records a mint payload when DB > chain (diff between the two,
//       stringified so the founder-facing UI can call `mintTokens(uint256)`
//       without float loss).
//  26.  POST records a mismatch when chain > DB (chain shares should not
//       exceed the register — a manual audit is required).
//  27.  POST skips a shareholder without an evm_address and increments
//       the `skipped` counter (never mints against a phantom wallet).
//  28.  POST classifies a per-shareholder balanceOf RPC failure as
//       chainShares:"error" (never blocks the whole sync tick).
//  29.  POST returns { ok:true, synced, minted, mismatches, skipped } — the
//       full envelope the admin UI depends on for the MetaMask hand-off.
//  30.  POST empty shareholder list returns synced:0/minted:[]/mismatches:[]/skipped:0.
//
// Silent regressions this pins against:
//   - dropping the `dynamic = "force-dynamic"` export (per-account results
//     bleed across founders when the shell caches);
//   - dropping the admin check on GET/POST (any share_management-entitled
//     caller can trigger a chain-wide reconciliation against another
//     founder's DB rows);
//   - swapping the account_id filter for an email filter (DB schema keys
//     on account_id → founder sees another founder's cap-table);
//   - re-throwing on a per-shareholder balanceOf failure (one bad address
//     breaks the whole tick — an admin can never see the good rows);
//   - dropping the `!sh.evm_address` skip on POST (mints against a null
//     wallet or a wallet that doesn't belong to the shareholder);
//   - swapping the balanceOf selector `0x70a08231` for another ERC-20 method
//     (silently returns totalSupply / decimals as the "balance", every
//     shareholder mismatches, admin mints garbage supply on top);
//   - swapping the decimals selector `0x313ce567` (the divisor is wrong,
//     every shareholder appears out of sync, admin over-mints).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — set up BEFORE the SUT import so the module picks them up.
// ---------------------------------------------------------------------------

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

type SelectResult = { data: unknown[] | null; error: { message: string } | null };
let selectResult: SelectResult = { data: [], error: null };
const selectCalls: Array<{ table: string; col: string; val: unknown }> = [];

function makeSupabase() {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: unknown) {
              selectCalls.push({ table, col, val });
              return Promise.resolve(selectResult);
            },
          };
        },
      };
    },
  };
}

let supabaseInstance: ReturnType<typeof makeSupabase> | null = null;
const getSupabaseAdminMock = vi.fn(() => supabaseInstance);
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks.
// ---------------------------------------------------------------------------

import { GET, POST, dynamic } from "./route";

const SVT_CONTRACT = "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be";
const RPC_URL = "https://chain.blockid.au/evm";
const BALANCE_OF_SELECTOR = "0x70a08231";
const DECIMALS_SELECTOR = "0x313ce567";

const USER_ADMIN = { id: "u-admin-1", email: "admin@blockid.au", role: "admin" };
const USER_NORMAL = { id: "u-2", email: "user@ex.co", role: "user" };

function gateOk(user: typeof USER_ADMIN) {
  return { ok: true, user, uwp: { id: user.id, plan: "growth", segment: "founder" } };
}
function gateFail(status: number, error: string) {
  return {
    ok: false as const,
    response: NextResponse.json({ ok: false, error }, { status }),
  };
}

// ---------------------------------------------------------------------------
// fetch() mock — the route talks to the EVM RPC with { method:"eth_call" }.
// Test harness dispatches per-call based on the calldata `data` selector.
// ---------------------------------------------------------------------------

type RpcHandler = (body: { to: string; data: string }) => {
  result?: string;
  error?: { message: string };
} | Error;
let fetchHandler: RpcHandler = () => ({ result: "0x" });
const fetchCalls: Array<{ url: string; body: unknown }> = [];

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : null;
    fetchCalls.push({ url, body });
    const params = body?.params?.[0] ?? { to: "", data: "" };
    const outcome = fetchHandler(params);
    if (outcome instanceof Error) throw outcome;
    return {
      json: async () => ({ jsonrpc: "2.0", id: 1, ...outcome }),
    } as unknown as Response;
  }));
}

// Helper: hex-encoded uint256 for a plain number (no 0x, zero-padded).
function u256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

// Compose a per-selector RPC handler.
function rpcRouter(routes: {
  decimals?: () => bigint;
  balanceOf?: (addrHex: string) => bigint | Error;
}): RpcHandler {
  return ({ data }) => {
    if (data.startsWith(DECIMALS_SELECTOR)) {
      const d = routes.decimals ? routes.decimals() : 18n;
      return { result: "0x" + u256(d) };
    }
    if (data.startsWith(BALANCE_OF_SELECTOR)) {
      // Extract the padded address slot for the handler.
      const addrHex = "0x" + data.slice(BALANCE_OF_SELECTOR.length).slice(-40);
      const outcome = routes.balanceOf
        ? routes.balanceOf(addrHex)
        : 0n;
      if (outcome instanceof Error) return outcome;
      return { result: "0x" + u256(outcome) };
    }
    return { result: "0x" };
  };
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  getCurrentUserMock.mockReset();
  gateMock.mockReset();
  getSupabaseAdminMock.mockClear();
  selectCalls.length = 0;
  fetchCalls.length = 0;
  selectResult = { data: [], error: null };
  supabaseInstance = makeSupabase();
  fetchHandler = rpcRouter({});
  stubFetch();
});

// ---------------------------------------------------------------------------

describe("dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-account sync never caches across founders', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/cap-table/sync — auth", () => {
  it("returns 403 when getCurrentUser is null (no session)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Admin access required" });
    expect(selectCalls).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it("returns 403 when the caller is not admin", async () => {
    getCurrentUserMock.mockResolvedValue(USER_NORMAL);
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Admin access required" });
  });
});

describe("GET /api/cap-table/sync — supabase / DB error branches", () => {
  it("returns 503 when getSupabaseAdmin() is null (service role missing)", async () => {
    getCurrentUserMock.mockResolvedValue(USER_ADMIN);
    supabaseInstance = null;
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Database not configured" });
  });

  it("returns 500 when the shareholders SELECT errors", async () => {
    getCurrentUserMock.mockResolvedValue(USER_ADMIN);
    selectResult = { data: null, error: { message: "boom" } };
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Failed to fetch shareholders" });
  });

  it("SELECTs shareholders filtered by account_id=user.id (NOT email, NOT unscoped)", async () => {
    getCurrentUserMock.mockResolvedValue(USER_ADMIN);
    selectResult = { data: [], error: null };
    await GET();
    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0].table).toBe("shareholders");
    expect(selectCalls[0].col).toBe("account_id");
    expect(selectCalls[0].val).toBe(USER_ADMIN.id);
  });
});

describe("GET /api/cap-table/sync — RPC / chain error branches", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(USER_ADMIN);
    selectResult = { data: [], error: null };
  });

  it("returns 502 when the decimals() RPC throws — differentiates chain-down from DB-down", async () => {
    fetchHandler = () => new Error("connection refused");
    const res = await GET();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Cannot reach blockchain RPC" });
  });

  it("returns 502 when the JSON-RPC error envelope trips the decimals() call", async () => {
    fetchHandler = () => ({ error: { message: "rpc down" } });
    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("hits the decimals() selector 0x313ce567 against the SVT contract at chain.blockid.au", async () => {
    fetchHandler = rpcRouter({ decimals: () => 18n });
    await GET();
    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    const first = fetchCalls[0];
    expect(first.url).toBe(RPC_URL);
    const params = (first.body as { params: unknown[] }).params[0] as { to: string; data: string };
    expect(params.to).toBe(SVT_CONTRACT);
    expect(params.data).toBe(DECIMALS_SELECTOR);
  });
});

describe("GET /api/cap-table/sync — reconciliation", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(USER_ADMIN);
  });

  it("returns { ok:true, inSync:true, mismatches:[] } when DB == chain for every shareholder", async () => {
    const addr = "0x1111111111111111111111111111111111111111";
    selectResult = {
      data: [{ id: "s1", name: "Alice", email: "a@x", shares_held: 100, evm_address: addr }],
      error: null,
    };
    fetchHandler = rpcRouter({
      decimals: () => 18n,
      balanceOf: () => 100n * 10n ** 18n,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, inSync: true, mismatches: [] });
  });

  it("reports a mismatch when chain balance differs from DB shares", async () => {
    const addr = "0xabababababababababababababababababababab";
    selectResult = {
      data: [{ id: "s1", name: "Bob", email: "b@x", shares_held: 250, evm_address: addr }],
      error: null,
    };
    fetchHandler = rpcRouter({
      decimals: () => 18n,
      balanceOf: () => 100n * 10n ** 18n,
    });
    const res = await GET();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.inSync).toBe(false);
    expect(body.mismatches).toEqual([
      { name: "Bob", dbShares: 250, chainShares: "100", diff: "150" },
    ]);
  });

  it("skips a shareholder with a null/empty evm_address (no RPC call, no mismatch)", async () => {
    selectResult = {
      data: [
        { id: "s1", name: "NoAddr", email: "n@x", shares_held: 500, evm_address: null },
        { id: "s2", name: "Empty", email: "e@x", shares_held: 500, evm_address: "" },
      ],
      error: null,
    };
    fetchHandler = rpcRouter({ decimals: () => 18n });
    const res = await GET();
    const body = await res.json();
    expect(body.inSync).toBe(true);
    expect(body.mismatches).toEqual([]);
    // 1 decimals() call, 0 balanceOf() calls
    const balanceCalls = fetchCalls.filter((c) => {
      const p = (c.body as { params: unknown[] }).params[0] as { data: string };
      return p.data.startsWith(BALANCE_OF_SELECTOR);
    });
    expect(balanceCalls).toHaveLength(0);
  });

  it("tolerates a null shares_held (coerces to 0 — BigInt(null) would throw)", async () => {
    const addr = "0x2222222222222222222222222222222222222222";
    selectResult = {
      data: [{ id: "s1", name: "Nully", email: "n@x", shares_held: null, evm_address: addr }],
      error: null,
    };
    fetchHandler = rpcRouter({
      decimals: () => 18n,
      balanceOf: () => 5n * 10n ** 18n,
    });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.inSync).toBe(false);
    expect(body.mismatches).toEqual([
      { name: "Nully", dbShares: 0, chainShares: "5", diff: "-5" },
    ]);
  });

  it("records a shareholder as chainShares:'error' when balanceOf() throws (per-shareholder failure never fails the tick)", async () => {
    const addr = "0x3333333333333333333333333333333333333333";
    selectResult = {
      data: [{ id: "s1", name: "Broken", email: "b@x", shares_held: 100, evm_address: addr }],
      error: null,
    };
    fetchHandler = rpcRouter({
      decimals: () => 18n,
      balanceOf: () => new Error("call reverted"),
    });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.inSync).toBe(false);
    expect(body.mismatches).toEqual([
      { name: "Broken", dbShares: 100, chainShares: "error", diff: "unknown" },
    ]);
  });

  it("aggregates mismatches across multiple shareholders in one pass", async () => {
    const addr1 = "0x1000000000000000000000000000000000000001";
    const addr2 = "0x1000000000000000000000000000000000000002";
    const addr3 = "0x1000000000000000000000000000000000000003";
    selectResult = {
      data: [
        { id: "s1", name: "A", email: "a@x", shares_held: 10, evm_address: addr1 },
        { id: "s2", name: "B", email: "b@x", shares_held: 20, evm_address: addr2 },
        { id: "s3", name: "C", email: "c@x", shares_held: 30, evm_address: addr3 },
      ],
      error: null,
    };
    fetchHandler = rpcRouter({
      decimals: () => 18n,
      balanceOf: (addr) => {
        if (addr === addr1) return 10n * 10n ** 18n; // in sync
        if (addr === addr2) return 15n * 10n ** 18n; // mismatch (db > chain by 5)
        return 40n * 10n ** 18n; // mismatch (chain > db by 10 → diff -10)
      },
    });
    const res = await GET();
    const body = await res.json();
    expect(body.inSync).toBe(false);
    expect(body.mismatches).toHaveLength(2);
    expect(body.mismatches[0]).toEqual({ name: "B", dbShares: 20, chainShares: "15", diff: "5" });
    expect(body.mismatches[1]).toEqual({ name: "C", dbShares: 30, chainShares: "40", diff: "-10" });
  });

  it("calls balanceOf() with the ERC-20 selector 0x70a08231 + zero-padded address", async () => {
    const addr = "0xABcdef0000000000000000000000000000000001";
    selectResult = {
      data: [{ id: "s1", name: "X", email: "x@x", shares_held: 1, evm_address: addr }],
      error: null,
    };
    fetchHandler = rpcRouter({ decimals: () => 18n, balanceOf: () => 10n ** 18n });
    await GET();
    const balanceCall = fetchCalls.find((c) => {
      const p = (c.body as { params: unknown[] }).params[0] as { data: string };
      return p.data.startsWith(BALANCE_OF_SELECTOR);
    });
    expect(balanceCall).toBeTruthy();
    const params = (balanceCall!.body as { params: unknown[] }).params[0] as { to: string; data: string };
    expect(params.to).toBe(SVT_CONTRACT);
    // selector (10 chars incl 0x) + 64-hex-char padded address = 74 chars.
    expect(params.data).toHaveLength(74);
    expect(params.data.startsWith(BALANCE_OF_SELECTOR)).toBe(true);
    // Lower-cased, zero-padded to 64 hex chars.
    const expectedPad = addr.toLowerCase().replace("0x", "").padStart(64, "0");
    expect(params.data.slice(BALANCE_OF_SELECTOR.length)).toBe(expectedPad);
  });

  it("returns { inSync:true } for an empty shareholder list (no RPC balanceOf calls)", async () => {
    selectResult = { data: [], error: null };
    fetchHandler = rpcRouter({ decimals: () => 18n });
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ ok: true, inSync: true, mismatches: [] });
    const balanceCalls = fetchCalls.filter((c) => {
      const p = (c.body as { params: unknown[] }).params[0] as { data: string };
      return p.data.startsWith(BALANCE_OF_SELECTOR);
    });
    expect(balanceCalls).toHaveLength(0);
  });

  it("decodes decimals + balance from the JSON-RPC hex 'result' (respects the decimals divisor)", async () => {
    // decimals=6 changes the divisor from 1e18 to 1e6.
    const addr = "0x4444444444444444444444444444444444444444";
    selectResult = {
      data: [{ id: "s1", name: "Six", email: "s@x", shares_held: 42, evm_address: addr }],
      error: null,
    };
    fetchHandler = rpcRouter({
      decimals: () => 6n,
      balanceOf: () => 42n * 10n ** 6n,
    });
    const res = await GET();
    const body = await res.json();
    expect(body.inSync).toBe(true);
    expect(body.mismatches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("POST /api/cap-table/sync — feature gate + admin guard", () => {
  it("returns the gate's response verbatim when the feature gate rejects (401/402/503 shape)", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    const res = await POST();
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "feature_locked" });
    expect(selectCalls).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it("calls gateRequireFeature with the 'share_management' feature key", async () => {
    gateMock.mockResolvedValue(gateFail(401, "unauth"));
    await POST();
    expect(gateMock).toHaveBeenCalledTimes(1);
    expect(gateMock).toHaveBeenCalledWith("share_management");
  });

  it("returns 403 when the gate-ok caller is not admin (share_management alone is not enough to mint)", async () => {
    gateMock.mockResolvedValue(gateOk(USER_NORMAL));
    const res = await POST();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Admin access required" });
    expect(selectCalls).toHaveLength(0);
  });
});

describe("POST /api/cap-table/sync — supabase / DB error branches", () => {
  beforeEach(() => {
    gateMock.mockResolvedValue(gateOk(USER_ADMIN));
  });

  it("returns 503 when getSupabaseAdmin() is null", async () => {
    supabaseInstance = null;
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Database not configured" });
  });

  it("returns 500 when the shareholders SELECT errors", async () => {
    selectResult = { data: null, error: { message: "boom" } };
    const res = await POST();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Failed to fetch shareholders" });
  });

  it("SELECTs shareholders filtered by account_id=user.id (NOT unscoped)", async () => {
    selectResult = { data: [], error: null };
    await POST();
    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0]).toEqual({
      table: "shareholders",
      col: "account_id",
      val: USER_ADMIN.id,
    });
  });

  it("returns 502 when the decimals() RPC throws — differentiates chain-down from DB-down", async () => {
    fetchHandler = () => new Error("connect ECONNREFUSED");
    const res = await POST();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Cannot reach blockchain RPC" });
  });
});

describe("POST /api/cap-table/sync — classification envelope", () => {
  beforeEach(() => {
    gateMock.mockResolvedValue(gateOk(USER_ADMIN));
  });

  it("returns synced:0 / minted:[] / mismatches:[] / skipped:0 for an empty shareholder list", async () => {
    selectResult = { data: [], error: null };
    fetchHandler = rpcRouter({ decimals: () => 18n });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, synced: 0, minted: [], mismatches: [], skipped: 0 });
  });

  it("counts synced shareholders (chain balance == DB balance)", async () => {
    const addr = "0x5555555555555555555555555555555555555555";
    selectResult = {
      data: [{ id: "s1", name: "Match", email: "m@x", shares_held: 100, evm_address: addr }],
      error: null,
    };
    fetchHandler = rpcRouter({
      decimals: () => 18n,
      balanceOf: () => 100n * 10n ** 18n,
    });
    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ ok: true, synced: 1, minted: [], mismatches: [], skipped: 0 });
  });

  it("records a mint payload when DB > chain (diff as string so mintTokens(uint256) is float-safe)", async () => {
    const addr = "0x6666666666666666666666666666666666666666";
    selectResult = {
      data: [{ id: "s1", name: "NeedsMint", email: "nm@x", shares_held: 500, evm_address: addr }],
      error: null,
    };
    fetchHandler = rpcRouter({
      decimals: () => 18n,
      balanceOf: () => 200n * 10n ** 18n,
    });
    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      synced: 0,
      minted: [{ name: "NeedsMint", amount: "300" }],
      mismatches: [],
      skipped: 0,
    });
  });

  it("records a mismatch (never a mint) when chain > DB — chain shares should never exceed the register", async () => {
    const addr = "0x7777777777777777777777777777777777777777";
    selectResult = {
      data: [{ id: "s1", name: "OverChain", email: "o@x", shares_held: 100, evm_address: addr }],
      error: null,
    };
    fetchHandler = rpcRouter({
      decimals: () => 18n,
      balanceOf: () => 250n * 10n ** 18n,
    });
    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      synced: 0,
      minted: [],
      mismatches: [{ name: "OverChain", dbShares: 100, chainShares: "250" }],
      skipped: 0,
    });
  });

  it("skips a shareholder without an evm_address and increments the skipped counter (never mints against a phantom wallet)", async () => {
    selectResult = {
      data: [
        { id: "s1", name: "Nully", email: "n@x", shares_held: 500, evm_address: null },
        { id: "s2", name: "Empty", email: "e@x", shares_held: 500, evm_address: "" },
      ],
      error: null,
    };
    fetchHandler = rpcRouter({ decimals: () => 18n });
    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ ok: true, synced: 0, minted: [], mismatches: [], skipped: 2 });
    const balanceCalls = fetchCalls.filter((c) => {
      const p = (c.body as { params: unknown[] }).params[0] as { data: string };
      return p.data.startsWith(BALANCE_OF_SELECTOR);
    });
    expect(balanceCalls).toHaveLength(0);
  });

  it("classifies a per-shareholder balanceOf failure as chainShares:'error' (never blocks the whole sync tick)", async () => {
    const addr = "0x8888888888888888888888888888888888888888";
    selectResult = {
      data: [{ id: "s1", name: "Broken", email: "b@x", shares_held: 42, evm_address: addr }],
      error: null,
    };
    fetchHandler = rpcRouter({
      decimals: () => 18n,
      balanceOf: () => new Error("call reverted"),
    });
    const res = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      synced: 0,
      minted: [],
      mismatches: [{ name: "Broken", dbShares: 42, chainShares: "error" }],
      skipped: 0,
    });
  });

  it("returns the full envelope { synced, minted[], mismatches[], skipped } — the shape the MetaMask hand-off UI depends on", async () => {
    const addrSync = "0xa000000000000000000000000000000000000001";
    const addrMint = "0xa000000000000000000000000000000000000002";
    const addrMismatch = "0xa000000000000000000000000000000000000003";
    selectResult = {
      data: [
        { id: "s1", name: "S", email: "s@x", shares_held: 10, evm_address: addrSync },
        { id: "s2", name: "M", email: "m@x", shares_held: 50, evm_address: addrMint },
        { id: "s3", name: "X", email: "x@x", shares_held: 20, evm_address: addrMismatch },
        { id: "s4", name: "K", email: "k@x", shares_held: 5, evm_address: null },
      ],
      error: null,
    };
    fetchHandler = rpcRouter({
      decimals: () => 18n,
      balanceOf: (addr) => {
        if (addr === addrSync) return 10n * 10n ** 18n;
        if (addr === addrMint) return 30n * 10n ** 18n;
        return 100n * 10n ** 18n; // chain > db
      },
    });
    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      synced: 1,
      minted: [{ name: "M", amount: "20" }],
      mismatches: [{ name: "X", dbShares: 20, chainShares: "100" }],
      skipped: 1,
    });
  });
});
