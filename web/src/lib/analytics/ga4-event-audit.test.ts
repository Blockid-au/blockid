// S23-B — runGa4EventAudit against a mocked Data API client, the
// persisted-file round trip and the /api/status reduction.

import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GA4_AUDIT_EVENTS } from "./ga4-dimensions";
import {
  GA4_EVENT_AUDIT_FILE,
  ga4EventStatusString,
  persistGa4EventAudit,
  readGa4EventAudit,
  readGa4EventAuditStatus,
  runGa4EventAudit,
  type Ga4DataClient,
  type Ga4EventAuditReport,
} from "./ga4-event-audit";

const googleapisMock = vi.hoisted(() => ({ GoogleAuth: vi.fn(), analyticsdata: vi.fn() }));
vi.mock("googleapis", () => ({
  google: { auth: { GoogleAuth: googleapisMock.GoogleAuth }, analyticsdata: googleapisMock.analyticsdata },
}));

const ENV = {
  GA4_PROPERTY_ID: "538350801",
  GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL: "sa@longcare-495115.iam.gserviceaccount.com",
  GOOGLE_DRIVE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
};
const NOW = new Date("2026-09-14T04:30:00.000Z"); // a Monday

type Req = { property: string; requestBody: Record<string, unknown> };

/**
 * Fake Data API: call 1 = filtered event counts, call 2 = all event names,
 * call 3 = hero × customEvent:arm. `armError` simulates the 400 GA4 returns
 * when the dimension is not registered.
 */
function fakeClient(opts: { counts?: Record<string, number>; allNames?: number; arms?: Record<string, number>; armError?: unknown; firstError?: unknown } = {}) {
  const calls: Req[] = [];
  const runReport = vi.fn(async (args: Req) => {
    calls.push(args);
    const dims = (args.requestBody.dimensions as Array<{ name: string }>).map((d) => d.name);
    if (dims.length === 2) {
      if (opts.armError) throw opts.armError;
      return {
        data: {
          rows: Object.entries(opts.arms ?? {}).map(([arm, n]) => ({
            dimensionValues: [{ value: "hero_variant_shown" }, { value: arm }],
            metricValues: [{ value: String(n) }],
          })),
        },
      };
    }
    if (args.requestBody.dimensionFilter) {
      if (opts.firstError) throw opts.firstError;
      return {
        data: {
          rows: Object.entries(opts.counts ?? {}).map(([name, n]) => ({ dimensionValues: [{ value: name }], metricValues: [{ value: String(n) }] })),
        },
      };
    }
    return { data: { rows: Array.from({ length: opts.allNames ?? 0 }, (_, i) => ({ dimensionValues: [{ value: `e${i}` }], metricValues: [{ value: "1" }] })) } };
  });
  const client: Ga4DataClient = { properties: { runReport } };
  return { client, runReport, calls };
}

