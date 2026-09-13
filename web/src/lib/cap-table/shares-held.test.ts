// S29-hardening — `incrementSharesHeld`: the atomic RPC first, a once-only
// warn + read-modify-write fallback when migration 0381 is unapplied, and a
// refusal (never a fallback) when the function rejected the write.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { __resetIncrementSharesHeldDetection, incrementSharesHeld, MAX_SHARES_DELTA, type SharesHeldDb } from "./shares-held";

interface FakeOpts {
  rpc?: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { code?: string; message?: string } | null };
  updateError?: { message: string } | null;
  noRpc?: boolean;
}

function fake(opts: FakeOpts = {}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const updates: Array<{ payload: Record<string, unknown>; where: Array<[string, unknown]> }> = [];
  const db: SharesHeldDb = {
    from(table: string) {
      if (table !== "shareholders") throw new Error(`unexpected table ${table}`);
      return {
        update(payload: Record<string, unknown>) {
          const entry = { payload, where: [] as Array<[string, unknown]> };
          updates.push(entry);
          const chain = {
            eq(col: string, val: unknown) { entry.where.push([col, val]); return chain; },
            then(resolve: (v: unknown) => void) { resolve({ data: null, error: opts.updateError ?? null }); },
          };
          return chain;
        },
      };
    },
  };
  if (!opts.noRpc) {
    db.rpc = async (fn, args = {}) => {
      rpcCalls.push({ fn, args });
      return opts.rpc ? opts.rpc(fn, args) : { data: null, error: { code: "42883", message: "function public.increment_shares_held(uuid, bigint) does not exist" } };
    };
  }
  return { db, rpcCalls, updates };
}

beforeEach(() => __resetIncrementSharesHeldDetection());
afterEach(() => vi.restoreAllMocks());

