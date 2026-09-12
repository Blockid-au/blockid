import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAIN_HISTORY_FILE,
  CHAIN_STATE_FILE,
  applyCheckpoint,
  crossCheckCheckpoint,
  persistChainState,
  readChainState,
  readChainStatus,
  verifyAuditChain,
  type ChainVerifyResult,
  type ChainVerifyState,
} from "./chain-verify";

// S20-A — chain verification pages through the RPC, reports the first
// break, degrades to `unknown` when the migration is missing, and the
// persisted state ages out after 48h.

function rpcSequence(pages: Array<{ checked: number; first_broken_id?: number | null; reason?: string | null; last_id: number | null; last_hash?: string | null }>) {
  const rpc = vi.fn();
  for (const p of pages) {
    rpc.mockResolvedValueOnce({
      data: [{ checked: p.checked, first_broken_id: p.first_broken_id ?? null, reason: p.reason ?? null, last_id: p.last_id, last_hash: p.last_hash ?? (p.last_id ? `h${p.last_id}` : null) }],
      error: null,
    });
  }
  return rpc;
}

describe("verifyAuditChain", () => {
  it("walks pages of 5000 until a short page and reports ok", async () => {
    const rpc = rpcSequence([
      { checked: 5000, last_id: 5000 },
      { checked: 5000, last_id: 10000 },
      { checked: 12, last_id: 10012 },
    ]);
    const r = await verifyAuditChain({ db: { rpc } });
    expect(r).toMatchObject({ ok: true, status: "ok", checked: 10012, last_id: 10012, last_hash: "h10012", pages: 3, from_id: 0 });
    expect(rpc).toHaveBeenNthCalledWith(1, "audit_events_verify_chain", { p_from_id: 0, p_limit: 5000 });
    expect(rpc).toHaveBeenNthCalledWith(2, "audit_events_verify_chain", { p_from_id: 5001, p_limit: 5000 });
    expect(rpc).toHaveBeenNthCalledWith(3, "audit_events_verify_chain", { p_from_id: 10001, p_limit: 5000 });
  });

  it("stops at the first broken row", async () => {
    const rpc = rpcSequence([
      { checked: 5000, last_id: 5000 },
      { checked: 41, first_broken_id: 5042, reason: "curr_hash_mismatch", last_id: 5041 },
    ]);
    const r = await verifyAuditChain({ db: { rpc } });
    expect(r).toMatchObject({ ok: false, status: "broken", checked: 5041, first_broken_id: 5042, reason: "curr_hash_mismatch", last_id: 5041 });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("honours fromId and an empty table", async () => {
    const rpc = rpcSequence([{ checked: 0, last_id: null }]);
    const r = await verifyAuditChain({ db: { rpc }, fromId: 777 });
    expect(r).toMatchObject({ ok: true, status: "ok", checked: 0, from_id: 777, last_id: null });
    expect(rpc).toHaveBeenCalledWith("audit_events_verify_chain", { p_from_id: 777, p_limit: 5000 });
  });

  it("missing RPC (migration not applied) → unknown with the error, never throws", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "function audit_events_verify_chain does not exist", code: "42883" } });
    const r = await verifyAuditChain({ db: { rpc } });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("unknown");
    expect(r.error).toMatch(/does not exist/);
  });

  it("rpc throwing → unknown", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network"));
    const r = await verifyAuditChain({ db: { rpc } });
    expect(r.status).toBe("unknown");
    expect(r.error).toBe("network");
  });

  it("no db → supabase_unavailable", async () => {
    const r = await verifyAuditChain({ db: null });
    expect(r.error).toBe("supabase_unavailable");
    expect(r.status).toBe("unknown");
  });

  it("caps rows at maxRows", async () => {
    const rpc = rpcSequence([
      { checked: 5000, last_id: 5000 },
      { checked: 5000, last_id: 10000 },
      { checked: 5000, last_id: 15000 },
    ]);
    const r = await verifyAuditChain({ db: { rpc }, maxRows: 10000 });
    expect(r.checked).toBe(10000);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe("persist + read state", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function state(over: Partial<ChainVerifyState> = {}): ChainVerifyState {
    return {
      ok: true,
      status: "ok",
      checked: 10,
      from_id: 0,
      first_broken_id: null,
      reason: null,
      last_id: 10,
      last_hash: "h",
      pages: 1,
      ts: new Date().toISOString(),
      dry: false,
      duration_ms: 5,
      ...over,
    };
  }

  it("writes the state file + appends history; readChainStatus reads it back", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "audit-chain-"));
    expect(await persistChainState(state(), dir)).toBe(true);
    expect(await persistChainState(state({ status: "broken", ok: false, first_broken_id: 3 }), dir)).toBe(true);
    const history = readFileSync(path.join(dir, CHAIN_HISTORY_FILE), "utf8").trim().split("\n");
    expect(history).toHaveLength(2);
    const s = await readChainStatus(dir);
    expect(s.status).toBe("broken");
    expect(s.first_broken_id).toBe(3);
  });

  it("stale (> 48h) or missing state → unknown", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "audit-chain-"));
    expect((await readChainStatus(dir)).status).toBe("unknown");
    mkdirSync(path.dirname(path.join(dir, CHAIN_STATE_FILE)), { recursive: true });
    writeFileSync(path.join(dir, CHAIN_STATE_FILE), JSON.stringify(state({ ts: new Date(Date.now() - 49 * 3600 * 1000).toISOString() })));
    expect((await readChainStatus(dir)).status).toBe("unknown");
    writeFileSync(path.join(dir, CHAIN_STATE_FILE), "{not json");
    expect((await readChainStatus(dir)).status).toBe("unknown");
  });

  it("readChainState returns the raw persisted run, null when missing / unparsable", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "audit-chain-"));
    expect(await readChainState(dir)).toBeNull();
    await persistChainState(state({ last_id: 77, last_hash: "h77" }), dir);
    expect(await readChainState(dir)).toMatchObject({ last_id: 77, last_hash: "h77", status: "ok" });
    writeFileSync(path.join(dir, CHAIN_STATE_FILE), "{not json");
    expect(await readChainState(dir)).toBeNull();
    writeFileSync(path.join(dir, CHAIN_STATE_FILE), "null");
    expect(await readChainState(dir)).toBeNull();
  });
});

