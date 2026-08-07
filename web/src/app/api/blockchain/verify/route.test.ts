// Unit tests for POST /api/blockchain/verify — P9-blockchain-verify-route.
//
// The verify route is the off-chain-vs-on-chain reconciliation entry point:
// a founder with a deployed cap-table token hits it to compare their
// `shareholders.shares_held` rows against the on-chain ERC-20 balances at
// the token contract address returned by `getSyncConfig`. The on-chain
// probe is a stub today (route.ts:62 TODO) so `onChainShares` is null and
// `match: true` for every row — but the ROUTE CONTRACT itself is exercised
// by the UI (workspace/blockchain page), so this suite pins the wire shape
// against silent drift.
//
// Silent regressions this suite pins against:
//   - Dropping the feature-gate call → an anonymous caller triggers the
//     Supabase shareholders query (data leak + cost).
//   - Dropping `dynamic = "force-dynamic"` → the response ends up cached
//     across founders (Next.js App Router default).
//   - Passing the wrong feature key to the gate → the wrong entitlement
//     branch is tested (e.g. `blockchain.tokens` vs `blockchain.sync`).
//   - Regressing the "no tokenAddress" branch to 500 instead of 404 → the
//     UI's "deploy your token first" onboarding CTA is unreachable.
//   - Regressing the `getSyncConfig` result-is-null branch (a fresh
//     account with no sync row) to 500 → same UX breakage.
//   - Regressing the `getSupabaseAdmin() === null` branch from 503 to 500
//     → the front-end retry timer branches on 503 (transient) vs 500
//     (bug — page a human).
//   - Dropping the account_id filter on the shareholders query → data
//     leak (a founder sees another founder's cap table).
//   - Regressing the "no shareholders" branch to 500 → a fresh account
//     with a deployed token but no shareholders yet cannot open the page.
//   - Dropping the `Number(shares_held)` cast → a shareholders row with
//     a bigint / string value ships to the UI as a string and breaks
//     downstream numeric comparisons.
//   - Regressing the "shareholder without evm_address" branch to
//     `match: false` → every non-web3 shareholder appears in the
//     `discrepancies` list and false-flags the reconciliation.
//   - Dropping the `evmAddress` passthrough on the per-row envelope →
//     the UI cannot render the wallet-address column.
//   - Dropping the `tokenAddress` + `tokenSymbol` echo on the response
//     → the UI cannot render the reconciliation-header context.
//   - Regressing the `discrepancies = results.filter(r => !r.match)`
//     projection (currently always empty — but the invariant "every row
//     in `discrepancies` MUST have `match: false`" is the contract that
//     the on-chain-read implementation will slot into).
//
// The feature-gate + supabase + blockchain-sync libs are all mocked so
// this suite asserts pure route wiring, not underlying lib behaviour.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

const getSyncConfigMock = vi.fn();
vi.mock("@/lib/blockchain-sync", () => ({
  getSyncConfig: (accountId: string) => getSyncConfigMock(accountId),
}));

type Shareholder = {
  id: string;
  name: string;
  shares_held: number | string;
  evm_address: string | null;
};
type SelectResult = { data: Shareholder[] | null };
const eqMock = vi.fn<(col: string, val: unknown) => Promise<SelectResult>>();
const selectMock = vi.fn((_col: string) => ({
  eq: (col: string, val: unknown) => eqMock(col, val),
}));
const fromMock = vi.fn((_table: string) => ({
  select: (col: string) => selectMock(col),
}));
const getSupabaseAdminMock = vi.fn<() => { from: typeof fromMock } | null>(
  () => ({ from: fromMock }),
);
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { POST } from "./route";

const USER = { id: "u-42", email: "founder@x.co" };

function gateOk() {
  return {
    ok: true,
    user: USER,
    uwp: { id: USER.id, plan: "pro", segment: "founder" },
  };
}

function gateFail(status: number, error: string) {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error }, { status }),
  };
}

function syncConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sc-1",
    accountId: USER.id,
    syncEnabled: true,
    syncState: "on",
    tokenAddress: "0xabc0000000000000000000000000000000000001",
    tokenSymbol: "AUSX",
    tokenName: "Auschain Cap-Table Token",
    lastSyncAt: null,
    lastSyncBlock: null,
    pendingEvents: 0,
    autoSyncTransfers: true,
    ...overrides,
  };
}

beforeEach(() => {
  gateMock.mockReset();
  getSyncConfigMock.mockReset();
  eqMock.mockReset();
  selectMock.mockClear();
  fromMock.mockClear();
  getSupabaseAdminMock.mockReset().mockReturnValue({ from: fromMock });
});

