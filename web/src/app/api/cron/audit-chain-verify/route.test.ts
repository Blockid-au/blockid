// Colocated vitest for /api/cron/audit-chain-verify (S20-A).
// Pins: Bearer CRON_SECRET gate (401), 503 when supabase is unavailable,
// `?dry=1` verifies without persisting, a normal run persists the state,
// `?from=` / `?max=` forwarded, a broken chain is a 200 with status:"broken",
// an RPC error is a 500, force-dynamic and GET === POST.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const verifyMock = vi.hoisted(() => vi.fn());
const persistMock = vi.hoisted(() => vi.fn());
const readStateMock = vi.hoisted(() => vi.fn());
const checkpointMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit/chain-verify", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/audit/chain-verify")>();
  return {
    applyCheckpoint: real.applyCheckpoint,
    verifyAuditChain: (o: unknown) => verifyMock(o),
    persistChainState: (s: unknown) => persistMock(s),
    readChainState: () => readStateMock(),
    crossCheckCheckpoint: (o: unknown) => checkpointMock(o),
  };
});
const adminMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => adminMock() }));

import { GET, POST, dynamic } from "./route";

const OK = { ok: true, status: "ok", checked: 12, from_id: 0, first_broken_id: null, reason: null, last_id: 12, last_hash: "h", pages: 1 };
const SKIPPED = { compared: false, ok: true, checkpoint_id: null, expected_hash: null, actual_hash: null, reason: "full_scan" };

function req(url = "http://localhost/api/cron/audit-chain-verify", auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

describe("audit-chain-verify route", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    delete process.env.AUDIT_CHAIN_VERIFY_FROM;
    adminMock.mockReturnValue({ rpc: vi.fn() });
    verifyMock.mockReset().mockResolvedValue(OK);
    persistMock.mockReset().mockResolvedValue(true);
    readStateMock.mockReset().mockResolvedValue(null);
    checkpointMock.mockReset().mockResolvedValue(SKIPPED);
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("401 without / with a wrong bearer, and when CRON_SECRET is unset", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(undefined, "Bearer nope"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(401);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("runs, persists and returns the state", async () => {
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, status: "ok", checked: 12, dry: false, persisted: true });
    expect(typeof body.ts).toBe("string");
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledWith(expect.objectContaining({ fromId: 0, maxRows: undefined }));
  });

  it("?dry=1 verifies but does not persist", async () => {
    const res = await GET(req("http://localhost/api/cron/audit-chain-verify?dry=1", "Bearer s3cret"));
    const body = await res.json();
    expect(body.dry).toBe(true);
    expect(body.persisted).toBe(false);
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("?from and ?max are forwarded; AUDIT_CHAIN_VERIFY_FROM is the default", async () => {
    await GET(req("http://localhost/api/cron/audit-chain-verify?from=500&max=9000", "Bearer s3cret"));
    expect(verifyMock).toHaveBeenLastCalledWith(expect.objectContaining({ fromId: 500, maxRows: 9000 }));
    process.env.AUDIT_CHAIN_VERIFY_FROM = "42";
    await GET(req(undefined, "Bearer s3cret"));
    expect(verifyMock).toHaveBeenLastCalledWith(expect.objectContaining({ fromId: 42 }));
  });

  it("broken chain → 200 with status:broken (finding, not failure), still persisted", async () => {
    verifyMock.mockResolvedValue({ ...OK, ok: false, status: "broken", first_broken_id: 9, reason: "prev_hash_mismatch" });
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("broken");
    expect(persistMock).toHaveBeenCalledTimes(1);
  });

  it("503 when supabase is unavailable, 500 on an RPC error", async () => {
    verifyMock.mockResolvedValue({ ...OK, ok: false, status: "unknown", error: "supabase_unavailable" });
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(503);
    verifyMock.mockResolvedValue({ ...OK, ok: false, status: "unknown", error: "function does not exist" });
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(500);
  });

  // S20-A review: a windowed run cross-checks the previous run's checkpoint.
  it("full scan: previous state is not read and the checkpoint is skipped", async () => {
    const body = await (await GET(req(undefined, "Bearer s3cret"))).json();
    expect(readStateMock).not.toHaveBeenCalled();
    expect(checkpointMock).toHaveBeenCalledWith(expect.objectContaining({ fromId: 0, previous: null }));
    expect(body.checkpoint).toBeUndefined();
  });

  it("AUDIT_CHAIN_VERIFY_FROM set: previous state is read BEFORE persisting and passed to the cross-check", async () => {
    process.env.AUDIT_CHAIN_VERIFY_FROM = "500";
    const previous = { last_id: 499, last_hash: "h499", status: "ok" };
    readStateMock.mockResolvedValue(previous);
    const order: string[] = [];
    readStateMock.mockImplementation(async () => (order.push("read"), previous));
    persistMock.mockImplementation(async () => (order.push("persist"), true));
    const matched = { compared: true, ok: true, checkpoint_id: 499, expected_hash: "h499", actual_hash: "h499", reason: null };
    checkpointMock.mockResolvedValue(matched);
    const res = await GET(req(undefined, "Bearer s3cret"));
    const body = await res.json();
    expect(order).toEqual(["read", "persist"]);
    expect(checkpointMock).toHaveBeenCalledWith(expect.objectContaining({ fromId: 500, previous }));
    expect(body.status).toBe("ok");
    expect(body.checkpoint).toEqual(matched);
    expect(persistMock.mock.calls[0][0]).toMatchObject({ checkpoint: matched });
  });

  it("checkpoint mismatch → status broken at the checkpoint row even though the window verified", async () => {
    process.env.AUDIT_CHAIN_VERIFY_FROM = "500";
    readStateMock.mockResolvedValue({ last_id: 499, last_hash: "h499", status: "ok" });
    checkpointMock.mockResolvedValue({ compared: true, ok: false, checkpoint_id: 499, expected_hash: "h499", actual_hash: "x", reason: "checkpoint_mismatch" });
    verifyMock.mockResolvedValue({ ...OK, from_id: 500 });
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200); // a finding, not a route failure
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, status: "broken", first_broken_id: 499, reason: "checkpoint_mismatch", checked: 12 });
    expect(persistMock.mock.calls[0][0]).toMatchObject({ status: "broken", reason: "checkpoint_mismatch" });
  });

  it("?from=<id> also triggers the cross-check", async () => {
    await GET(req("http://localhost/api/cron/audit-chain-verify?from=42", "Bearer s3cret"));
    expect(readStateMock).toHaveBeenCalledTimes(1);
    expect(checkpointMock).toHaveBeenCalledWith(expect.objectContaining({ fromId: 42 }));
  });

  it("force-dynamic; POST is GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(POST).toBe(GET);
  });
});
