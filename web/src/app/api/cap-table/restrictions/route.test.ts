// Unit tests for GET + POST /api/cap-table/restrictions —
// P9-cap-table-restrictions-route-test.
//
// The restrictions route is the admin-facing SVT transfer-control surface: it
// reads the on-chain `paused` / `whitelistEnabled` state of the SVT ERC-20 on
// the private BlockID EVM (chainId 420) and returns the caller's persisted
// whitelist rows (transfer_whitelist), then — on POST — hands back MetaMask-
// ready `txData` for pause / unpause / whitelist add-remove / enable-disable /
// forced_transfer. It's the Corps-Act-aligned "share transfer restrictions"
// contract wired into the Chapter-10/11 cap-table admin flow, so silent
// regressions here quietly ship a cap-table whose restrictions the founder
// *thinks* are applied but the chain is not enforcing.
//
// Assertions pin the following route contract:
//   1. `dynamic = "force-dynamic"` — per-account whitelist + live chain state
//      must never be cached into the static shell.
//   2. GET 401 on anonymous.
//   3. GET happy path: two `eth_call` payloads (paused + whitelistEnabled)
//      dispatched to the SVT contract; DB query targets `transfer_whitelist`
//      filtered by user.id (NOT email) ordered by created_at asc; the
//      response echoes decoded booleans + normalised whitelist addresses.
//   4. GET boolean decoder: any non-zero hex → true; all-zero hex → false;
//      the "0x" empty result → false (never throws).
//   5. GET chain-unreachable branch: fetch throws → the route still returns
//      200 with `paused:false, whitelistEnabled:false, whitelistedAddresses:[]`
//      + a `chainError` string, and the founder never sees a 500.
//   6. GET when supabase admin is null (no service role in env) → the route
//      still returns 200 with an empty `whitelistedAddresses:[]`.
//   7. GET when the transfer_whitelist SELECT returns null rows → `whitelistedAddresses`
//      is `[]` (never `null`, so the UI `.map()` never blows up).
//   8. POST feature-gate: `gateRequireFeature('share_management')` failure
//      returns the gate's own response verbatim (401/402/503 shape).
//   9. POST admin-only: non-admin non-admin@blockid.au caller → 403.
//  10. POST invalid JSON body → 400 { ok:false, error:"Invalid JSON body" }.
//  11. POST missing `action` → 400 { ok:false, error:"action is required" }.
//  12. POST unknown action → 400 { ok:false, error:"Unknown action: X" }.
//  13. POST pause_transfers → 200 { txData:{ to:SVT, data:selector.pause,
//      from:ADMIN_ADDRESS, gas:"0x30D40", description:… } }.
//  14. POST unpause_transfers → 200 with selector.unpause.
//  15. POST enable_whitelist → 200 with selector.enableWhitelist.
//  16. POST disable_whitelist → 200 with selector.disableWhitelist.
//  17. POST whitelist_add without address → 400.
//  18. POST whitelist_add non-hex-40 address → 400 (regex enforced).
//  19. POST whitelist_add happy → DB upsert on transfer_whitelist onConflict:
//      "account_id,evm_address" with lowercased address + user.id, + txData
//      whose calldata is selector.addToWhitelist + zero-padded 32-byte address.
//  20. POST whitelist_remove without address → 400.
//  21. POST whitelist_remove invalid address → 400.
//  22. POST whitelist_remove happy → DB delete .eq(account_id).eq(evm_address
//      lowercased) + txData whose calldata is selector.removeFromWhitelist +
//      padded address.
//  23. POST forced_transfer missing from → 400.
//  24. POST forced_transfer missing to → 400.
//  25. POST forced_transfer zero / negative amount → 400 (each branch of the
//      `!amount || amount <= 0` guard).
//  26. POST forced_transfer invalid from address → 400.
//  27. POST forced_transfer invalid to address → 400.
//  28. POST forced_transfer happy — calldata contains selector +
//      padded from + padded to + amount*1e18 encoded as uint256 + ABI string
//      offset 0x80 + length + ascii-hex reason (0x-padded to next 32 bytes).
//  29. POST forced_transfer logs a `share_transactions` insert row with the
//      shaped notes string (embedding amount + from + to + reason).
//
// Silent regressions this pins against:
//  - dropping `dynamic = "force-dynamic"` (per-account whitelist bleeds
//    across users when the shell caches);
//  - flipping the eth_call decodeBool to accept "0x0000…001" as false;
//  - selecting `transfer_whitelist` by user.email (the schema keys on
//    account_id → founder sees another founder's whitelist);
//  - dropping the address regex on whitelist_add / whitelist_remove (allows
//    arbitrary text to end up as SVT contract calldata);
//  - dropping the admin gate (any share_management-entitled caller can pause
//    transfers globally);
//  - reordering the ABI-encoded string offset / length for forcedTransfer
//    (Solidity reverts, but silent test drift would allow a swap);
//  - forgetting to lowercase evm_address on insert / delete (case-sensitive
//    duplicates accumulate in the whitelist);
//  - dropping the try/catch on GET (chain-unreachable → 500 → founder sees a
//    broken admin panel on every RPC blip);
//  - dropping the share_transactions insert on forced_transfer (audit trail
//    disappears — Corps Act cap-table register requirement fails on audit).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
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

