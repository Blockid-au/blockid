import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAIN_HISTORY_FILE,
  CHAIN_STATE_FILE,
  persistChainState,
  readChainStatus,
  verifyAuditChain,
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
});
