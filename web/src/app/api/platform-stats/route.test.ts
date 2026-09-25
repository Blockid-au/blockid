import { beforeEach, describe, expect, it, vi } from "vitest";
const { readSnapshot, readDirectory } = vi.hoisted(() => ({ readSnapshot: vi.fn(), readDirectory: vi.fn() }));
vi.mock("@/lib/traction/status", async (actual) => ({ ...await actual<object>(), readTractionSnapshotRaw: readSnapshot }));
vi.mock("node:fs", () => ({ readdirSync: readDirectory }));
import { GET, dynamic } from "./route";
const snapshot = () => ({ generated_at: new Date().toISOString(), users: { total: 8, founders: 6 },
  analyses: { svi_analyses: 13 }, evaluators: { trials: 0, paying_by_plan: { angel: 2 } },
  tbr: { purchased: 4, shared: 3, views: 10 }, warnings: [] });
beforeEach(() => { vi.clearAllMocks(); readSnapshot.mockResolvedValue(snapshot()); readDirectory.mockReturnValue(["one.md", "two.md", "ignore.json"]); });
describe("truthful public platform statistics", () => {
  it("preserves keys, measured zeros and source dates without fake visitors or score-to-money conversions", async () => {
    const s = snapshot(); s.users.founders = 0; readSnapshot.mockResolvedValue(s);
    const response = await GET(), body = await response.json();
    expect(dynamic).toBe("force-dynamic"); expect(response.status).toBe(200);
    expect(body.metrics).toEqual({ founders: 0, analyses: 13, paidCustomers: 2, registeredUsers: 8,
      reportPurchases: 4, sharedReportSnapshots: 3, reportViews: 10, articles: 2,
      valuationsTracked: null, tools: null, monthlyVisitors: null, evidenceItems: null, connectedSources: null, averageSVI: null });
    expect(body.updatedAt).toBe(s.generated_at);
    expect(body.metricDetails.analyses.definition).toContain("may include QA");
    expect(body.metricDetails.paidCustomers.definition).toContain("subscription rows");
    expect(body.metricDetails.founders).toMatchObject({ status: "measured", asOf: s.generated_at });
    expect(body.metricDetails.monthlyVisitors).toMatchObject({ status: "unavailable", asOf: null, source: null });
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
  });
  it.each([null, { ...snapshot(), generated_at: "2020-01-01T00:00:00Z" }, { ...snapshot(), generated_at: "2999-01-01T00:00:00Z" }])("never falls back to unfiltered live counts when snapshot is unavailable", async raw => {
    readSnapshot.mockResolvedValue(raw); const body = await (await GET()).json();
    expect(body.metrics.founders).toBeNull(); expect(body.metrics.analyses).toBeNull();
    expect(body.metrics.paidCustomers).toBeNull(); expect(body.metrics.registeredUsers).toBeNull();
    expect(body.updatedAt).toBeNull(); expect(body.source).toBe("unavailable");
  });
  it("missing files and query failures remain unavailable without leaking raw warnings", async () => {
    const s = { ...snapshot(), warnings: ["app_users: internal sentinel", "report_orders: internal sentinel", "subscription_trial_state: scan capped"] };
    readSnapshot.mockResolvedValue(s); readDirectory.mockImplementation(() => { throw new Error("missing"); });
    const body = await (await GET()).json();
    expect(body.metrics.founders).toBeNull(); expect(body.metrics.registeredUsers).toBeNull();
    expect(body.metrics.paidCustomers).toBeNull(); expect(body.metrics.reportPurchases).toBeNull();
    expect(body.metrics.articles).toBeNull(); expect(body.metrics.analyses).toBe(13);
    expect(JSON.stringify(body)).not.toContain("internal sentinel");
  });
  it("snapshot I/O rejection degrades to null, never invented zero or article fallback31", async () => {
    readSnapshot.mockRejectedValue(new Error("secret internal error")); readDirectory.mockImplementation(() => { throw new Error("missing"); });
    const body = await (await GET()).json(); expect(Object.values(body.metrics).every(v => v === null)).toBe(true);
    expect(JSON.stringify(body)).not.toContain("secret internal error");
  });
});
