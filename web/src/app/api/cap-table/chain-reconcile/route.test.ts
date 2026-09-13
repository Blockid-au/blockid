// Colocated tests for GET/POST /api/cap-table/chain-reconcile (S27-B).
//
//   - GET: 401 anonymous, 404 no project / non-member, viewer allowed and
//     reads the OWNER's register (token + last row through the project id)
//   - POST: feature gate response verbatim; viewer 403; editor runs and
//     persists a row keyed on the OWNER's user id; 409 when not tokenised;
//     chain unreachable → 200 status "unreachable"; push → queues mint/burn
//     on the existing queue and refuses when unreachable (502)

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

vi.mock("server-only", () => ({}));

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", plan: "founder_growth" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const gate = vi.hoisted(() => ({ locked: false }));
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: async () =>
    gate.locked
      ? { ok: false, response: NextResponse.json({ ok: false, error: "feature_locked" }, { status: 402 }) }
      : { ok: true, user: auth.user, uwp: { id: "user-caller", plan: "founder_growth", segment: "founder" } },
}));

const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

const chain = vi.hoisted(() => ({
  snapshot: null as null | { holders: Array<{ holderAddress: string; shares: number }> },
  unreachable: false,
  queued: [] as Array<{ accountId: string; type: string; payload: Record<string, unknown> }>,
}));
vi.mock("@/lib/onchain/read-back", async () => {
  const actual = await vi.importActual<typeof import("@/lib/onchain/read-back")>("@/lib/onchain/read-back");
  return {
    ...actual,
    readTokenHolders: async () => {
      if (chain.unreachable) throw new actual.ChainUnreachableError("ECONNREFUSED");
      return { tokenAddress: "0x", decimals: 18, totalSupplyShares: 0, blockNumber: 1, holders: chain.snapshot?.holders ?? [] };
    },
  };
});
vi.mock("@/lib/blockchain-sync", () => ({
  queueSyncEvent: async (accountId: string, type: string, payload: Record<string, unknown>) => {
    chain.queued.push({ accountId, type, payload });
    return { ok: true, eventId: `ev-${chain.queued.length}` };
  },
}));

import { GET, POST } from "./route";

const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";
const TOKEN = "0xa16e02e87b7454126e5e10d957a927a7f5b5d2be";

