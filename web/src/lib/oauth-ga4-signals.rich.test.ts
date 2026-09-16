// S-R5 — the richer 90-day GA4 pull (fetchGa4RichSignals), the pure AARRR
// funnel / shaping helpers, and the ga4_signal_snapshots row mapping.
// fetch is injected (fetchImpl) so no request ever leaves the test.

import { describe, expect, it, vi } from "vitest";
import {
  buildAarrrFunnel,
  fetchGa4RichSignals,
  ga4SignalsFromSnapshotRow,
  ga4SnapshotRow,
  loadLatestGa4Snapshot,
  shapeRichSignals,
  writeGa4Snapshot,
  type Ga4SnapshotDb,
} from "./oauth-ga4-signals";

const TOTALS = {
  rows: [
    { dimensionValues: [{ value: "new" }], metricValues: [{ value: "1200" }, { value: "1000" }, { value: "700" }, { value: "40" }, { value: "60.5" }] },
    { dimensionValues: [{ value: "returning" }], metricValues: [{ value: "800" }, { value: "300" }, { value: "600" }, { value: "50" }, { value: "120" }] },
  ],
};
const CHANNELS = {
  rows: [
    { dimensionValues: [{ value: "Organic Search" }], metricValues: [{ value: "900" }] },
    { dimensionValues: [{ value: "Direct" }], metricValues: [{ value: "600" }] },
    { dimensionValues: [{ value: "Paid Social" }], metricValues: [{ value: "300" }] },
    { dimensionValues: [{ value: "Referral" }], metricValues: [{ value: "200" }] },
    { dimensionValues: [{ value: "Email" }], metricValues: [{ value: "0" }] },
  ],
};

describe("shapeRichSignals / buildAarrrFunnel", () => {
  it("totals, returning share, engagement, conversion rate, weighted duration, top-3 channels", () => {
    const s = shapeRichSignals(TOTALS, CHANNELS, 90);
    expect(s).toMatchObject({ windowDays: 90, sessions: 2000, newUsers: 1000, returningUsers: 300, returningShare: 0.231, conversions: 90, conversionRate: 0.045, engagedSessions: 1300, engagementRate: 0.65 });
    expect(s.avgSessionDurationSec).toBe(84); // (60.5*1200 + 120*800) / 2000
    expect(s.topChannels).toEqual([
      { channel: "Organic Search", sessions: 900, share: 0.45 },
      { channel: "Direct", sessions: 600, share: 0.3 },
      { channel: "Paid Social", sessions: 300, share: 0.15 },
    ]);
    expect(s.funnel).toEqual({ acquisition: 2000, activation: 1300, retention: 300, revenue: 90, referral: null });
  });

  it("empty reports → zeros, no NaN", () => {
    const s = shapeRichSignals({}, {}, 90);
    expect(s).toMatchObject({ sessions: 0, returningShare: 0, conversionRate: 0, engagementRate: 0, avgSessionDurationSec: 0, topChannels: [] });
    expect(buildAarrrFunnel({ sessions: 10, engagedSessions: 25, returningUsers: 2, conversions: 1 })).toEqual({ acquisition: 10, activation: 10, retention: 2, revenue: 1, referral: null });
  });
});