describe("runGa4EventAudit", () => {
  it("ok: every expected event seen, hero dimension registered with per-arm counts; 7-day range ends yesterday", async () => {
    const counts = Object.fromEntries(GA4_AUDIT_EVENTS.map((e, i) => [e, i + 1]));
    const { client, calls } = fakeClient({ counts, allNames: 14, arms: { F1: 40, F2: 12 } });
    const r = await runGa4EventAudit({ env: ENV, client, now: NOW });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("ok");
    expect(r.missing).toEqual([]);
    expect(r.seen).toEqual(counts);
    expect(r.total_event_names).toBe(14);
    expect(r.hero_variant).toEqual({ parameter: "arm", registered: true, arms: { F1: 40, F2: 12 } });
    expect(r.range).toEqual({ start: "2026-09-07", end: "2026-09-13", days: 7 });
    expect(r.property).toBe("properties/538350801");
    expect(r.blocked).toBeNull();
    // The first report is filtered to exactly the expected names.
    expect(calls[0].requestBody.dimensionFilter).toEqual({ filter: { fieldName: "eventName", inListFilter: { values: [...GA4_AUDIT_EVENTS] } } });
    expect(calls[0].requestBody.dateRanges).toEqual([{ startDate: "2026-09-07", endDate: "2026-09-13" }]);
    expect(calls[2].requestBody.dimensions).toEqual([{ name: "eventName" }, { name: "customEvent:arm" }]);
  });

  it("missing: lists the events with no hits (a zero count is missing) and the hero dimension as not registered on the 400", async () => {
    const { client } = fakeClient({
      counts: { hero_variant_shown: 3, compare_viewed: 0 },
      allNames: 6,
      armError: Object.assign(new Error("Did you mean isKeyEvent? Field customEvent:arm is not a valid dimension."), { code: 400 }),
    });
    const r = await runGa4EventAudit({ env: ENV, client, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("missing");
    expect(r.missing).toEqual(GA4_AUDIT_EVENTS.filter((e) => e !== "hero_variant_shown"));
    expect(r.hero_variant.registered).toBe(false);
    expect(r.hero_variant.arms).toEqual({});
  });

  it("an unexpected hero-report failure leaves registered = null (unknown), not false", async () => {
    const { client } = fakeClient({ counts: { hero_variant_shown: 1 }, armError: new Error("ECONNRESET") });
    const r = await runGa4EventAudit({ env: ENV, client, now: NOW });
    expect(r.hero_variant.registered).toBeNull();
    expect(r.status).toBe("missing");
  });

  it("Data API disabled / unauthorised → blocked with the Data API operator steps, no throw", async () => {
    const { client } = fakeClient({
      firstError: Object.assign(new Error("Google Analytics Data API has not been used in project 990415480608 before or it is disabled."), {
        code: 403,
        errors: [{ reason: "accessNotConfigured" }],
      }),
    });
    const r = await runGa4EventAudit({ env: ENV, client, now: NOW });
    expect(r.status).toBe("blocked");
    expect(r.ok).toBe(false);
    expect(r.blocked?.reason).toBe("api_disabled");
    expect(r.blocked?.steps).toHaveLength(2);
    expect(r.blocked?.steps[0]).toContain("analyticsdata.googleapis.com/overview?project=990415480608");
    expect(r.blocked?.steps[1]).toContain("sa@longcare-495115.iam.gserviceaccount.com");
    expect(r.missing).toEqual([...GA4_AUDIT_EVENTS]);
  });

  it("insufficient scope (analytics.edit token on the Data API) is blocked too", async () => {
    const { client } = fakeClient({ firstError: Object.assign(new Error("Request had insufficient authentication scopes."), { code: 403 }) });
    const r = await runGa4EventAudit({ env: ENV, client, now: NOW });
    expect(r.blocked?.reason).toBe("insufficient_scope");
  });

  it("network errors are recorded as error with status unknown", async () => {
    const { client } = fakeClient({ firstError: new Error("ECONNRESET") });
    const r = await runGa4EventAudit({ env: ENV, client, now: NOW });
    expect(r.status).toBe("unknown");
    expect(r.error).toBe("ECONNRESET");
    expect(r.blocked).toBeNull();
  });

  it("not configured → blocked.not_configured naming the env var", async () => {
    const r = await runGa4EventAudit({ env: {}, now: NOW });
    expect(r.status).toBe("blocked");
    expect(r.blocked?.reason).toBe("not_configured");
    expect(r.blocked?.message).toContain("GA4_PROPERTY_ID");
  });

  it("builds the googleapis client with the readonly scope (the Data API rejects analytics.edit)", async () => {
    const { client } = fakeClient({ counts: {} });
    googleapisMock.GoogleAuth.mockImplementation(function (this: unknown) {
      return { kind: "auth" };
    });
    googleapisMock.analyticsdata.mockReturnValue(client);
    const r = await runGa4EventAudit({ env: ENV, now: NOW });
    expect(r.status).toBe("missing");
    expect(googleapisMock.GoogleAuth).toHaveBeenCalledWith(expect.objectContaining({ scopes: ["https://www.googleapis.com/auth/analytics.readonly"] }));
    expect(googleapisMock.analyticsdata).toHaveBeenCalledWith({ version: "v1beta", auth: { kind: "auth" } });
  });

  it("carries dry through and honours a custom expected list", async () => {
    const { client } = fakeClient({ counts: { a: 1 } });
    const r = await runGa4EventAudit({ env: ENV, client, now: NOW, dry: true, expected: ["a", "b"] });
    expect(r.dry).toBe(true);
    expect(r.expected).toEqual(["a", "b"]);
    expect(r.missing).toEqual(["b"]);
  });
});

describe("persist / read / status string", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "ga4-audit-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function report(overrides: Partial<Ga4EventAuditReport> = {}): Ga4EventAuditReport {
    return {
      ts: NOW.toISOString(),
      ok: true,
      status: "ok",
      property: "properties/1",
      range: { start: "2026-09-07", end: "2026-09-13", days: 7 },
      expected: [...GA4_AUDIT_EVENTS],
      seen: {},
      missing: [],
      total_event_names: 3,
      hero_variant: { parameter: "arm", registered: true, arms: {} },
      blocked: null,
      error: null,
      dry: false,
      duration_ms: 1,
      ...overrides,
    };
  }

  it("round-trips through content/reports/ga4-event-audit.json", async () => {
    expect(await persistGa4EventAudit(report(), root)).toBe(true);
    const file = path.join(root, GA4_EVENT_AUDIT_FILE);
    expect(JSON.parse(readFileSync(file, "utf8")).status).toBe("ok");
    expect((await readGa4EventAudit(root))?.ts).toBe(NOW.toISOString());
    expect(await readGa4EventAuditStatus(root, NOW.getTime() + 1000)).toBe("ok");
  });

  it("missing → missing:<comma list>; blocked → blocked; stale (> 8 days) or absent → unknown", () => {
    const t = NOW.getTime() + 60_000;
    expect(ga4EventStatusString(report({ status: "missing", ok: false, missing: ["funding_preview", "compare_viewed"] }), t)).toBe("missing:funding_preview,compare_viewed");
    expect(ga4EventStatusString(report({ status: "blocked", ok: false, blocked: { reason: "api_disabled", steps: [], message: "" } }), t)).toBe("blocked");
    expect(ga4EventStatusString(report({ status: "unknown", ok: false, error: "ECONNRESET" }), t)).toBe("unknown");
    expect(ga4EventStatusString(report(), NOW.getTime() + 9 * 86_400_000)).toBe("unknown");
    expect(ga4EventStatusString(null)).toBe("unknown");
    expect(ga4EventStatusString({ status: "ok" })).toBe("unknown"); // no ts
  });

  it("an unparsable file reads as unknown, never throws", async () => {
    mkdirSync(path.dirname(path.join(root, GA4_EVENT_AUDIT_FILE)), { recursive: true });
    writeFileSync(path.join(root, GA4_EVENT_AUDIT_FILE), "{nope");
    expect(await readGa4EventAudit(root)).toBeNull();
    expect(await readGa4EventAuditStatus(root)).toBe("unknown");
  });
});