describe("incrementSharesHeld", () => {
  it("calls increment_shares_held(p_shareholder_id, p_delta) and returns the post-increment holding; no UPDATE issued", async () => {
    const f = fake({ rpc: (_fn, args) => ({ data: 1000 + Number(args.p_delta), error: null }) });
    const r = await incrementSharesHeld(f.db, { shareholderId: "sh-1", delta: 250, currentSharesHeld: 1000, fallbackExtra: { share_class_id: "cls-1" } });
    expect(r).toEqual({ ok: true, newSharesHeld: 1250, via: "rpc" });
    expect(f.rpcCalls).toEqual([{ fn: "increment_shares_held", args: { p_shareholder_id: "sh-1", p_delta: 250 } }]);
    expect(f.updates).toHaveLength(0);
    // PostgREST may hand the bigint back as a string.
    const g = fake({ rpc: () => ({ data: "1250", error: null }) });
    expect(await incrementSharesHeld(g.db, { shareholderId: "sh-1", delta: 250, currentSharesHeld: 1000 })).toMatchObject({ ok: true, newSharesHeld: 1250 });
  });

  it("function missing (42883 / PGRST202) → warns once, falls back to read-modify-write with the caller's holding + extra columns / guards, and skips the RPC next time", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = fake();
    const r1 = await incrementSharesHeld(f.db, {
      shareholderId: "sh-1", delta: 250, currentSharesHeld: 1000.7,
      fallbackExtra: { share_class_id: "cls-1" }, fallbackWhere: { account_id: "owner-1" },
    });
    expect(r1).toEqual({ ok: true, newSharesHeld: 1250, via: "update" });
    expect(f.updates).toEqual([{ payload: { shares_held: 1250, share_class_id: "cls-1" }, where: [["id", "sh-1"], ["account_id", "owner-1"]] }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/migration 0381/);

    const r2 = await incrementSharesHeld(f.db, { shareholderId: "sh-2", delta: 10, currentSharesHeld: 5 });
    expect(r2).toEqual({ ok: true, newSharesHeld: 15, via: "update" });
    expect(f.rpcCalls).toHaveLength(1); // not retried once detected missing
    expect(warn).toHaveBeenCalledTimes(1);

    __resetIncrementSharesHeldDetection();
    const g = fake({ rpc: () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.increment_shares_held" } }) });
    expect(await incrementSharesHeld(g.db, { shareholderId: "sh-1", delta: 1, currentSharesHeld: 0 })).toMatchObject({ ok: true, via: "update" });
    // A bare query-builder fake with no rpc() at all behaves the same way.
    const h = fake({ noRpc: true });
    expect(await incrementSharesHeld(h.db, { shareholderId: "sh-1", delta: 1, currentSharesHeld: 0 })).toMatchObject({ ok: true, newSharesHeld: 1, via: "update" });
  });

  it("the function refusing the write (below zero / unknown shareholder / other error) is final — no fallback UPDATE", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const below = fake({ rpc: () => ({ data: null, error: { code: "23514", message: "increment_shares_held: delta -5000 would take shareholder sh-1 below zero" } }) });
    expect(await incrementSharesHeld(below.db, { shareholderId: "sh-1", delta: -5000, currentSharesHeld: 1000 })).toMatchObject({ ok: false, reason: "below_zero" });
    expect(below.updates).toHaveLength(0);
    const missing = fake({ rpc: () => ({ data: null, error: { code: "P0002", message: "increment_shares_held: shareholder sh-9 not found" } }) });
    expect(await incrementSharesHeld(missing.db, { shareholderId: "sh-9", delta: 1, currentSharesHeld: 0 })).toMatchObject({ ok: false, reason: "not_found" });
    expect(missing.updates).toHaveLength(0);
    const other = fake({ rpc: () => ({ data: null, error: { code: "57014", message: "canceling statement" } }) });
    expect(await incrementSharesHeld(other.db, { shareholderId: "sh-1", delta: 1, currentSharesHeld: 0 })).toMatchObject({ ok: false, reason: "db_error" });
    expect(other.updates).toHaveLength(0);
  });

  it("rejects a non-integer / zero delta before touching the DB; the fallback refuses a negative result and surfaces an UPDATE error", async () => {
    const f = fake({ rpc: () => ({ data: 1, error: null }) });
    expect(await incrementSharesHeld(f.db, { shareholderId: "sh-1", delta: 0, currentSharesHeld: 0 })).toEqual({ ok: false, reason: "invalid_delta" });
    expect(await incrementSharesHeld(f.db, { shareholderId: "sh-1", delta: 1.5, currentSharesHeld: 0 })).toEqual({ ok: false, reason: "invalid_delta" });
    expect(await incrementSharesHeld(f.db, { shareholderId: "sh-1", delta: Number.NaN, currentSharesHeld: 0 })).toEqual({ ok: false, reason: "invalid_delta" });
    // S29-review: |delta| is bounded (1e12) so the value survives the JSON round-trip to the bigint RPC intact.
    expect(await incrementSharesHeld(f.db, { shareholderId: "sh-1", delta: MAX_SHARES_DELTA + 1, currentSharesHeld: 0 })).toEqual({ ok: false, reason: "invalid_delta" });
    expect(await incrementSharesHeld(f.db, { shareholderId: "sh-1", delta: -(MAX_SHARES_DELTA + 1), currentSharesHeld: 0 })).toEqual({ ok: false, reason: "invalid_delta" });
    expect(f.rpcCalls).toHaveLength(0);
    expect(await incrementSharesHeld(f.db, { shareholderId: "sh-1", delta: MAX_SHARES_DELTA, currentSharesHeld: 0 })).toEqual({ ok: true, newSharesHeld: 1, via: "rpc" });
    expect(f.rpcCalls).toHaveLength(1);

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const g = fake();
    expect(await incrementSharesHeld(g.db, { shareholderId: "sh-1", delta: -20, currentSharesHeld: 10 })).toEqual({ ok: false, reason: "below_zero" });
    expect(g.updates).toHaveLength(0);
    const h = fake({ updateError: { message: "boom" } });
    expect(await incrementSharesHeld(h.db, { shareholderId: "sh-1", delta: 5, currentSharesHeld: 10 })).toMatchObject({ ok: false, reason: "db_error" });
  });
});
