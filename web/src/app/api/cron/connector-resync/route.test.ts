// Colocated vitest for /api/cron/connector-resync (S25-A). Pins: Bearer
// CRON_SECRET gate (401 unset / mismatched / lowercase scheme), 503 without
// Supabase, `?dry=1` → lists candidates and claims / pulls nothing, the
// 20-per-tick cap is what the lister is asked for, a lost lease skips the
// row (another tick holds it), outcomes are tallied, 503 when the candidate
// listing throws (0349 not applied), POST === GET, and — the security pin —
// the response never carries a token even when the candidate rows do.
//
// The worker itself (token opening, Xero refresh, snapshot + evidence
// upserts, rescore + webhook) is covered by lib/connectors/resync.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  supabaseAvailable: true,
  listMock: vi.fn(),
  claimMock: vi.fn(),
  resyncMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (h.supabaseAvailable ? { from: () => ({}) } : null) }));
vi.mock("@/lib/connectors/resync", () => ({
  MAX_CONNECTIONS_PER_TICK: 20,
  listResyncCandidates: (db: unknown, limit: number, now: Date) => h.listMock(db, limit, now),
  claimConnection: (db: unknown, c: unknown) => h.claimMock(db, c),
  resyncConnection: (db: unknown, c: unknown) => h.resyncMock(db, c),
}));

import { GET, POST, dynamic, maxDuration } from "./route";

const SECRET = "cron-secret-xyz";
const SEALED = "gcm:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:U0VDUkVUX1RPS0VOX0JZVEVT";
const RAW = "sk_live_should_never_appear";

function candidate(id: string, provider: "stripe" | "xero" = "stripe") {
  return {
    table: "oauth_connections_v2" as const,
    id,
    provider,
    accessTokenSealed: SEALED,
    refreshTokenSealed: RAW,
    linkedUserId: "u-1",
    projectId: "p-1",
    accountId: null,
    providerAccountId: "acct_1",
    metadata: { secret_leak_probe: RAW },
    resyncLastAt: null,
  };
}

function req(auth?: string, query = ""): Request {
  return new Request(`https://blockid.au/api/cron/connector-resync${query}`, { headers: auth ? { authorization: auth } : {} });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  h.supabaseAvailable = true;
  h.listMock.mockReset().mockResolvedValue([]);
  h.claimMock.mockReset().mockResolvedValue(true);
  h.resyncMock.mockReset().mockImplementation(async (_db, c: ReturnType<typeof candidate>) => ({
    table: c.table, id: c.id, provider: c.provider, project_id: c.projectId, outcome: "synced", changed: true, svi_delta: 4, webhooks_queued: 1,
  }));
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/connector-resync — gate", () => {
  it("exports the Next route config", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
  });

  it("401 without / with the wrong / lowercase-scheme bearer; never lists candidates", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect((await GET(req(`bearer ${SECRET}`))).status).toBe(401);
    expect(h.listMock).not.toHaveBeenCalled();
  });

  it("401 when CRON_SECRET is unset even with an empty bearer", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer "))).status).toBe(401);
  });

  it("503 without Supabase", async () => {
    h.supabaseAvailable = false;
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("supabase_unavailable");
  });

  it("503 candidates_unavailable when the lister throws (migration 0349 not applied)", async () => {
    h.listMock.mockRejectedValue(new Error('column "resync_last_at" does not exist'));
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("candidates_unavailable");
  });
});

describe("GET /api/cron/connector-resync — ticks", () => {
  it("asks the lister for at most 20 connections and idles cleanly", async () => {
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(h.listMock).toHaveBeenCalledWith(expect.anything(), 20, expect.any(Date));
    expect(await res.json()).toMatchObject({ ok: true, dryRun: false, candidates: 0, processed: 0 });
  });

  it("?dry=1 lists would_run rows, claims nothing, pulls nothing", async () => {
    h.listMock.mockResolvedValue([candidate("c-1"), candidate("c-2", "xero")]);
    const res = await GET(req(`Bearer ${SECRET}`, "?dry=1"));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dryRun: true, candidates: 2 });
    expect(body.connections.map((c: { outcome: string }) => c.outcome)).toEqual(["would_run", "would_run"]);
    expect(h.claimMock).not.toHaveBeenCalled();
    expect(h.resyncMock).not.toHaveBeenCalled();
  });

  it("claims each row before syncing; a lost lease is skipped and counted", async () => {
    h.listMock.mockResolvedValue([candidate("c-1"), candidate("c-2"), candidate("c-3")]);
    h.claimMock.mockImplementation(async (_db, c: { id: string }) => c.id !== "c-2");
    const res = await GET(req(`Bearer ${SECRET}`));
    const body = await res.json();
    expect(h.claimMock).toHaveBeenCalledTimes(3);
    expect(h.resyncMock).toHaveBeenCalledTimes(2);
    expect(body).toMatchObject({ processed: 2, synced: 2, skippedLease: 1, budgetExceeded: false });
    // claim happens before resync for every row
    const claimOrder = h.claimMock.mock.invocationCallOrder[0];
    const resyncOrder = h.resyncMock.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(resyncOrder);
  });

  it("tallies outcomes: synced / unchanged / reconnect (unreadable + rejected) / failed", async () => {
    h.listMock.mockResolvedValue([candidate("a"), candidate("b"), candidate("c"), candidate("d"), candidate("e")]);
    const outcomes: Record<string, string> = { a: "synced", b: "unchanged", c: "token_unreadable", d: "needs_reconnect", e: "failed" };
    h.resyncMock.mockImplementation(async (_db, c: { id: string; table: string; provider: string; projectId: string | null }) => ({
      table: c.table, id: c.id, provider: c.provider, project_id: c.projectId, outcome: outcomes[c.id],
    }));
    const body = await (await GET(req(`Bearer ${SECRET}`))).json();
    expect(body).toMatchObject({ processed: 5, synced: 1, unchanged: 1, reconnect: 2, failed: 1 });
  });

  it("never echoes a token: the response body is free of sealed and raw token bytes", async () => {
    h.listMock.mockResolvedValue([candidate("c-1")]);
    const live = await (await GET(req(`Bearer ${SECRET}`))).text();
    expect(live).not.toContain(SEALED);
    expect(live).not.toContain(RAW);
    expect(live).not.toContain("gcm:");
    const dry = await (await GET(req(`Bearer ${SECRET}`, "?dry=1"))).text();
    expect(dry).not.toContain(SEALED);
    expect(dry).not.toContain(RAW);
  });

  it("POST is the same handler", async () => {
    h.listMock.mockResolvedValue([candidate("c-1")]);
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect((await res.json()).processed).toBe(1);
    expect((await POST(req())).status).toBe(401);
  });
});