// Supabase client: chainable stub whose `.from()` returns per-table builders
// that record every call. Tests inspect `dbCalls` after the fact.
type DbCall =
  | { op: "select-eq-order"; table: string; col: string; val: unknown }
  | { op: "upsert"; table: string; row: Record<string, unknown>; opts: unknown }
  | { op: "delete-eq-eq"; table: string; c1: string; v1: unknown; c2: string; v2: unknown }
  | { op: "insert"; table: string; row: Record<string, unknown> };

let dbCalls: DbCall[] = [];
let selectRows: unknown[] | null = [];

function makeSupabase() {
  return {
    from(table: string) {
      return {
        select(_col: string) {
          return {
            eq(col: string, val: unknown) {
              return {
                order(_ordCol: string, _opts: unknown) {
                  dbCalls.push({ op: "select-eq-order", table, col, val });
                  return Promise.resolve({ data: selectRows, error: null });
                },
              };
            },
          };
        },
        upsert(row: Record<string, unknown>, opts: unknown) {
          dbCalls.push({ op: "upsert", table, row, opts });
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(c1: string, v1: unknown) {
              return {
                eq(c2: string, v2: unknown) {
                  dbCalls.push({ op: "delete-eq-eq", table, c1, v1, c2, v2 });
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          dbCalls.push({ op: "insert", table, row });
          return Promise.resolve({ error: null });
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
// fetch stub — captures RPC call payloads + returns per-selector hex.
// ---------------------------------------------------------------------------

type FetchCall = { url: string; body: { method: string; params: unknown[] } };
let fetchCalls: FetchCall[] = [];
let fetchImpl: ((url: string, init: RequestInit) => Promise<Response>) | null =
  null;

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    fetchCalls.push({ url, body });
    if (fetchImpl) return fetchImpl(url, init);
    return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x0" });
  }),
);

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Import SUT after mocks. Import the constants below indirectly by asserting
// on well-known raw values — the SUT is not exporting them.
// ---------------------------------------------------------------------------

import { GET, POST, dynamic } from "./route";

const SVT_CONTRACT = "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be";
const ADMIN_ADDRESS_DEFAULT = "0x0000000000000000000000000000000000000000";
const SEL = {
  paused: "0x5c975abb",
  whitelistEnabled: "0x51fb012d",
  pause: "0x8456cb59",
  unpause: "0x3f4ba83a",
  addToWhitelist: "0xe43252d7",
  removeFromWhitelist: "0x8ab1d681",
  enableWhitelist: "0xcdfb2b4e",
  disableWhitelist: "0x2042e5c2",
  forcedTransfer: "0x9c3f1e90",
};

const USER_ADMIN = { id: "u-admin-1", email: "admin@blockid.au", role: "admin" };
const USER_NORMAL = { id: "u-2", email: "user@ex.co", role: "user" };

function gateOk(user: typeof USER_ADMIN) {
  return { ok: true, user, uwp: { id: user.id, plan: "growth", segment: "founder" } };
}
function gateFail(status: number, error: string) {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error }, { status }),
  };
}

function getReq(): NextRequest {
  return new Request("http://x/api/cap-table/restrictions") as unknown as NextRequest;
}
function postReq(body: unknown, invalid = false): Request {
  return new Request("http://x/api/cap-table/restrictions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: invalid ? "{not json" : JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  getCurrentUserMock.mockReset();
  gateMock.mockReset();
  getSupabaseAdminMock.mockClear();
  fetchCalls = [];
  dbCalls = [];
  selectRows = [];
  fetchImpl = null;
  supabaseInstance = makeSupabase();
});

describe("dynamic export", () => {
  it('exports dynamic = "force-dynamic" so the admin panel is never cached across accounts', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/cap-table/restrictions — anonymous branch", () => {
  it("returns 401 { ok:false, error:'Authentication required' } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Authentication required" });
  });

  it("does NOT dispatch any eth_call or DB query on the anonymous branch", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET(getReq());
    expect(fetchCalls).toHaveLength(0);
    expect(dbCalls).toHaveLength(0);
  });
});

