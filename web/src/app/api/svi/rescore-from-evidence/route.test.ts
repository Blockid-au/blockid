// Colocated tests for POST /api/svi/rescore-from-evidence — S17-A review
// (P1-1). Editor+ only (it updates svi_accounts + svi_analyses); the
// startup record is keyed under the OWNER's email and the scoped
// project_id — never email alone.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
const scopeRoleMock = vi.fn<() => "owner" | "admin" | "editor" | "viewer">(() => "owner");
vi.mock("@/lib/projects", () => ({
  getProjectScope: async (minRole?: string) => {
    const projectId = await getProjectIdFromRequestMock();
    if (!projectId) return null;
    const role = scopeRoleMock();
    const rank = { viewer: 1, editor: 2, admin: 3, owner: 4 } as const;
    if (minRole && rank[role] < rank[minRole as keyof typeof rank]) {
      const err = new Error("below") as Error & { code: string };
      err.name = "ProjectAccessError";
      err.code = "forbidden";
      throw err;
    }
    const isOwner = role === "owner";
    return {
      projectId,
      role,
      isOwner,
      userId: "u-1",
      email: "member@x.test",
      dataEmail: isOwner ? "member@x.test" : "owner@x.test",
      ownerUserId: isOwner ? "u-1" : "owner-1",
      project: { id: projectId, slug: "p", name: "P", userId: isOwner ? "u-1" : "owner-1", role },
    };
  },
}));

// S25-A — `subs` carries a TRE sub-score so the before/after fixture below
// can see the magnitude contribution land (each call returns fresh objects;
// the lib mutates them).
let sviSubs: () => Array<{ key: string; value: number; adjustment: number; evidence: string[] }> = () => [];
vi.mock("@/lib/svi-analysis", () => ({
  extractSignals: () => ({}),
  computeSVI: () => ({ totalSVI: 120, netAdjustment: 0, confidenceMultiplier: 1, stage: 2, subs: sviSubs() }),
}));
vi.mock("@/lib/badges", () => ({ checkAndAwardBadges: async () => [] }));

type Row = Record<string, unknown>;
let accountFilters: Array<[string, unknown]> = [];
let analysisFilters: Array<[string, unknown]> = [];
let updates: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
let accountRow: Row | null = { id: "acc-owner", current_svi: 100 };
let evidenceRows: Row[] = [];
let snapshotRows: Row[] = [];
let analysisUpdates: Row[] = [];

function fakeSupabase() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const track = (col: string, val: unknown) => {
        if (table === "svi_accounts") accountFilters.push([col, val]);
        if (table === "svi_analyses") analysisFilters.push([col, val]);
      };
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => { track(col, val); return chain; };
      chain.is = (col: string, val: unknown) => { track(col, val); return chain; };
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.maybeSingle = () =>
        Promise.resolve({
          data:
            table === "svi_accounts"
              ? accountRow
              : table === "svi_analyses"
                ? { id: "an-1", raw_input: "orig", analysis_json: {} }
                : null,
          error: null,
        });
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({
          data: table === "svi_evidence" ? evidenceRows : table === "connector_snapshots" ? snapshotRows : null,
          count: 0,
          error: null,
        });
      chain.insert = () => ({ then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) });
      chain.update = (patch: Row) => {
        const call = { table, filters: [] as Array<[string, unknown]> };
        updates.push(call);
        if (table === "svi_analyses") analysisUpdates.push(patch);
        const u = {
          eq: (col: string, val: unknown) => { call.filters.push([col, val]); return u; },
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return u;
      };
      return chain;
    },
  };
}
const fromSpy = vi.fn();
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => {
    const sb = fakeSupabase();
    return { from: (t: string) => { fromSpy(t); return sb.from(t); } };
  },
}));

import { POST } from "./route";

beforeEach(() => {
  accountFilters = [];
  analysisFilters = [];
  updates = [];
  accountRow = { id: "acc-owner", current_svi: 100 };
  evidenceRows = [];
  snapshotRows = [];
  analysisUpdates = [];
  sviSubs = () => [];
  fromSpy.mockReset();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "member@x.test" });
  getProjectIdFromRequestMock.mockReset();
  getProjectIdFromRequestMock.mockResolvedValue("proj-shared");
  scopeRoleMock.mockReset();
  scopeRoleMock.mockReturnValue("owner");
});