describe("POST /api/blockchain/verify", () => {
  it("passes the 'blockchain.sync' feature key to the gate", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    await POST();
    expect(gateMock).toHaveBeenCalledWith("blockchain.sync");
  });

  it("returns the gate's 401 response verbatim when the caller is anonymous", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
    expect(getSyncConfigMock).not.toHaveBeenCalled();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns the gate's 402 feature_locked response verbatim when the plan lacks the feature", async () => {
    gateMock.mockResolvedValue(gateFail(402, "feature_locked"));
    const res = await POST();
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("feature_locked");
    expect(getSyncConfigMock).not.toHaveBeenCalled();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("looks up the sync config by the authenticated user's id (not the request body)", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    eqMock.mockResolvedValue({ data: [] });
    await POST();
    expect(getSyncConfigMock).toHaveBeenCalledWith(USER.id);
    expect(getSyncConfigMock).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when getSyncConfig resolves null (fresh account, no sync row)", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("No token deployed for this account");
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the sync config exists but tokenAddress is null (sync toggled on but no token deployed)", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig({ tokenAddress: null }));
    const res = await POST();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("No token deployed for this account");
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 503 when getSupabaseAdmin returns null (env var missing / transient DB config)", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Database not configured");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("queries the shareholders table with the account_id = user.id filter", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    eqMock.mockResolvedValue({ data: [] });
    await POST();
    expect(fromMock).toHaveBeenCalledWith("shareholders");
    expect(selectMock).toHaveBeenCalledWith("id, name, shares_held, evm_address");
    expect(eqMock).toHaveBeenCalledWith("account_id", USER.id);
  });

  it("returns { verified: 0, discrepancies: [], message } when the shareholders query returns []", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    eqMock.mockResolvedValue({ data: [] });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      verified: 0,
      discrepancies: [],
      message: "No shareholders found",
    });
    // The "no shareholders" short-circuit should NOT echo tokenAddress /
    // tokenSymbol — pin that so a UI-side truthy check on tokenAddress
    // doesn't accidentally start rendering an empty header.
    expect(body.tokenAddress).toBeUndefined();
    expect(body.tokenSymbol).toBeUndefined();
    expect(body.results).toBeUndefined();
  });

  it("returns the same 'no shareholders' branch when the shareholders query returns null (RLS-denied read)", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    eqMock.mockResolvedValue({ data: null });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.verified).toBe(0);
    expect(body.discrepancies).toEqual([]);
    expect(body.message).toBe("No shareholders found");
  });

  it("classifies a shareholder without an evm_address as onChainShares=null, match=true, evmAddress=null (skip-verification path)", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    eqMock.mockResolvedValue({
      data: [{ id: "sh-1", name: "Alice", shares_held: 100, evm_address: null }],
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.verified).toBe(1);
    expect(body.results).toEqual([
      {
        name: "Alice",
        offChainShares: 100,
        onChainShares: null,
        match: true,
        evmAddress: null,
      },
    ]);
    expect(body.discrepancies).toEqual([]);
  });

  it("preserves the shareholder's evm_address on the response envelope when present (UI wallet column)", async () => {
    const addr = "0xdEaD00000000000000000000000000000000BeEf";
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    eqMock.mockResolvedValue({
      data: [{ id: "sh-1", name: "Bob", shares_held: 500, evm_address: addr }],
    });
    const res = await POST();
    const body = await res.json();
    expect(body.results[0].evmAddress).toBe(addr);
    expect(body.results[0].onChainShares).toBeNull();
    expect(body.results[0].match).toBe(true);
    expect(body.results[0].offChainShares).toBe(500);
  });

  it("casts shares_held to Number so a string / bigint from the DB doesn't leak into the response", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    // Supabase can return numeric columns as strings when the client is
    // configured that way — the Number() cast at route.ts:54,67 is the
    // guard.
    eqMock.mockResolvedValue({
      data: [
        { id: "sh-1", name: "Alice", shares_held: "1000", evm_address: null },
        { id: "sh-2", name: "Bob", shares_held: "2500", evm_address: "0x00" },
      ],
    });
    const res = await POST();
    const body = await res.json();
    expect(body.results[0].offChainShares).toBe(1000);
    expect(typeof body.results[0].offChainShares).toBe("number");
    expect(body.results[1].offChainShares).toBe(2500);
    expect(typeof body.results[1].offChainShares).toBe("number");
  });

  it("returns the tokenAddress + tokenSymbol from the sync config on the happy-path response", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(
      syncConfig({
        tokenAddress: "0x1111111111111111111111111111111111111111",
        tokenSymbol: "AUSCAP",
      }),
    );
    eqMock.mockResolvedValue({
      data: [{ id: "sh-1", name: "Alice", shares_held: 100, evm_address: null }],
    });
    const res = await POST();
    const body = await res.json();
    expect(body.tokenAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(body.tokenSymbol).toBe("AUSCAP");
  });

  it("passes through a null tokenSymbol from the sync config (a deployed token may not have a symbol set yet)", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(
      syncConfig({
        tokenAddress: "0x2222222222222222222222222222222222222222",
        tokenSymbol: null,
      }),
    );
    eqMock.mockResolvedValue({
      data: [{ id: "sh-1", name: "Alice", shares_held: 1, evm_address: null }],
    });
    const res = await POST();
    const body = await res.json();
    expect(body.tokenAddress).toBe("0x2222222222222222222222222222222222222222");
    expect(body.tokenSymbol).toBeNull();
  });

  it("returns `verified` equal to the shareholder count (including skipped-verification rows)", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    eqMock.mockResolvedValue({
      data: [
        { id: "sh-1", name: "Alice", shares_held: 100, evm_address: null },
        { id: "sh-2", name: "Bob", shares_held: 200, evm_address: "0xaa" },
        { id: "sh-3", name: "Carol", shares_held: 300, evm_address: null },
        { id: "sh-4", name: "Dan", shares_held: 400, evm_address: "0xbb" },
      ],
    });
    const res = await POST();
    const body = await res.json();
    // `verified` is the total row count, not just the on-chain-address rows.
    expect(body.verified).toBe(4);
    expect(body.results).toHaveLength(4);
  });

  it("preserves shareholder order (input order === output order) so the UI can align rows against its own fetch", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    eqMock.mockResolvedValue({
      data: [
        { id: "sh-3", name: "Zoe", shares_held: 1, evm_address: null },
        { id: "sh-1", name: "Alice", shares_held: 2, evm_address: null },
        { id: "sh-2", name: "Bob", shares_held: 3, evm_address: null },
      ],
    });
    const res = await POST();
    const body = await res.json();
    expect(body.results.map((r: { name: string }) => r.name)).toEqual([
      "Zoe",
      "Alice",
      "Bob",
    ]);
  });

  it("returns discrepancies=[] when every row has match=true (current on-chain-stub invariant)", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    eqMock.mockResolvedValue({
      data: [
        { id: "sh-1", name: "Alice", shares_held: 100, evm_address: null },
        { id: "sh-2", name: "Bob", shares_held: 200, evm_address: "0xaa" },
      ],
    });
    const res = await POST();
    const body = await res.json();
    expect(body.discrepancies).toEqual([]);
    // Every result row must have match=true today — pin the invariant so
    // the on-chain-read implementation slotting in later has to actively
    // opt into `match: false` for a discrepancy row.
    expect(body.results.every((r: { match: boolean }) => r.match === true)).toBe(true);
  });

  it("returns ok:true and 200 on the happy path (envelope shape pinned)", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    eqMock.mockResolvedValue({
      data: [{ id: "sh-1", name: "Alice", shares_held: 100, evm_address: "0xaa" }],
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "discrepancies",
      "ok",
      "results",
      "tokenAddress",
      "tokenSymbol",
      "verified",
    ]);
    expect(body.ok).toBe(true);
  });

  it("does NOT call getSyncConfig when the gate rejects (short-circuit ordering)", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    await POST();
    expect(getSyncConfigMock).not.toHaveBeenCalled();
  });

  it("does NOT call the supabase shareholders query when the tokenAddress guard trips", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig({ tokenAddress: null }));
    await POST();
    expect(fromMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
    expect(eqMock).not.toHaveBeenCalled();
  });

  it("does NOT call the supabase shareholders query when the DB config guard trips", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    getSupabaseAdminMock.mockReturnValue(null);
    await POST();
    expect(fromMock).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
    expect(eqMock).not.toHaveBeenCalled();
  });

  it("issues exactly one shareholders query per POST (no accidental double-fetch)", async () => {
    gateMock.mockResolvedValue(gateOk());
    getSyncConfigMock.mockResolvedValue(syncConfig());
    eqMock.mockResolvedValue({
      data: [{ id: "sh-1", name: "Alice", shares_held: 100, evm_address: "0xaa" }],
    });
    await POST();
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(eqMock).toHaveBeenCalledTimes(1);
  });
});

describe("route module invariants", () => {
  it("exports `dynamic = 'force-dynamic'` so the response is not statically cached across founders", async () => {
    const mod = await import("./route");
    expect((mod as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });
});
