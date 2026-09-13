// Colocated tests for /api/cron/chain-reconcile (S27-B). Pins: Bearer
// CRON_SECRET gate, 503 without Supabase, `?dry=1` lists candidates and
// writes / reads nothing on chain, the 50-per-tick cap, archived projects
// skipped, oldest-reconciled first, drift → one throttled `chain_drift`
// notification keyed on the OWNER, unreachable → no notification, a thrown
// run is tallied as failed without stopping the tick, POST === GET.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  supabaseAvailable: true,
  configs: [] as Array<Record<string, unknown>>,
  projects: [] as Array<Record<string, unknown>>,
  recent: [] as Array<Record<string, unknown>>,
  runMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!h.supabaseAvailable) return null;
    const table = (name: string) => {
      const rows = name === "blockchain_sync_config" ? h.configs : name === "projects" ? h.projects : h.recent;
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self, not: self, in: self, order: self, limit: self, eq: self,
        then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
      });
      return chain;
    };
    return { from: table };
  },
}));
vi.mock("@/lib/onchain/reconcile-project", () => ({
  runProjectReconciliation: (db: unknown, args: unknown) => h.runMock(db, args),
}));
vi.mock("@/lib/onchain/notify-drift", () => ({
  notifyChainDrift: (args: unknown) => h.notifyMock(args),
}));

import { GET, POST, MAX_PROJECTS_PER_TICK, dynamic, maxDuration } from "./route";

const SECRET = "cron-secret-xyz";

function req(auth?: string, query = ""): Request {
  return new Request(`https://blockid.au/api/cron/chain-reconcile${query}`, { headers: auth ? { authorization: auth } : {} });
}
const ok = (query = "") => req(`Bearer ${SECRET}`, query);

function cfg(projectId: string, over: Record<string, unknown> = {}) {
  return { account_id: `acct-${projectId}`, project_id: projectId, token_address: "0xa16e02e87b7454126e5e10d957a927a7f5b5d2be", token_symbol: "ACME", ...over };
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  h.supabaseAvailable = true;
  h.configs = [cfg("p1"), cfg("p2")];
  h.projects = [{ id: "p1", user_id: "owner-1", archived_at: null }, { id: "p2", user_id: "owner-2", archived_at: null }];
  h.recent = [];
  h.runMock.mockReset().mockResolvedValue({ status: "in_sync", driftCount: 0, result: null, error: null, row: { id: "r" } });
  h.notifyMock.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("/api/cron/chain-reconcile — gate", () => {
  it("exports the Next route config and the 50 cap", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
    expect(MAX_PROJECTS_PER_TICK).toBe(50);
  });

  it("401 without / wrong / lowercase-scheme bearer; 401 when CRON_SECRET unset", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect((await GET(req(`bearer ${SECRET}`))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req(`Bearer ${SECRET}`))).status).toBe(401);
    expect(h.runMock).not.toHaveBeenCalled();
  });

  it("503 without Supabase", async () => {
    h.supabaseAvailable = false;
    expect((await GET(ok())).status).toBe(503);
  });
});

describe("/api/cron/chain-reconcile — tick", () => {
  it("?dry=1 lists the candidates and runs / notifies nothing", async () => {
    const res = await GET(ok("?dry=1"));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dryRun: true, candidates: 2 });
    expect(body.projects).toEqual([{ project_id: "p1", outcome: "would_run" }, { project_id: "p2", outcome: "would_run" }]);
    expect(h.runMock).not.toHaveBeenCalled();
    expect(h.notifyMock).not.toHaveBeenCalled();
  });

  it("noop when nothing is tokenised", async () => {
    h.configs = [];
    const body = await (await GET(ok())).json();
    expect(body).toMatchObject({ ok: true, noop: true, candidates: 0 });
  });

  it("runs each project keyed on the OWNER, oldest reconciliation first, skipping archived projects", async () => {
    h.configs = [cfg("p1"), cfg("p2"), cfg("p3")];
    h.projects = [
      { id: "p1", user_id: "owner-1", archived_at: null },
      { id: "p2", user_id: "owner-2", archived_at: null },
      { id: "p3", user_id: "owner-3", archived_at: "2026-09-01T00:00:00Z" },
    ];
    h.recent = [{ project_id: "p1", taken_at: "2026-09-06T06:00:00Z" }];
    const body = await (await GET(ok())).json();
    expect(body.processed).toBe(2);
    expect(h.runMock.mock.calls.map((c) => (c[1] as { projectId: string; ownerUserId: string; source: string }))).toEqual([
      expect.objectContaining({ projectId: "p2", ownerUserId: "owner-2", source: "cron", sviAccountId: "acct-p2" }),
      expect.objectContaining({ projectId: "p1", ownerUserId: "owner-1", source: "cron" }),
    ]);
  });

  it("caps the tick at 50 projects", async () => {
    h.configs = Array.from({ length: 60 }, (_, i) => cfg(`p${i}`));
    h.projects = h.configs.map((c) => ({ id: c.project_id, user_id: `o-${c.project_id}`, archived_at: null }));
    const body = await (await GET(ok())).json();
    expect(body.candidates).toBe(50);
    expect(h.runMock).toHaveBeenCalledTimes(50);
  });

  it("drift → chain_drift notification to the owner (throttled by the notifier); unreachable → none", async () => {
    const result = { status: "drift", totals: { driftCount: 2, delta: 10 }, unknownOnChain: [], missingOnChain: [], driftRows: [{}, {}], matched: [] };
    h.runMock
      .mockResolvedValueOnce({ status: "drift", driftCount: 2, result, error: null, row: { id: "r1" } })
      .mockResolvedValueOnce({ status: "unreachable", driftCount: 0, result: null, error: "ECONNREFUSED", row: { id: "r2" } });
    h.notifyMock.mockResolvedValueOnce(false);
    const body = await (await GET(ok())).json();
    expect(body).toMatchObject({ drift: 1, unreachable: 1, inSync: 0, notified: 0, processed: 2 });
    expect(h.notifyMock).toHaveBeenCalledTimes(1);
    expect(h.notifyMock).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "owner-1", projectId: "p1", symbol: "ACME", result }));
    expect(body.projects[0]).toMatchObject({ project_id: "p1", outcome: "drift", notified: false });
    expect(body.projects[1]).toMatchObject({ project_id: "p2", outcome: "unreachable", error: "ECONNREFUSED" });
  });

  it("a thrown run is tallied as failed and the tick continues; POST === GET", async () => {
    h.runMock.mockRejectedValueOnce(new Error("insert failed")).mockResolvedValueOnce({ status: "in_sync", driftCount: 0, result: null, error: null, row: null });
    const body = await (await POST(ok())).json();
    expect(body).toMatchObject({ failed: 1, inSync: 1, processed: 2 });
    expect(body.projects[0]).toMatchObject({ outcome: "failed", error: "insert failed" });
  });
});