describe("POST /api/svi/rescore-from-evidence — S17-A", () => {
  it("401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it("viewer on a shared project → 403; no DB access, nothing updated", async () => {
    scopeRoleMock.mockReturnValue("viewer");
    const res = await POST();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(fromSpy).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("editor on a shared project → 200; account looked up by (OWNER email, scoped project_id); updates scoped to that account", async () => {
    scopeRoleMock.mockReturnValue("editor");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(accountFilters).toContainEqual(["email", "owner@x.test"]);
    expect(accountFilters).toContainEqual(["project_id", "proj-shared"]);
    expect(analysisFilters).toContainEqual(["email", "owner@x.test"]);
    expect(analysisFilters).toContainEqual(["project_id", "proj-shared"]);
    expect(updates.find((u) => u.table === "svi_accounts")?.filters).toContainEqual(["id", "acc-owner"]);
    const body = await res.json();
    expect(body.newSVI).toBe(120);
  });

  it("owner → own email + project_id", async () => {
    await POST();
    expect(accountFilters).toContainEqual(["email", "member@x.test"]);
    expect(accountFilters).toContainEqual(["project_id", "proj-shared"]);
  });

  it("no active project → (own email, project_id IS NULL)", async () => {
    getProjectIdFromRequestMock.mockResolvedValue(null);
    await POST();
    expect(accountFilters).toContainEqual(["email", "member@x.test"]);
    expect(accountFilters).toContainEqual(["project_id", null]);
  });

  it("404 when no account row matches; nothing updated", async () => {
    accountRow = null;
    expect((await POST()).status).toBe(404);
    expect(updates).toHaveLength(0);
  });

});

// S25-A — before/after fixture: the same evidence vault scored by the flat
// table (non-revenue rows) and the magnitude table (connected revenue).
describe("POST /api/svi/rescore-from-evidence — S25-A magnitude-based connected revenue", () => {
  const NOW_ISO = new Date().toISOString();
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const tre = () => [{ key: "tre", value: 40, adjustment: 0, evidence: [] }];
  const treValue = () => {
    const json = analysisUpdates[0]?.analysis_json as { subs: Array<{ key: string; value: number; evidence: string[] }> };
    return json.subs.find((s) => s.key === "tre")!;
  };

  it("BEFORE (no connector data): a connected_source Stripe evidence row alone no longer earns the flat +15", async () => {
    sviSubs = tre;
    evidenceRows = [{ evidence_type: "stripe", confidence_level: "connected_source", dimension: "tre", label: "Stripe" }];
    const res = await POST();
    expect(res.status).toBe(200);
    // The stripe evidence has no MRR payload in this fixture → no signal → no points.
    expect(treValue().value).toBe(40);
    expect((await res.json()).connectedRevenue).toBeNull();
  });

  it("AFTER (weekly snapshot present): TRE gains the tier + growth − churn points and the breakdown line", async () => {
    sviSubs = tre;
    evidenceRows = [{ evidence_type: "stripe", confidence_level: "connected_source", dimension: "tre", label: "Stripe" }];
    snapshotRows = [
      { id: "s1", user_id: "u-1", project_id: "proj-shared", provider: "stripe", taken_at: NOW_ISO, metrics: { mrrAud: 8_200, churnRate90dPct: 2.1 }, source: "resync" },
      { id: "s0", user_id: "u-1", project_id: "proj-shared", provider: "stripe", taken_at: daysAgo(95), metrics: { mrrAud: 7_321, churnRate90dPct: 1 }, source: "callback" },
    ];
    const res = await POST();
    const body = await res.json();
    expect(body.connectedRevenue).toMatchObject({ provider: "stripe", points: 13, tier: "1k_10k", growthPoints: 3, churnPoints: 0, decay: 1 });
    const sub = treValue();
    expect(sub.value).toBe(53); // 40 + 13, not 40 + 15
    expect(sub.evidence.some((l: string) => l.startsWith("Connected revenue (Stripe):") && l.endsWith("→ +13 TRE"))).toBe(true);
    // totalSVI moves by round(13 × 0.20 × 1) = 3 → 123 → delta +23 vs the stored 100.
    expect(body.newSVI).toBe(123);
    expect(body.evidenceBonusApplied).toBe(3);
  });

  it("a non-revenue connected_source row (GitHub) keeps the flat +15 on its own dimension", async () => {
    sviSubs = () => [{ key: "ptd", value: 30, adjustment: 0, evidence: [] }];
    evidenceRows = [{ evidence_type: "github", confidence_level: "connected_source", dimension: "ptd", label: "GitHub" }];
    await POST();
    const json = analysisUpdates[0]?.analysis_json as { subs: Array<{ key: string; value: number }> };
    expect(json.subs.find((s) => s.key === "ptd")!.value).toBe(45);
  });

  it("a stale snapshot (200 d) contributes 0 and says so", async () => {
    sviSubs = tre;
    snapshotRows = [
      { id: "s1", user_id: "u-1", project_id: "proj-shared", provider: "xero", taken_at: daysAgo(200), metrics: { totalIncomeAud: 60_000, windowMonths: 3 }, source: "resync" },
    ];
    const res = await POST();
    const body = await res.json();
    expect(body.connectedRevenue).toMatchObject({ provider: "xero", points: 0, decay: 0, tier: "10k_50k" });
    expect(treValue().value).toBe(40);
  });
});