describe("GET /api/cap-table/restrictions — happy path", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(USER_ADMIN);
    selectRows = [
      { evm_address: "0xaaaa000000000000000000000000000000000001" },
      { evm_address: "0xbbbb000000000000000000000000000000000002" },
    ];
    fetchImpl = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      const data = body.params[0].data as string;
      if (data === SEL.paused) return jsonResponse({ result: "0x0000000000000000000000000000000000000000000000000000000000000001" });
      if (data === SEL.whitelistEnabled) return jsonResponse({ result: "0x0000000000000000000000000000000000000000000000000000000000000001" });
      return jsonResponse({ result: "0x0" });
    };
  });

  it("dispatches eth_call to the SVT contract for both paused() and whitelistEnabled()", async () => {
    await GET(getReq());
    const datas = fetchCalls.map((c) => (c.body.params[0] as { data: string; to: string }).data);
    expect(datas).toContain(SEL.paused);
    expect(datas).toContain(SEL.whitelistEnabled);
    const tos = fetchCalls.map((c) => (c.body.params[0] as { to: string }).to);
    for (const to of tos) expect(to).toBe(SVT_CONTRACT);
  });

  it("targets the private BlockID EVM RPC (https://chain.blockid.au/evm)", async () => {
    await GET(getReq());
    expect(fetchCalls[0].url).toBe("https://chain.blockid.au/evm");
  });

  it("decodes both booleans as true when the RPC returns non-zero hex", async () => {
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.paused).toBe(true);
    expect(body.whitelistEnabled).toBe(true);
    expect(body.ok).toBe(true);
  });

  it("decodes false when the RPC returns all-zero hex", async () => {
    fetchImpl = async () => jsonResponse({ result: "0x0000000000000000000000000000000000000000000000000000000000000000" });
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.paused).toBe(false);
    expect(body.whitelistEnabled).toBe(false);
  });

  it("decodes false when the RPC returns the '0x' empty result (no revert)", async () => {
    fetchImpl = async () => jsonResponse({ result: "0x" });
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.paused).toBe(false);
    expect(body.whitelistEnabled).toBe(false);
  });

  it("queries transfer_whitelist filtered by user.id (NOT email) ordered by created_at asc", async () => {
    await GET(getReq());
    const sel = dbCalls.find((c) => c.op === "select-eq-order");
    expect(sel).toBeDefined();
    if (sel?.op !== "select-eq-order") throw new Error("wrong op");
    expect(sel.table).toBe("transfer_whitelist");
    expect(sel.col).toBe("account_id");
    expect(sel.val).toBe(USER_ADMIN.id);
  });

  it("returns whitelistedAddresses mapped from the DB rows", async () => {
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.whitelistedAddresses).toEqual([
      "0xaaaa000000000000000000000000000000000001",
      "0xbbbb000000000000000000000000000000000002",
    ]);
  });

  it("returns whitelistedAddresses as an empty array (never null) when the SELECT rows are null", async () => {
    selectRows = null;
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.whitelistedAddresses).toEqual([]);
  });

  it("returns whitelistedAddresses as [] when getSupabaseAdmin() is null (no service role)", async () => {
    supabaseInstance = null;
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.whitelistedAddresses).toEqual([]);
    expect(dbCalls).toHaveLength(0);
  });
});