function seed(over: Record<string, Array<Record<string, unknown>>> = {}) {
  db.sb = fakeSupabase({
    blockchain_sync_config: [{ account_id: "acct-1", project_id: "proj-1", token_address: TOKEN, token_symbol: "ACME", sync_enabled: true }],
    shareholders: [
      { id: "s1", name: "Ada", shares_held: 600, evm_address: A },
      { id: "s2", name: "Bob", shares_held: 400, evm_address: B },
    ],
    cap_table_chain_reconciliations: [{ id: "r-old", project_id: "proj-1", status: "in_sync", drift_count: 0, summary: {}, taken_at: "2026-09-01T00:00:00Z" }],
    ...over,
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_growth" };
  gate.locked = false;
  chain.unreachable = false;
  chain.snapshot = { holders: [{ holderAddress: A, shares: 600 }, { holderAddress: B, shares: 400 }] };
  chain.queued = [];
  seed();
}

function post(body?: unknown) {
  return POST(new Request("https://blockid.au/api/cap-table/chain-reconcile", { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<Record<string, any>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/cap-table/chain-reconcile", () => {
  beforeEach(reset);

  it("401 anonymous, 404 without a project, 404 non-member", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
    reset();
    scopeState.projectId = null;
    expect((await GET()).status).toBe(404);
    reset();
    scopeState.nonMember = true;
    expect((await GET()).status).toBe(404);
  });

  it("viewer reads the token + last run through the project id and the OWNER's SVI account", async () => {
    scopeState.role = "viewer";
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.token).toEqual({ address: TOKEN, symbol: "ACME", syncEnabled: true });
    expect(body.last.id).toBe("r-old");
    expect(body.role).toBe("viewer");
    expect(db.sb!.hasEq("blockchain_sync_config", "project_id", "proj-1")).toBe(true);
    expect(db.sb!.hasEq("cap_table_chain_reconciliations", "project_id", "proj-1")).toBe(true);
    const keyCall = scopeState.calls.find((c) => c.fn === "findSVIAccountWithFallback");
    expect(keyCall?.email).toBe("owner@x.test");
  });
});

describe("POST /api/cap-table/chain-reconcile", () => {
  beforeEach(reset);

  it("feature gate response verbatim; viewer 403; no token 409", async () => {
    gate.locked = true;
    expect((await post({ action: "run" })).status).toBe(402);
    reset();
    scopeState.role = "viewer";
    expect((await post({ action: "run" })).status).toBe(403);
    reset();
    seed({ blockchain_sync_config: [] });
    const res = await post({ action: "run" });
    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe("no_token");
  });

  it("editor runs: persists an in_sync row keyed on the OWNER's register", async () => {
    scopeState.role = "editor";
    const res = await post({ action: "run" });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe("in_sync");
    expect(body.driftCount).toBe(0);
    expect(db.sb!.hasEq("shareholders", "account_id", "user-owner")).toBe(true);
    expect(db.sb!.hasEq("shareholders", "project_id", "proj-1")).toBe(true);
    const insert = db.sb!.find("cap_table_chain_reconciliations", "insert")[0];
    expect(insert.args[0]).toMatchObject({ project_id: "proj-1", status: "in_sync", drift_count: 0, source: "route", token_address: TOKEN });
  });

  it("drift is recorded with the rows; an empty body defaults to run", async () => {
    chain.snapshot = { holders: [{ holderAddress: A, shares: 590 }, { holderAddress: B, shares: 400 }] };
    const res = await post();
    const body = await json(res);
    expect(body.status).toBe("drift");
    expect(body.driftCount).toBe(1);
    const insert = db.sb!.find("cap_table_chain_reconciliations", "insert")[0].args[0] as { summary: { driftRows: unknown[] } };
    expect(insert.summary.driftRows).toEqual([expect.objectContaining({ shareholder: "Ada", offchain: 600, onchain: 590, delta: 10 })]);
  });

  it("chain unreachable → 200 status unreachable, row persisted, no notification path", async () => {
    chain.unreachable = true;
    const res = await post({ action: "run" });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe("unreachable");
    expect(body.error).toMatch(/ECONNREFUSED/);
    const insert = db.sb!.find("cap_table_chain_reconciliations", "insert")[0].args[0] as { status: string; summary: { kind: string } };
    expect(insert.status).toBe("unreachable");
    expect(insert.summary.kind).toBe("rpc");
  });

  it("push queues mint / burn on the existing sync queue for the token's account; unknown wallets are skipped", async () => {
    chain.snapshot = {
      holders: [
        { holderAddress: A, shares: 590 },
        { holderAddress: B, shares: 450 },
        { holderAddress: "0x00000000000000000000000000000000000000c3", shares: 7 },
      ],
    };
    const res = await post({ action: "push" });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.push.queued).toBe(2);
    expect(body.push.skipped).toBe(1);
    expect(chain.queued).toEqual([
      { accountId: "acct-1", type: "burn", payload: expect.objectContaining({ from: B, amount: 50 }) },
      { accountId: "acct-1", type: "mint", payload: expect.objectContaining({ to: A, amount: 10 }) },
    ]);
  });

  it("push refuses when blockchain sync is paused for the project (409, nothing queued; the run is still recorded)", async () => {
    seed({ blockchain_sync_config: [{ account_id: "acct-1", project_id: "proj-1", token_address: TOKEN, token_symbol: "ACME", sync_enabled: false }] });
    chain.snapshot = { holders: [{ holderAddress: A, shares: 590 }, { holderAddress: B, shares: 400 }] };
    const res = await post({ action: "push" });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("sync_disabled");
    expect(chain.queued).toEqual([]);
    expect(body.last).toMatchObject({ status: "drift" });
  });

  it("push refuses when the chain is unreachable (502, nothing queued)", async () => {
    chain.unreachable = true;
    const res = await post({ action: "push" });
    expect(res.status).toBe(502);
    expect(chain.queued).toEqual([]);
  });

  it("400 on malformed JSON", async () => {
    const res = await POST(new Request("https://blockid.au/api/cap-table/chain-reconcile", { method: "POST", body: "{nope" }));
    expect(res.status).toBe(400);
  });
});
