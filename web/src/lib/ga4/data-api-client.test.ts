// Colocated regression suite for `web/src/lib/ga4/data-api-client.ts` — the
// GA4 Data-API reader that powers the CDO daily traffic snapshot
// (docs/plans/mega-2026-07-24/05-cdo-ga4-dashboard.md) surfaced on
// /workspace/analytics + the weekly-digest email. A silent regression here
// has an outsized blast radius:
//   - drop the `properties/` normalisation in `getGa4PropertyId()` and every
//     Data-API call rejects at runtime because GA4 rejects a bare numeric ID
//     as the `property` field;
//   - drop the two-env guard in `isGa4Configured()` and `fetchDailySnapshot`
//     tries to hit the network on prod boxes without a service account
//     bound, poisoning the outer cron;
//   - drop the try/catch around the 5-call Promise fan-in and one flaky
//     sub-query kills the whole snapshot (the daily tile falls off
//     /workspace/analytics with no fallback message);
//   - drop the `readMetric()` `Number.isFinite` guard and a GA4 row with a
//     `"NaN"` string metric (Google's own error path) propagates NaN into
//     the persisted snapshot, breaking every downstream chart's Y-axis;
//   - drop the YYYYMMDD → YYYY-MM-DD reshape in the trend7d branch and the
//     7-day trend chart's date-axis labels are unparseable by every
//     downstream `new Date(iso)` call.
//
// P9_ship autonomous-loop tick — first test coverage for
// ga4/data-api-client.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted; capture the googleapis surface so we can assert
// requestBody shapes and inject per-call responses without touching the
// network.
const { runReportMock, googleAuthCtor, analyticsdataFactory } = vi.hoisted(
  () => ({
    runReportMock: vi.fn(),
    googleAuthCtor: vi.fn(),
    analyticsdataFactory: vi.fn(),
  }),
);

vi.mock("googleapis", () => {
  class FakeGoogleAuth {
    constructor(opts: unknown) {
      googleAuthCtor(opts);
    }
  }
  return {
    google: {
      auth: { GoogleAuth: FakeGoogleAuth },
      analyticsdata: (opts: unknown) => {
        analyticsdataFactory(opts);
        return { properties: { runReport: runReportMock } };
      },
    },
  };
});

// ─── env snapshot helpers ────────────────────────────────────────────────────

const ENV_KEYS = [
  "GA4_PROPERTY_ID",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
] as const;

const savedEnv: Record<string, string | undefined> = {};

function clearEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k];
}

const VALID_SA = JSON.stringify({
  client_email: "svc@example.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
  project_id: "blockid-au",
});

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  clearEnv();
  runReportMock.mockReset();
  googleAuthCtor.mockReset();
  analyticsdataFactory.mockReset();
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

async function importModule() {
  return await import("./data-api-client");
}

// ─────────────────────────────────────────────────────────────────────────────
// getGa4PropertyId
// ─────────────────────────────────────────────────────────────────────────────