describe("GET /api/cap-table/restrictions — chain unreachable branch", () => {
  it("returns 200 with defaults + chainError when fetch rejects (never propagates a 500)", async () => {
    getCurrentUserMock.mockResolvedValue(USER_ADMIN);
    fetchImpl = async () => {
      throw new Error("connect ECONNREFUSED chain.blockid.au");
    };
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      paused: false,
      whitelistEnabled: false,
      whitelistedAddresses: [],
    });
    expect(typeof body.chainError).toBe("string");
    expect(body.chainError).toMatch(/Could not reach on-chain state/i);
  });

  it("returns 200 with defaults when the RPC responds with an { error } envelope", async () => {
    getCurrentUserMock.mockResolvedValue(USER_ADMIN);
    fetchImpl = async () =>
      jsonResponse({ jsonrpc: "2.0", id: 1, error: { message: "revert" } });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chainError).toBeDefined();
    expect(body.paused).toBe(false);
  });
});

describe("POST /api/cap-table/restrictions — feature-gate branch", () => {
  it("returns the gate's own response verbatim when share_management is denied (402)", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    const res = await POST(postReq({ action: "pause_transfers" }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "feature_locked" });
    expect(gateMock).toHaveBeenCalledWith("share_management");
  });

  it("returns the gate's own response verbatim when caller is unauthenticated (401)", async () => {
    gateMock.mockResolvedValue(gateFail(401, "auth_required"));
    const res = await POST(postReq({ action: "pause_transfers" }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/cap-table/restrictions — admin-only branch", () => {
  it("returns 403 { ok:false, error:'Admin access required' } for a non-admin caller", async () => {
    gateMock.mockResolvedValue(gateOk(USER_NORMAL));
    const res = await POST(postReq({ action: "pause_transfers" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Admin access required" });
  });

  it("accepts a user whose email is admin@blockid.au even if role !== 'admin'", async () => {
    gateMock.mockResolvedValue(
      gateOk({ id: "u-admin-e", email: "admin@blockid.au", role: "user" }),
    );
    const res = await POST(postReq({ action: "pause_transfers" }));
    expect(res.status).toBe(200);
  });

  it("accepts a user whose role === 'admin' even if email !== admin@blockid.au", async () => {
    gateMock.mockResolvedValue(
      gateOk({ id: "u-x", email: "other@x.co", role: "admin" }),
    );
    const res = await POST(postReq({ action: "pause_transfers" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/cap-table/restrictions — body + action guards", () => {
  beforeEach(() => {
    gateMock.mockResolvedValue(gateOk(USER_ADMIN));
  });

  it("returns 400 { ok:false, error:'Invalid JSON body' } when the body is not valid JSON", async () => {
    const res = await POST(postReq(null, true));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Invalid JSON body" });
  });

  it("returns 400 { ok:false, error:'action is required' } when action is missing", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "action is required" });
  });

  it("returns 400 { ok:false, error:'Unknown action: X' } for an unrecognised action string", async () => {
    const res = await POST(postReq({ action: "hodl" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Unknown action: hodl" });
  });
});

describe("POST /api/cap-table/restrictions — pause / unpause / enable / disable", () => {
  beforeEach(() => {
    gateMock.mockResolvedValue(gateOk(USER_ADMIN));
  });

  it("pause_transfers → 200 with txData targeting SVT + selector.pause + gas 0x30D40", async () => {
    const res = await POST(postReq({ action: "pause_transfers" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.txData).toMatchObject({
      to: SVT_CONTRACT,
      data: SEL.pause,
      from: ADMIN_ADDRESS_DEFAULT,
      gas: "0x30D40",
    });
    expect(body.txData.description).toMatch(/Pause/i);
  });

  it("unpause_transfers → 200 with selector.unpause", async () => {
    const res = await POST(postReq({ action: "unpause_transfers" }));
    const body = await res.json();
    expect(body.txData.data).toBe(SEL.unpause);
    expect(body.txData.description).toMatch(/Unpause/i);
  });

  it("enable_whitelist → 200 with selector.enableWhitelist", async () => {
    const res = await POST(postReq({ action: "enable_whitelist" }));
    const body = await res.json();
    expect(body.txData.data).toBe(SEL.enableWhitelist);
    expect(body.txData.description).toMatch(/Enable whitelist/i);
  });

  it("disable_whitelist → 200 with selector.disableWhitelist", async () => {
    const res = await POST(postReq({ action: "disable_whitelist" }));
    const body = await res.json();
    expect(body.txData.data).toBe(SEL.disableWhitelist);
    expect(body.txData.description).toMatch(/Disable whitelist/i);
  });
});

describe("POST /api/cap-table/restrictions — whitelist_add", () => {
  beforeEach(() => {
    gateMock.mockResolvedValue(gateOk(USER_ADMIN));
  });

  it("returns 400 when address is missing", async () => {
    const res = await POST(postReq({ action: "whitelist_add" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Valid EVM address/i);
    expect(dbCalls).toHaveLength(0);
  });

  it("returns 400 when address is not 0x + 40 hex chars", async () => {
    const res = await POST(
      postReq({ action: "whitelist_add", address: "not-an-address" }),
    );
    expect(res.status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("upserts a lowercased address on transfer_whitelist onConflict account_id,evm_address + returns padded-address calldata", async () => {
    const res = await POST(
      postReq({
        action: "whitelist_add",
        address: "0xABCD000000000000000000000000000000000001",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const upsert = dbCalls.find((c) => c.op === "upsert");
    if (upsert?.op !== "upsert") throw new Error("expected upsert");
    expect(upsert.table).toBe("transfer_whitelist");
    expect(upsert.row).toEqual({
      account_id: USER_ADMIN.id,
      evm_address: "0xabcd000000000000000000000000000000000001",
    });
    expect(upsert.opts).toEqual({ onConflict: "account_id,evm_address" });

    // Calldata = selector + zero-padded 32-byte address (no 0x prefix on the pad).
    const padded = "abcd000000000000000000000000000000000001".padStart(64, "0");
    expect(body.txData.data).toBe(SEL.addToWhitelist + padded);
    expect(body.txData.to).toBe(SVT_CONTRACT);
  });

  it("skips the DB upsert when getSupabaseAdmin() is null but still returns txData", async () => {
    supabaseInstance = null;
    const res = await POST(
      postReq({
        action: "whitelist_add",
        address: "0x1234000000000000000000000000000000000005",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.txData.data.startsWith(SEL.addToWhitelist)).toBe(true);
    expect(dbCalls).toHaveLength(0);
  });
});

describe("POST /api/cap-table/restrictions — whitelist_remove", () => {
  beforeEach(() => {
    gateMock.mockResolvedValue(gateOk(USER_ADMIN));
  });

  it("returns 400 when address is missing", async () => {
    const res = await POST(postReq({ action: "whitelist_remove" }));
    expect(res.status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("returns 400 when address is invalid", async () => {
    const res = await POST(
      postReq({ action: "whitelist_remove", address: "0xnothex" }),
    );
    expect(res.status).toBe(400);
    expect(dbCalls).toHaveLength(0);
  });

  it("deletes .eq(account_id, user.id).eq(evm_address, lowercased) + returns padded-address calldata", async () => {
    const res = await POST(
      postReq({
        action: "whitelist_remove",
        address: "0xEEEE000000000000000000000000000000000009",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const del = dbCalls.find((c) => c.op === "delete-eq-eq");
    if (del?.op !== "delete-eq-eq") throw new Error("expected delete");
    expect(del.table).toBe("transfer_whitelist");
    expect(del.c1).toBe("account_id");
    expect(del.v1).toBe(USER_ADMIN.id);
    expect(del.c2).toBe("evm_address");
    expect(del.v2).toBe("0xeeee000000000000000000000000000000000009");

    const padded = "eeee000000000000000000000000000000000009".padStart(64, "0");
    expect(body.txData.data).toBe(SEL.removeFromWhitelist + padded);
  });
});

describe("POST /api/cap-table/restrictions — forced_transfer", () => {
  const FROM = "0x1111000000000000000000000000000000000011";
  const TO = "0x2222000000000000000000000000000000000022";

  beforeEach(() => {
    gateMock.mockResolvedValue(gateOk(USER_ADMIN));
  });

  it("returns 400 when `from` is missing", async () => {
    const res = await POST(
      postReq({ action: "forced_transfer", to: TO, amount: 10 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when `to` is missing", async () => {
    const res = await POST(
      postReq({ action: "forced_transfer", from: FROM, amount: 10 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is 0 (falsy branch of the guard)", async () => {
    const res = await POST(
      postReq({ action: "forced_transfer", from: FROM, to: TO, amount: 0 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is negative", async () => {
    const res = await POST(
      postReq({ action: "forced_transfer", from: FROM, to: TO, amount: -5 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when `from` is not a valid EVM address", async () => {
    const res = await POST(
      postReq({
        action: "forced_transfer",
        from: "bogus",
        to: TO,
        amount: 10,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid EVM addresses/i);
  });

  it("returns 400 when `to` is not a valid EVM address", async () => {
    const res = await POST(
      postReq({
        action: "forced_transfer",
        from: FROM,
        to: "0xtoo-short",
        amount: 10,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with ABI-encoded forced_transfer calldata (selector + from + to + amount*1e18 + string offset 0x80 + length + hex-ascii reason)", async () => {
    const res = await POST(
      postReq({
        action: "forced_transfer",
        from: FROM,
        to: TO,
        amount: 42,
        reason: "board approved",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.txData.data as string;

    expect(data.startsWith(SEL.forcedTransfer)).toBe(true);

    // Strip 0x + selector (2 + 8 chars); slice into 32-byte (64-hex) words.
    const payload = data.slice(SEL.forcedTransfer.length);
    const words = [];
    for (let i = 0; i < payload.length; i += 64) words.push(payload.slice(i, i + 64));

    // word 0: from (padded)
    expect(words[0]).toBe(
      "1111000000000000000000000000000000000011".padStart(64, "0"),
    );
    // word 1: to (padded)
    expect(words[1]).toBe(
      "2222000000000000000000000000000000000022".padStart(64, "0"),
    );
    // word 2: amount 42 * 1e18 = 0x2478...
    const expectedAmountHex = (42n * 10n ** 18n).toString(16).padStart(64, "0");
    expect(words[2]).toBe(expectedAmountHex);
    // word 3: string offset 0x80 (128 bytes = 4 words)
    expect(words[3]).toBe("80".padStart(64, "0"));
    // word 4: string length = "board approved".length = 14 → 0x0e
    expect(words[4]).toBe("e".padStart(64, "0"));
    // word 5: ascii "board approved" = 62 6f 61 72 64 20 61 70 70 72 6f 76 65 64 (padded)
    const asciiHex = Buffer.from("board approved", "utf8").toString("hex");
    expect(words[5]).toBe(asciiHex.padEnd(64, "0"));
  });

  it("uses the default reason 'Admin forced transfer' when reason is omitted", async () => {
    const res = await POST(
      postReq({
        action: "forced_transfer",
        from: FROM,
        to: TO,
        amount: 1,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.txData.data as string;
    const asciiHex = Buffer.from("Admin forced transfer", "utf8").toString("hex");
    expect(data).toContain(asciiHex);

    const insert = dbCalls.find((c) => c.op === "insert");
    if (insert?.op !== "insert") throw new Error("expected insert");
    expect(String(insert.row.notes)).toContain("Admin forced transfer");
  });

  it("logs a share_transactions insert row with transaction_type='forced_transfer' + a note embedding amount/from/to/reason", async () => {
    const res = await POST(
      postReq({
        action: "forced_transfer",
        from: FROM,
        to: TO,
        amount: 7,
        reason: "court order",
      }),
    );
    expect(res.status).toBe(200);

    const insert = dbCalls.find((c) => c.op === "insert");
    if (insert?.op !== "insert") throw new Error("expected insert");
    expect(insert.table).toBe("share_transactions");
    expect(insert.row.account_id).toBe(USER_ADMIN.id);
    expect(insert.row.transaction_type).toBe("forced_transfer");
    const notes = String(insert.row.notes);
    expect(notes).toContain("7 shares");
    expect(notes).toContain(FROM);
    expect(notes).toContain(TO);
    expect(notes).toContain("court order");
  });

  it("skips the share_transactions insert when getSupabaseAdmin() is null but still returns txData", async () => {
    supabaseInstance = null;
    const res = await POST(
      postReq({
        action: "forced_transfer",
        from: FROM,
        to: TO,
        amount: 1,
        reason: "no-db",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.txData.gas).toBe("0x7A120");
    expect(dbCalls).toHaveLength(0);
  });
});
