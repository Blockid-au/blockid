// Colocated vitest for /api/cron/blockchain-sync — the 5-minutely worker that
// drains the per-account blockchain sync queue.
//
// The route sits between Supabase and the sync engine (`processSyncQueue`) and
// its behaviour is boring on purpose: the sync engine owns the retry/backoff
// logic, and the cron entry-point exists only to fan an "any pending events?"
// query out to N account-scoped drain calls. Silent regressions this suite
// pins against:
//
//   (a) losing `export const dynamic = "force-dynamic"` — a cached response
//       would starve the sync queue between build boundaries;
//   (b) losing the CRON_SECRET auth gate — anonymous callers could trigger
//       arbitrary numbers of on-chain drains and rack up gas cost;
//   (c) breaking POST↔GET parity — both verbs must delegate to the same
//       handler because crontab shells use POST for retryability while
//       health-checks use GET;
//   (d) forgetting the `noop: true` marker on the empty-queue envelope — the
//       cron-runner uses that flag to skip a write to cron-health.jsonl, and
//       losing it re-introduces the ~290 lines/day of green-tick noise the
//       comment at route.ts:29-30 documents;
//   (e) drift on the Supabase filter shape — must remain
//       `.from("blockchain_sync_config").select("account_id")
//         .eq("sync_enabled", true).gt("pending_events", 0)` because the
//       gt(0) predicate is what keeps the drain loop from spinning on
//       already-empty rows;
//   (f) drift on the fan-out shape — every returned account_id must be
//       forwarded verbatim into `processSyncQueue()` and the aggregate
//       totals (`totalProcessed / totalSynced / totalFailed`) must be a
//       straight sum of the per-account results;
//   (g) leaking an internal error message on the 500 path — the route MUST
//       return the sanitised sentinel `"Sync cron failed"` and never expose
//       the underlying Supabase / RPC error body.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const getSupabaseAdminMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const processSyncQueueMock = vi.fn();
vi.mock("@/lib/blockchain-sync", () => ({
  processSyncQueue: (accountId: string) => processSyncQueueMock(accountId),
}));

import * as routeModule from "./route";
import { GET, POST } from "./route";

const SECRET = "cron-secret-blockchain-sync-value";

type QueueResult = {
  processed: number;
  synced: number;
  failed: number;
  remaining: number;
};

type AccountRow = { account_id: string };