// S20-A review (verifier note): a windowed run (AUDIT_CHAIN_VERIFY_FROM > 0)
// trusts rows before `from` as stored. The previous run's persisted
// last_id / last_hash is the checkpoint: the live row must still carry
// that hash, otherwise the prefix was rewritten and the run is `broken`.
describe("crossCheckCheckpoint", () => {
  const prev = { last_id: 499, last_hash: "h499", status: "ok" as const };

  function rpcRow(row: { last_id: number | null; last_hash?: string | null; first_broken_id?: number | null }) {
    return vi.fn().mockResolvedValue({
      data: [{ checked: row.first_broken_id ? 0 : 1, first_broken_id: row.first_broken_id ?? null, reason: null, last_id: row.last_id, last_hash: row.last_hash ?? null }],
      error: null,
    });
  }

  it("full scan (from 0) never compares", async () => {
    const rpc = vi.fn();
    const c = await crossCheckCheckpoint({ db: { rpc }, fromId: 0, previous: prev });
    expect(c).toMatchObject({ compared: false, ok: true, reason: "full_scan" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("no previous state, no last_hash, or a previous broken run → skipped (ok)", async () => {
    const rpc = vi.fn();
    expect(await crossCheckCheckpoint({ db: { rpc }, fromId: 500, previous: null })).toMatchObject({ compared: false, ok: true, reason: "no_previous_checkpoint" });
    expect(await crossCheckCheckpoint({ db: { rpc }, fromId: 500, previous: { last_id: null, last_hash: null, status: "ok" } })).toMatchObject({ compared: false, reason: "no_previous_checkpoint" });
    expect(await crossCheckCheckpoint({ db: { rpc }, fromId: 500, previous: { ...prev, status: "broken" } })).toMatchObject({ compared: false, reason: "no_previous_checkpoint" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("matching hash at the checkpoint row (= from - 1 for an incremental run) → ok", async () => {
    const rpc = rpcRow({ last_id: 499, last_hash: "h499" });
    const c = await crossCheckCheckpoint({ db: { rpc }, fromId: 500, previous: prev });
    expect(c).toEqual({ compared: true, ok: true, checkpoint_id: 499, expected_hash: "h499", actual_hash: "h499", reason: null });
    expect(rpc).toHaveBeenCalledWith("audit_events_verify_chain", { p_from_id: 499, p_limit: 1 });
  });

  it("the checkpoint row also holds when FROM stays fixed and last_id has moved past it", async () => {
    const rpc = rpcRow({ last_id: 9000, last_hash: "h9000" });
    const c = await crossCheckCheckpoint({ db: { rpc }, fromId: 500, previous: { last_id: 9000, last_hash: "h9000", status: "ok" } });
    expect(c.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("audit_events_verify_chain", { p_from_id: 9000, p_limit: 1 });
  });

  it("hash differs → checkpoint_mismatch (prefix rewritten)", async () => {
    const rpc = rpcRow({ last_id: 499, last_hash: "TAMPERED" });
    const c = await crossCheckCheckpoint({ db: { rpc }, fromId: 500, previous: prev });
    expect(c).toMatchObject({ compared: true, ok: false, checkpoint_id: 499, expected_hash: "h499", actual_hash: "TAMPERED", reason: "checkpoint_mismatch" });
  });

  it("row gone (RPC returns a later id, nothing, or that row fails its recompute) → checkpoint_missing", async () => {
    expect((await crossCheckCheckpoint({ db: { rpc: rpcRow({ last_id: 503, last_hash: "h503" }) }, fromId: 500, previous: prev })).reason).toBe("checkpoint_missing");
    expect((await crossCheckCheckpoint({ db: { rpc: rpcRow({ last_id: null }) }, fromId: 500, previous: prev })).reason).toBe("checkpoint_missing");
    expect((await crossCheckCheckpoint({ db: { rpc: rpcRow({ last_id: 499, last_hash: "h499", first_broken_id: 499 }) }, fromId: 500, previous: prev })).reason).toBe("checkpoint_missing");
  });

  it("RPC error / throw / no db → checkpoint_rpc_error, NOT ok (fail closed)", async () => {
    const errRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await crossCheckCheckpoint({ db: { rpc: errRpc }, fromId: 500, previous: prev })).toMatchObject({ compared: true, ok: false, reason: "checkpoint_rpc_error" });
    const throwRpc = vi.fn().mockRejectedValue(new Error("net"));
    expect((await crossCheckCheckpoint({ db: { rpc: throwRpc }, fromId: 500, previous: prev })).reason).toBe("checkpoint_rpc_error");
    expect((await crossCheckCheckpoint({ db: null, fromId: 500, previous: prev })).ok).toBe(false);
  });
});

describe("applyCheckpoint", () => {
  const okResult: ChainVerifyResult = { ok: true, status: "ok", checked: 10, from_id: 500, first_broken_id: null, reason: null, last_id: 509, last_hash: "h509", pages: 1 };

  it("a failed checkpoint turns an ok run into broken at the checkpoint row", () => {
    const r = applyCheckpoint(okResult, { compared: true, ok: false, checkpoint_id: 499, expected_hash: "h499", actual_hash: "x", reason: "checkpoint_mismatch" });
    expect(r).toMatchObject({ ok: false, status: "broken", first_broken_id: 499, reason: "checkpoint_mismatch", checked: 10, last_id: 509 });
  });

  it("an ok / skipped checkpoint leaves the result untouched; a broken run keeps its own break", () => {
    const ok = { compared: true, ok: true, checkpoint_id: 499, expected_hash: "h", actual_hash: "h", reason: null } as const;
    expect(applyCheckpoint(okResult, ok)).toBe(okResult);
    const broken: ChainVerifyResult = { ...okResult, ok: false, status: "broken", first_broken_id: 505, reason: "curr_hash_mismatch" };
    const r = applyCheckpoint(broken, { ...ok, ok: false, reason: "checkpoint_mismatch" });
    expect(r.first_broken_id).toBe(505);
    expect(r.reason).toBe("curr_hash_mismatch");
  });
});