describe("getGa4PropertyId", () => {
  it("returns null when GA4_PROPERTY_ID is unset", async () => {
    const mod = await importModule();
    expect(mod.getGa4PropertyId()).toBeNull();
  });

  it("returns null when GA4_PROPERTY_ID is only whitespace", async () => {
    process.env.GA4_PROPERTY_ID = "   ";
    const mod = await importModule();
    expect(mod.getGa4PropertyId()).toBeNull();
  });

  it("normalises a bare numeric ID to properties/<id>", async () => {
    process.env.GA4_PROPERTY_ID = "123456789";
    const mod = await importModule();
    expect(mod.getGa4PropertyId()).toBe("properties/123456789");
  });

  it("passes through an already-prefixed value verbatim", async () => {
    process.env.GA4_PROPERTY_ID = "properties/987654321";
    const mod = await importModule();
    expect(mod.getGa4PropertyId()).toBe("properties/987654321");
  });

  it("trims surrounding whitespace before deciding on the prefix", async () => {
    process.env.GA4_PROPERTY_ID = "  555000111  ";
    const mod = await importModule();
    expect(mod.getGa4PropertyId()).toBe("properties/555000111");
  });

  it("does not double-prefix when the trimmed value already starts with properties/", async () => {
    process.env.GA4_PROPERTY_ID = "  properties/22\n";
    const mod = await importModule();
    // Trim only strips outer whitespace; the leading "properties/" is honoured.
    expect(mod.getGa4PropertyId()).toBe("properties/22");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isGa4Configured
// ─────────────────────────────────────────────────────────────────────────────

describe("isGa4Configured", () => {
  it("is false when both env vars are missing", async () => {
    const mod = await importModule();
    expect(mod.isGa4Configured()).toBe(false);
  });

  it("is false when only GA4_PROPERTY_ID is set", async () => {
    process.env.GA4_PROPERTY_ID = "123";
    const mod = await importModule();
    expect(mod.isGa4Configured()).toBe(false);
  });

  it("is false when only GOOGLE_APPLICATION_CREDENTIALS_JSON is set", async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    const mod = await importModule();
    expect(mod.isGa4Configured()).toBe(false);
  });

  it("is false when GA4_PROPERTY_ID is whitespace and creds present", async () => {
    process.env.GA4_PROPERTY_ID = "   ";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    const mod = await importModule();
    expect(mod.isGa4Configured()).toBe(false);
  });

  it("is false when service account JSON is whitespace and property set", async () => {
    process.env.GA4_PROPERTY_ID = "123";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = "   ";
    const mod = await importModule();
    expect(mod.isGa4Configured()).toBe(false);
  });

  it("is true when both env vars carry non-empty values", async () => {
    process.env.GA4_PROPERTY_ID = "123";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    const mod = await importModule();
    expect(mod.isGa4Configured()).toBe(true);
  });

  it("accepts a properties-prefixed ID as configured", async () => {
    process.env.GA4_PROPERTY_ID = "properties/42";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    const mod = await importModule();
    expect(mod.isGa4Configured()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runReport
// ─────────────────────────────────────────────────────────────────────────────

describe("runReport", () => {
  it("throws when GA4_PROPERTY_ID is not set", async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    const mod = await importModule();
    await expect(
      mod.runReport({
        dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-01" }],
        metrics: [{ name: "sessions" }],
      }),
    ).rejects.toThrow(/GA4_PROPERTY_ID/);
  });

  it("throws when service account JSON is not set (deferred auth)", async () => {
    process.env.GA4_PROPERTY_ID = "123";
    const mod = await importModule();
    await expect(
      mod.runReport({
        dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-01" }],
        metrics: [{ name: "sessions" }],
      }),
    ).rejects.toThrow(/GOOGLE_APPLICATION_CREDENTIALS_JSON not set/);
  });

  it("throws a friendly error when service account JSON is malformed", async () => {
    process.env.GA4_PROPERTY_ID = "123";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = "{not-json";
    const mod = await importModule();
    await expect(
      mod.runReport({
        dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-01" }],
        metrics: [{ name: "sessions" }],
      }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("constructs GoogleAuth with parsed credentials + analytics.readonly scope", async () => {
    process.env.GA4_PROPERTY_ID = "123";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockResolvedValueOnce({ data: { rows: [] } });
    const mod = await importModule();
    await mod.runReport({
      dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-01" }],
      metrics: [{ name: "sessions" }],
    });
    expect(googleAuthCtor).toHaveBeenCalledTimes(1);
    const [args] = googleAuthCtor.mock.calls[0]!;
    const opts = args as { credentials: Record<string, unknown>; scopes: string[] };
    expect(opts.credentials).toMatchObject({
      client_email: "svc@example.iam.gserviceaccount.com",
      project_id: "blockid-au",
    });
    expect(opts.scopes).toEqual([
      "https://www.googleapis.com/auth/analytics.readonly",
    ]);
  });

  it("passes the normalised property + requestBody through to googleapis", async () => {
    process.env.GA4_PROPERTY_ID = "999";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockResolvedValueOnce({ data: { rows: [{ metricValues: [{ value: "7" }] }] } });
    const mod = await importModule();
    await mod.runReport({
      dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-02" }],
      metrics: [{ name: "sessions" }],
      limit: 3,
    });
    expect(runReportMock).toHaveBeenCalledTimes(1);
    const [call] = runReportMock.mock.calls[0]!;
    expect(call).toMatchObject({
      property: "properties/999",
      requestBody: {
        dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-02" }],
        metrics: [{ name: "sessions" }],
        limit: 3,
      },
    });
  });

  it("returns the response's `data` field verbatim", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    const rows = [{ dimensionValues: [{ value: "/pricing" }], metricValues: [{ value: "42" }] }];
    runReportMock.mockResolvedValueOnce({ data: { rows } });
    const mod = await importModule();
    const out = await mod.runReport({
      dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-01" }],
      metrics: [{ name: "sessions" }],
    });
    expect(out.rows).toBe(rows);
  });

  it("returns an empty object when googleapis responds without a data field", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockResolvedValueOnce({});
    const mod = await importModule();
    const out = await mod.runReport({
      dateRanges: [{ startDate: "2026-01-01", endDate: "2026-01-01" }],
      metrics: [{ name: "sessions" }],
    });
    expect(out).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchDailySnapshot
// ─────────────────────────────────────────────────────────────────────────────

interface FakeRow {
  dimensionValues?: Array<{ value?: string | null }>;
  metricValues?: Array<{ value?: string | null }>;
}

function totalsResp(vals: Array<string | null | undefined>): { data: { rows: FakeRow[] } } {
  return {
    data: {
      rows: [{ metricValues: vals.map((v) => ({ value: v ?? null })) }],
    },
  };
}

function pagesResp(rows: Array<{ path: string; sessions: string; views: string }>): { data: { rows: FakeRow[] } } {
  return {
    data: {
      rows: rows.map((r) => ({
        dimensionValues: [{ value: r.path }],
        metricValues: [{ value: r.sessions }, { value: r.views }],
      })),
    },
  };
}

function eventsResp(rows: Array<{ name: string; count: string }>): { data: { rows: FakeRow[] } } {
  return {
    data: {
      rows: rows.map((r) => ({
        dimensionValues: [{ value: r.name }],
        metricValues: [{ value: r.count }],
      })),
    },
  };
}

function srcResp(rows: Array<{ source: string; medium: string; sessions: string }>): { data: { rows: FakeRow[] } } {
  return {
    data: {
      rows: rows.map((r) => ({
        dimensionValues: [{ value: r.source }, { value: r.medium }],
        metricValues: [{ value: r.sessions }],
      })),
    },
  };
}

function trendResp(rows: Array<{ date: string; sessions: string; users: string; conversions: string }>): { data: { rows: FakeRow[] } } {
  return {
    data: {
      rows: rows.map((r) => ({
        dimensionValues: [{ value: r.date }],
        metricValues: [
          { value: r.sessions },
          { value: r.users },
          { value: r.conversions },
        ],
      })),
    },
  };
}

function queueHappyPath(): void {
  runReportMock.mockResolvedValueOnce(
    totalsResp(["100", "80", "20", "250", "5", "0.65", "45.5"]),
  );
  runReportMock.mockResolvedValueOnce(
    pagesResp([
      { path: "/", sessions: "60", views: "80" },
      { path: "/pricing", sessions: "30", views: "40" },
    ]),
  );
  runReportMock.mockResolvedValueOnce(
    eventsResp([
      { name: "page_view", count: "250" },
      { name: "sign_up", count: "12" },
    ]),
  );
  runReportMock.mockResolvedValueOnce(
    srcResp([
      { source: "google", medium: "organic", sessions: "70" },
      { source: "(direct)", medium: "(none)", sessions: "20" },
    ]),
  );
  runReportMock.mockResolvedValueOnce(
    trendResp([
      { date: "20260101", sessions: "10", users: "8", conversions: "1" },
      { date: "20260102", sessions: "12", users: "9", conversions: "2" },
    ]),
  );
}

describe("fetchDailySnapshot", () => {
  it("returns {ok:false, error, hint} when GA4 is not configured (no network hit)", async () => {
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out).toEqual({
      ok: false,
      error: "GA4 API not configured",
      hint: expect.stringContaining("GA4_PROPERTY_ID"),
    });
    expect(runReportMock).not.toHaveBeenCalled();
    expect(googleAuthCtor).not.toHaveBeenCalled();
  });

  it("returns {ok:true, snapshot} on the happy path with all 5 sub-queries", async () => {
    process.env.GA4_PROPERTY_ID = "42";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    queueHappyPath();
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok:true");
    expect(runReportMock).toHaveBeenCalledTimes(5);
    expect(out.snapshot.property_id).toBe("properties/42");
    expect(out.snapshot.range_days).toBe(1);
    expect(out.snapshot.totals).toEqual({
      sessions: 100,
      activeUsers: 80,
      newUsers: 20,
      screenPageViews: 250,
      conversions: 5,
      engagementRate: 0.65,
      averageSessionDuration: 45.5,
    });
    expect(out.snapshot.topPages).toEqual([
      { path: "/", sessions: 60, views: 80 },
      { path: "/pricing", sessions: 30, views: 40 },
    ]);
    expect(out.snapshot.topEvents).toEqual([
      { name: "page_view", count: 250 },
      { name: "sign_up", count: 12 },
    ]);
    expect(out.snapshot.sourceMedium).toEqual([
      { source: "google", medium: "organic", sessions: 70 },
      { source: "(direct)", medium: "(none)", sessions: 20 },
    ]);
  });

  it("stamps captured_at as a parseable ISO string", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    queueHappyPath();
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok:true");
    expect(Number.isNaN(Date.parse(out.snapshot.captured_at))).toBe(false);
  });

  it("uses UTC-yesterday for the `date` field (matches sub-query date ranges)", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T05:00:00Z"));
    try {
      queueHappyPath();
      const mod = await importModule();
      const out = await mod.fetchDailySnapshot();
      expect(out.ok).toBe(true);
      if (!out.ok) throw new Error("expected ok:true");
      expect(out.snapshot.date).toBe("2026-06-14");
      // Totals sub-query date range is [yesterday, yesterday].
      const totalsCall = runReportMock.mock.calls[0]![0] as { requestBody: { dateRanges: Array<{ startDate: string; endDate: string }> } };
      expect(totalsCall.requestBody.dateRanges).toEqual([
        { startDate: "2026-06-14", endDate: "2026-06-14" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a 7-day trend window ending at yesterday", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    try {
      queueHappyPath();
      const mod = await importModule();
      const out = await mod.fetchDailySnapshot();
      expect(out.ok).toBe(true);
      const trendCall = runReportMock.mock.calls[4]![0] as { requestBody: { dateRanges: Array<{ startDate: string; endDate: string }>; limit?: number; orderBys?: unknown[] } };
      expect(trendCall.requestBody.dateRanges).toEqual([
        { startDate: "2026-06-08", endDate: "2026-06-14" },
      ]);
      expect(trendCall.requestBody.limit).toBe(14);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends the exact totals metric list in order", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    queueHappyPath();
    const mod = await importModule();
    await mod.fetchDailySnapshot();
    const totalsCall = runReportMock.mock.calls[0]![0] as { requestBody: { metrics: Array<{ name: string }> } };
    expect(totalsCall.requestBody.metrics.map((m) => m.name)).toEqual([
      "sessions",
      "activeUsers",
      "newUsers",
      "screenPageViews",
      "conversions",
      "engagementRate",
      "averageSessionDuration",
    ]);
  });

  it("top pages sub-query orders by sessions desc with limit 5", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    queueHappyPath();
    const mod = await importModule();
    await mod.fetchDailySnapshot();
    const pagesCall = runReportMock.mock.calls[1]![0] as {
      requestBody: {
        dimensions: Array<{ name: string }>;
        orderBys: Array<{ metric?: { metricName: string }; desc?: boolean }>;
        limit: number;
      };
    };
    expect(pagesCall.requestBody.dimensions).toEqual([{ name: "pagePath" }]);
    expect(pagesCall.requestBody.orderBys).toEqual([
      { metric: { metricName: "sessions" }, desc: true },
    ]);
    expect(pagesCall.requestBody.limit).toBe(5);
  });

  it("top events sub-query keys off eventName + eventCount", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    queueHappyPath();
    const mod = await importModule();
    await mod.fetchDailySnapshot();
    const eventsCall = runReportMock.mock.calls[2]![0] as {
      requestBody: {
        dimensions: Array<{ name: string }>;
        metrics: Array<{ name: string }>;
        orderBys: Array<{ metric?: { metricName: string }; desc?: boolean }>;
        limit: number;
      };
    };
    expect(eventsCall.requestBody.dimensions).toEqual([{ name: "eventName" }]);
    expect(eventsCall.requestBody.metrics).toEqual([{ name: "eventCount" }]);
    expect(eventsCall.requestBody.orderBys).toEqual([
      { metric: { metricName: "eventCount" }, desc: true },
    ]);
    expect(eventsCall.requestBody.limit).toBe(5);
  });

  it("source/medium sub-query uses sessionSource + sessionMedium (not source/medium)", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    queueHappyPath();
    const mod = await importModule();
    await mod.fetchDailySnapshot();
    const srcCall = runReportMock.mock.calls[3]![0] as {
      requestBody: { dimensions: Array<{ name: string }> };
    };
    expect(srcCall.requestBody.dimensions).toEqual([
      { name: "sessionSource" },
      { name: "sessionMedium" },
    ]);
  });

  it("trend sub-query orders by date ascending", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    queueHappyPath();
    const mod = await importModule();
    await mod.fetchDailySnapshot();
    const trendCall = runReportMock.mock.calls[4]![0] as {
      requestBody: {
        dimensions: Array<{ name: string }>;
        metrics: Array<{ name: string }>;
        orderBys: Array<{ dimension?: { dimensionName: string }; desc?: boolean }>;
      };
    };
    expect(trendCall.requestBody.dimensions).toEqual([{ name: "date" }]);
    expect(trendCall.requestBody.metrics.map((m) => m.name)).toEqual([
      "sessions",
      "activeUsers",
      "conversions",
    ]);
    expect(trendCall.requestBody.orderBys).toEqual([
      { dimension: { dimensionName: "date" }, desc: false },
    ]);
  });

  it("reshapes GA4 YYYYMMDD trend dates to ISO YYYY-MM-DD", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockResolvedValueOnce(totalsResp(["1", "1", "1", "1", "1", "1", "1"]));
    runReportMock.mockResolvedValueOnce(pagesResp([]));
    runReportMock.mockResolvedValueOnce(eventsResp([]));
    runReportMock.mockResolvedValueOnce(srcResp([]));
    runReportMock.mockResolvedValueOnce(
      trendResp([
        { date: "20260114", sessions: "5", users: "4", conversions: "0" },
        { date: "20260115", sessions: "9", users: "7", conversions: "1" },
      ]),
    );
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok:true");
    expect(out.snapshot.trend7d.map((p) => p.date)).toEqual([
      "2026-01-14",
      "2026-01-15",
    ]);
  });

  it("passes through an already-ISO trend date without corrupting it", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockResolvedValueOnce(totalsResp(["1", "1", "1", "1", "1", "1", "1"]));
    runReportMock.mockResolvedValueOnce(pagesResp([]));
    runReportMock.mockResolvedValueOnce(eventsResp([]));
    runReportMock.mockResolvedValueOnce(srcResp([]));
    runReportMock.mockResolvedValueOnce(
      trendResp([{ date: "2026-01-14", sessions: "5", users: "4", conversions: "0" }]),
    );
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok:true");
    expect(out.snapshot.trend7d[0]!.date).toBe("2026-01-14");
  });

  it("uses totals[0] when rows is missing (GA4 sometimes returns totals only)", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockResolvedValueOnce({
      data: {
        totals: [
          {
            metricValues: [
              { value: "500" }, { value: "400" }, { value: "50" },
              { value: "1000" }, { value: "10" }, { value: "0.5" }, { value: "60" },
            ],
          },
        ],
      },
    });
    runReportMock.mockResolvedValueOnce(pagesResp([]));
    runReportMock.mockResolvedValueOnce(eventsResp([]));
    runReportMock.mockResolvedValueOnce(srcResp([]));
    runReportMock.mockResolvedValueOnce(trendResp([]));
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok:true");
    expect(out.snapshot.totals.sessions).toBe(500);
    expect(out.snapshot.totals.averageSessionDuration).toBe(60);
  });

  it("coerces missing/null metric rows to zeros without throwing", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    // Totals row entirely absent (rows: [] + totals: []).
    runReportMock.mockResolvedValueOnce({ data: { rows: [] } });
    runReportMock.mockResolvedValueOnce(pagesResp([]));
    runReportMock.mockResolvedValueOnce(eventsResp([]));
    runReportMock.mockResolvedValueOnce(srcResp([]));
    runReportMock.mockResolvedValueOnce(trendResp([]));
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok:true");
    expect(out.snapshot.totals).toEqual({
      sessions: 0,
      activeUsers: 0,
      newUsers: 0,
      screenPageViews: 0,
      conversions: 0,
      engagementRate: 0,
      averageSessionDuration: 0,
    });
  });

  it("substitutes 0 for a non-numeric metric value (never propagates NaN)", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockResolvedValueOnce(
      totalsResp(["100", "not-a-number", null, "10", "5", "0.5", "30"]),
    );
    runReportMock.mockResolvedValueOnce(pagesResp([]));
    runReportMock.mockResolvedValueOnce(eventsResp([]));
    runReportMock.mockResolvedValueOnce(srcResp([]));
    runReportMock.mockResolvedValueOnce(trendResp([]));
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok:true");
    expect(out.snapshot.totals.activeUsers).toBe(0);
    expect(out.snapshot.totals.newUsers).toBe(0);
    expect(Number.isNaN(out.snapshot.totals.activeUsers)).toBe(false);
  });

  it("substitutes empty string when a dimensionValue is missing (top pages)", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockResolvedValueOnce(totalsResp(["1", "1", "1", "1", "1", "1", "1"]));
    runReportMock.mockResolvedValueOnce({
      data: {
        rows: [
          {
            dimensionValues: [{ value: null }],
            metricValues: [{ value: "50" }, { value: "60" }],
          },
        ],
      },
    });
    runReportMock.mockResolvedValueOnce(eventsResp([]));
    runReportMock.mockResolvedValueOnce(srcResp([]));
    runReportMock.mockResolvedValueOnce(trendResp([]));
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok:true");
    expect(out.snapshot.topPages).toEqual([
      { path: "", sessions: 50, views: 60 },
    ]);
  });

  it("returns empty arrays for topPages/topEvents/sourceMedium/trend7d when GA4 has no rows", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockResolvedValueOnce(totalsResp(["0", "0", "0", "0", "0", "0", "0"]));
    runReportMock.mockResolvedValueOnce({ data: {} });
    runReportMock.mockResolvedValueOnce({ data: {} });
    runReportMock.mockResolvedValueOnce({ data: {} });
    runReportMock.mockResolvedValueOnce({ data: {} });
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok:true");
    expect(out.snapshot.topPages).toEqual([]);
    expect(out.snapshot.topEvents).toEqual([]);
    expect(out.snapshot.sourceMedium).toEqual([]);
    expect(out.snapshot.trend7d).toEqual([]);
  });

  it("returns {ok:false, error, hint} when any sub-query throws", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockRejectedValueOnce(new Error("quota exceeded"));
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out).toEqual({
      ok: false,
      error: "quota exceeded",
      hint: expect.stringContaining("service-account"),
    });
  });

  it("stringifies non-Error thrown values from googleapis", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockRejectedValueOnce("boom-string");
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected ok:false");
    expect(out.error).toBe("boom-string");
  });

  it("does not bubble a googleapis error past fetchDailySnapshot (never throws)", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    runReportMock.mockResolvedValueOnce(totalsResp(["1", "1", "1", "1", "1", "1", "1"]));
    runReportMock.mockRejectedValueOnce(new Error("mid-flight failure"));
    const mod = await importModule();
    await expect(mod.fetchDailySnapshot()).resolves.toBeDefined();
  });

  it("short-circuits without hitting googleapis when the JSON creds are unparseable", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = "{broken";
    const mod = await importModule();
    const out = await mod.fetchDailySnapshot();
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected ok:false");
    expect(out.error).toMatch(/not valid JSON/);
    // Auth never even got instantiated.
    expect(googleAuthCtor).not.toHaveBeenCalled();
  });

  it("returns a fresh Google auth client per fetchDailySnapshot invocation (no cross-tick leak)", async () => {
    process.env.GA4_PROPERTY_ID = "1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = VALID_SA;
    queueHappyPath();
    const mod = await importModule();
    await mod.fetchDailySnapshot();
    // 5 sub-queries → 5 GoogleAuth instantiations (deferred per call, no cache).
    expect(googleAuthCtor.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(analyticsdataFactory.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});