function makeSupabase(
  rows: AccountRow[] | null,
  opts: { throwOnGt?: unknown } = {},
) {
  const gt = vi.fn(() => {
    if (opts.throwOnGt) throw opts.throwOnGt;
    return Promise.resolve({ data: rows, error: null });
  });
  const eq = vi.fn(() => ({ gt }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, from, select, eq, gt };
}

function req(method: "GET" | "POST", headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/blockchain-sync", { method, headers });
}

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
  getSupabaseAdminMock.mockReset();
  processSyncQueueMock.mockReset();
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("/api/cron/blockchain-sync — route module shape", () => {
  it("pins `export const dynamic = 'force-dynamic'` so the response is never cached", () => {
    expect((routeModule as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });

  it("POST is the same function reference as GET (single-handler re-export)", () => {
    expect(POST).toBe(GET);
  });
});

describe("GET /api/cron/blockchain-sync — CRON_SECRET auth gate", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(processSyncQueueMock).not.toHaveBeenCalled();
  });

  it("returns 401 on wrong bearer secret and does not touch Supabase", async () => {
    const res = await GET(req("GET", { authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(processSyncQueueMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the Bearer prefix is omitted (raw secret rejected)", async () => {
    const res = await GET(req("GET", { authorization: SECRET }));
    expect(res.status).toBe(401);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("is case-sensitive — lowercase 'bearer' is not accepted", async () => {
    const res = await GET(req("GET", { authorization: `bearer ${SECRET}` }));
    expect(res.status).toBe(401);
  });

  it("returns 401 with an empty Authorization header", async () => {
    const res = await GET(req("GET", { authorization: "" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 under a non-Bearer scheme even with the correct secret", async () => {
    const res = await GET(req("GET", { authorization: `Basic ${SECRET}` }));
    expect(res.status).toBe(401);
  });

  it("fails closed with 401 when CRON_SECRET is unset (bare `Bearer ` also 401)", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("GET", { authorization: "Bearer " }));
    expect(res.status).toBe(401);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/blockchain-sync — Supabase configuration gate", () => {
  it("returns 503 when getSupabaseAdmin() returns null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "Supabase not configured" });
    expect(processSyncQueueMock).not.toHaveBeenCalled();
  });

  it("does not call processSyncQueue when Supabase is unconfigured (no partial fan-out)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(processSyncQueueMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/blockchain-sync — empty-queue noop envelope", () => {
  it("returns 200 + { ok: true, noop: true, accounts: 0 } when the query yields []", async () => {
    const sb = makeSupabase([]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.noop).toBe(true);
    expect(body.accounts).toBe(0);
    expect(body.message).toBe("No pending events");
  });

  it("returns the same noop envelope when the query yields null (Supabase 'no rows')", async () => {
    const sb = makeSupabase(null);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.noop).toBe(true);
    expect(body.accounts).toBe(0);
  });

  it("does NOT invoke processSyncQueue when the queue is empty (no wasted RPC)", async () => {
    const sb = makeSupabase([]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(processSyncQueueMock).not.toHaveBeenCalled();
  });

  it("noop envelope carries the `noop: true` flag the cron-runner keys on to skip cron-health.jsonl", async () => {
    // Documented at route.ts:29-30 as the reason for the marker.
    const sb = makeSupabase([]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.noop).toBe(true);
  });
});

describe("GET /api/cron/blockchain-sync — Supabase filter shape", () => {
  it("queries the `blockchain_sync_config` table (not a look-alike sibling)", async () => {
    const sb = makeSupabase([]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(sb.from).toHaveBeenCalledWith("blockchain_sync_config");
  });

  it("selects exactly `account_id` — no over-fetching of secrets or endpoint URLs", async () => {
    const sb = makeSupabase([]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(sb.select).toHaveBeenCalledWith("account_id");
  });

  it("filters `sync_enabled = true` so paused/off accounts never drain", async () => {
    const sb = makeSupabase([]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(sb.eq).toHaveBeenCalledWith("sync_enabled", true);
  });

  it("filters `pending_events > 0` — the loop must never spin on empty accounts", async () => {
    const sb = makeSupabase([]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(sb.gt).toHaveBeenCalledWith("pending_events", 0);
  });
});

describe("GET /api/cron/blockchain-sync — happy-path fan-out", () => {
  const R = (
    p: number,
    s: number,
    f: number,
    r: number,
  ): QueueResult => ({ processed: p, synced: s, failed: f, remaining: r });

  it("invokes processSyncQueue exactly once per account (single-account case)", async () => {
    const sb = makeSupabase([{ account_id: "acct-A" }]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    processSyncQueueMock.mockResolvedValue(R(3, 3, 0, 0));
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(processSyncQueueMock).toHaveBeenCalledTimes(1);
    expect(processSyncQueueMock).toHaveBeenCalledWith("acct-A");
  });

  it("fans out across every returned account in order", async () => {
    const sb = makeSupabase([
      { account_id: "acct-A" },
      { account_id: "acct-B" },
      { account_id: "acct-C" },
    ]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    processSyncQueueMock.mockResolvedValue(R(1, 1, 0, 0));
    await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(processSyncQueueMock).toHaveBeenCalledTimes(3);
    expect(processSyncQueueMock.mock.calls.map((c) => c[0])).toEqual([
      "acct-A",
      "acct-B",
      "acct-C",
    ]);
  });

  it("returns { ok: true, accounts: N } echoing the queue length", async () => {
    const sb = makeSupabase([
      { account_id: "a" },
      { account_id: "b" },
    ]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    processSyncQueueMock.mockResolvedValue(R(2, 2, 0, 0));
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.accounts).toBe(2);
  });

  it("aggregate totals are the straight sum of per-account processed/synced/failed", async () => {
    const sb = makeSupabase([
      { account_id: "a" },
      { account_id: "b" },
      { account_id: "c" },
    ]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    processSyncQueueMock
      .mockResolvedValueOnce(R(4, 3, 1, 2))
      .mockResolvedValueOnce(R(2, 2, 0, 0))
      .mockResolvedValueOnce(R(5, 4, 1, 7));
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.totalProcessed).toBe(11);
    expect(body.totalSynced).toBe(9);
    expect(body.totalFailed).toBe(2);
  });

  it("results[] carries { accountId, result } verbatim in the fan-out order", async () => {
    const sb = makeSupabase([
      { account_id: "acct-A" },
      { account_id: "acct-B" },
    ]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    const rA = R(3, 2, 1, 5);
    const rB = R(1, 1, 0, 0);
    processSyncQueueMock
      .mockResolvedValueOnce(rA)
      .mockResolvedValueOnce(rB);
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.results).toEqual([
      { accountId: "acct-A", result: rA },
      { accountId: "acct-B", result: rB },
    ]);
  });

  it("happy-path envelope does NOT carry the `noop` marker (only empty-queue does)", async () => {
    const sb = makeSupabase([{ account_id: "acct-A" }]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    processSyncQueueMock.mockResolvedValue(R(1, 1, 0, 0));
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.noop).toBeUndefined();
  });

  it("happy-path Content-Type is application/json (NextResponse.json default)", async () => {
    const sb = makeSupabase([{ account_id: "acct-A" }]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    processSyncQueueMock.mockResolvedValue(R(1, 1, 0, 0));
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/);
  });

  it("aggregate totals are zero when every account drains a zero-work result", async () => {
    const sb = makeSupabase([
      { account_id: "a" },
      { account_id: "b" },
    ]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    processSyncQueueMock.mockResolvedValue(R(0, 0, 0, 0));
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.totalProcessed).toBe(0);
    expect(body.totalSynced).toBe(0);
    expect(body.totalFailed).toBe(0);
    expect(body.accounts).toBe(2);
  });
});

describe("GET /api/cron/blockchain-sync — error handling", () => {
  it("returns 500 + sanitised sentinel when the Supabase query throws", async () => {
    const sb = makeSupabase(null, {
      throwOnGt: new Error("PGRST-secret-internal-detail"),
    });
    getSupabaseAdminMock.mockReturnValue(sb.client);
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Sync cron failed" });
  });

  it("does NOT leak the underlying error message on the 500 path", async () => {
    const sb = makeSupabase(null, {
      throwOnGt: new Error("postgres://user:password@host/db is broken"),
    });
    getSupabaseAdminMock.mockReturnValue(sb.client);
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.error).toBe("Sync cron failed");
    expect(JSON.stringify(body)).not.toMatch(/password/);
    expect(JSON.stringify(body)).not.toMatch(/postgres:/);
  });

  it("returns 500 when processSyncQueue rejects (per-account failure kills the tick)", async () => {
    const sb = makeSupabase([{ account_id: "acct-A" }]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    processSyncQueueMock.mockRejectedValue(new Error("chain RPC down"));
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("stops fan-out on first rejection — the second account is not drained", async () => {
    // Documents the current serial-await behaviour at route.ts:39-45.
    // If this ever changes to Promise.all, that intent should be reflected
    // in the route + here.
    const sb = makeSupabase([
      { account_id: "acct-A" },
      { account_id: "acct-B" },
    ]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    processSyncQueueMock
      .mockRejectedValueOnce(new Error("chain RPC down"))
      .mockResolvedValueOnce({ processed: 1, synced: 1, failed: 0, remaining: 0 });
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(processSyncQueueMock).toHaveBeenCalledTimes(1);
    expect(processSyncQueueMock).toHaveBeenCalledWith("acct-A");
  });
});

describe("POST /api/cron/blockchain-sync — parity with GET", () => {
  it("POST rejects unauthenticated requests identically to GET (401)", async () => {
    const res = await POST(req("POST"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("POST returns 503 when Supabase is unconfigured (parity with GET)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
  });

  it("POST returns the same noop envelope shape as GET on empty queue", async () => {
    const sb = makeSupabase([]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    const g = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const p = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(p.status).toBe(g.status);
    const gBody = await g.json();
    const pBody = await p.json();
    expect(Object.keys(pBody).sort()).toEqual(Object.keys(gBody).sort());
    expect(pBody.noop).toBe(gBody.noop);
    expect(pBody.accounts).toBe(gBody.accounts);
  });

  it("POST fans out identically to GET on the happy path", async () => {
    const sb = makeSupabase([{ account_id: "acct-A" }]);
    getSupabaseAdminMock.mockReturnValue(sb.client);
    processSyncQueueMock.mockResolvedValue({
      processed: 2,
      synced: 2,
      failed: 0,
      remaining: 0,
    });
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts).toBe(1);
    expect(body.totalProcessed).toBe(2);
    expect(processSyncQueueMock).toHaveBeenCalledWith("acct-A");
  });
});