describe("fetchGa4RichSignals", () => {
  function fetchStub(handler: (url: string, body: Record<string, unknown>) => { status: number; body: unknown }) {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ url, body });
      const r = handler(url, body);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  it("two runReport calls (newVsReturning totals with keyEvents, channel group), 90-day window, properties/ prefix stripped", async () => {
    const { fetchImpl, calls } = fetchStub((_url, body) => {
      const dims = (body.dimensions as Array<{ name: string }>).map((d) => d.name);
      return { status: 200, body: dims[0] === "newVsReturning" ? TOTALS : CHANNELS };
    });
    const s = await fetchGa4RichSignals("tok", "properties/12345", { fetchImpl });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://analyticsdata.googleapis.com/v1beta/properties/12345:runReport");
    expect(calls[0].body.dateRanges).toEqual([{ startDate: "90daysAgo", endDate: "today" }]);
    expect((calls[0].body.metrics as Array<{ name: string }>).map((m) => m.name)).toEqual(["sessions", "totalUsers", "engagedSessions", "keyEvents", "averageSessionDuration"]);
    expect((calls[1].body.dimensions as Array<{ name: string }>)[0].name).toBe("sessionDefaultChannelGroup");
    expect(s.sessions).toBe(2000);
    expect(s.topChannels[0].channel).toBe("Organic Search");
  });

  it("falls back to the `conversions` metric on a 400 for keyEvents; other errors throw", async () => {
    const { fetchImpl, calls } = fetchStub((_url, body) => {
      const metrics = (body.metrics as Array<{ name: string }>).map((m) => m.name);
      if (metrics.includes("keyEvents")) return { status: 400, body: { error: "keyEvents unknown" } };
      const dims = (body.dimensions as Array<{ name: string }>).map((d) => d.name);
      return { status: 200, body: dims[0] === "newVsReturning" ? TOTALS : CHANNELS };
    });
    const s = await fetchGa4RichSignals("tok", "12345", { fetchImpl, windowDays: 60 });
    expect(calls).toHaveLength(3);
    expect((calls[1].body.metrics as Array<{ name: string }>).map((m) => m.name)).toContain("conversions");
    expect(s.windowDays).toBe(60);

    const boom = fetchStub(() => ({ status: 403, body: { error: "quota" } }));
    await expect(fetchGa4RichSignals("tok", "12345", { fetchImpl: boom.fetchImpl })).rejects.toThrow(/403/);
  });
});

describe("snapshot row + persistence", () => {
  const signals = shapeRichSignals(TOTALS, CHANNELS, 90);

  it("ga4SnapshotRow ↔ ga4SignalsFromSnapshotRow round-trip", () => {
    const row = ga4SnapshotRow({ userId: "u1", projectId: "p1", propertyId: "12345", signals, source: "sync", takenAt: new Date("2026-09-16T00:00:00Z") });
    expect(row).toMatchObject({ user_id: "u1", project_id: "p1", property_id: "12345", taken_at: "2026-09-16T00:00:00.000Z", window_days: 90, sessions: 2000, returning_share: 0.231, source: "sync" });
    expect(row.funnel).toEqual(signals.funnel);
    const back = ga4SignalsFromSnapshotRow({ ...row, sessions: "2000" as unknown as number });
    expect(back).toMatchObject({ sessions: 2000, topChannels: signals.topChannels, funnel: signals.funnel, takenAt: "2026-09-16T00:00:00.000Z" });
    // a row without a stored funnel rebuilds it from the totals
    expect(ga4SignalsFromSnapshotRow({ sessions: 10, engaged_sessions: 4, returning_users: 2, conversions: 1 }).funnel).toEqual({ acquisition: 10, activation: 4, retention: 2, revenue: 1, referral: null });
  });

  it("writeGa4Snapshot swallows a missing table; loadLatestGa4Snapshot scopes by project (or IS NULL)", async () => {
    const inserted: Record<string, unknown>[] = [];
    const seen: string[] = [];
    const chain = (data: unknown) => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) });
    const db: Ga4SnapshotDb = {
      from: () => ({
        insert: async (row) => {
          inserted.push(row);
          return { error: null };
        },
        // Daily upsert (0404): the same key refreshes the row instead of appending.
        upsert: async (row, opts) => {
          expect(opts.onConflict).toBe("user_id,project_id,property_id,taken_day");
          expect(typeof row.taken_day).toBe("string");
          inserted.push(row);
          return { error: null };
        },
        select: () => ({
          eq: () => ({
            eq: (col: string, v: string) => {
              seen.push(`${col}=${v}`);
              return chain(inserted[0] ?? null);
            },
            is: (col: string) => {
              seen.push(`${col} is null`);
              return chain(null);
            },
          }),
        }),
      }),
    };
    const row = ga4SnapshotRow({ userId: "u1", projectId: "p1", propertyId: "12345", signals, source: "callback" });
    expect(await writeGa4Snapshot(db, row)).toBe(true);
    expect((await loadLatestGa4Snapshot(db, "u1", "p1"))?.sessions).toBe(2000);
    expect(await loadLatestGa4Snapshot(db, "u1", null)).toBeNull();
    expect(seen).toEqual(["project_id=p1", "project_id is null"]);

    const missing = async () => ({ error: { message: 'relation "ga4_signal_snapshots" does not exist' } });
    const broken: Ga4SnapshotDb = { from: () => ({ insert: missing, upsert: missing, select: db.from("x").select }) };
    expect(await writeGa4Snapshot(broken, row)).toBe(false);
  });
});
