// Colocated regression suite for `web/src/lib/google-analytics.ts` — the
// GA4 Data-API reader that powers the daily traffic block in the CxO reports.
// A silent regression here has an outsized blast radius:
//   - drop the three-key env guard in `isGAConfigured()` and every CxO report
//     tries to reach GA even on prod boxes without a service account bound,
//     hitting the network for a Promise.all triple-fan-out on every render;
//   - drop the `?.replace(/\\n/g, "\n")` normalisation on the private key and
//     the service account import at boot silently succeeds but every JWT-
//     signed API call rejects at runtime with an opaque PEM-parse error;
//   - drop the `try/catch` around `Promise.all` and one flaky sub-query
//     poisons the whole report path, killing the outer digest cron;
//   - drop `?? "(unknown)"` / `?? "/"` fallbacks and a GA row with a missing
//     dimensionValue crashes `.map((r) => ({ source: r.dimensionValues?.[0].value }))`
//     under `strictNullChecks` at type-check time (regression risk if the
//     inner optional chain is ever inlined away).
//
// P9_ship autonomous-loop tick — first test coverage for google-analytics.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted; install captures for the googleapis surface so we can
// assert the exact requestBody shapes the module builds without touching the
// network.
const { runReportMock, googleAuthCtor, analyticsdataFactory } = vi.hoisted(() => ({
  runReportMock: vi.fn(),
  googleAuthCtor: vi.fn(),
  analyticsdataFactory: vi.fn(),
}));

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
  "GA_PROPERTY_ID",
  "GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_DRIVE_PRIVATE_KEY",
] as const;

const savedEnv: Record<string, string | undefined> = {};

function clearEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k];
}

function restoreEnv(): void {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
}

function setAllEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}): void {
  process.env.GA_PROPERTY_ID = overrides.GA_PROPERTY_ID ?? "12345678";
  process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL =
    overrides.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL ?? "sa@example.iam.gserviceaccount.com";
  process.env.GOOGLE_DRIVE_PRIVATE_KEY =
    overrides.GOOGLE_DRIVE_PRIVATE_KEY ?? "-----BEGIN PRIVATE KEY-----\\nAAAA\\n-----END PRIVATE KEY-----";
}

async function loadMod() {
  vi.resetModules();
  return await import("./google-analytics");
}

function coreRow(active: number, newU: number, sessions: number, pageViews: number) {
  return {
    data: {
      rows: [
        {
          metricValues: [
            { value: String(active) },
            { value: String(newU) },
            { value: String(sessions) },
            { value: String(pageViews) },
          ],
        },
      ],
    },
  };
}

function sourcesResp(rows: Array<{ source?: string | null; users: number }>) {
  return {
    data: {
      rows: rows.map((r) => ({
        dimensionValues: r.source === undefined ? undefined : [{ value: r.source }],
        metricValues: [{ value: String(r.users) }],
      })),
    },
  };
}

function pagesResp(rows: Array<{ page?: string | null; views: number }>) {
  return {
    data: {
      rows: rows.map((r) => ({
        dimensionValues: r.page === undefined ? undefined : [{ value: r.page }],
        metricValues: [{ value: String(r.views) }],
      })),
    },
  };
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe("google-analytics.ts", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    clearEnv();
    runReportMock.mockReset();
    googleAuthCtor.mockReset();
    analyticsdataFactory.mockReset();
  });

  afterEach(() => {
    restoreEnv();
  });

  // ─── isGAConfigured() ──────────────────────────────────────────────────────

  describe("isGAConfigured()", () => {
    it("returns false when no env vars are set", async () => {
      const mod = await loadMod();
      expect(mod.isGAConfigured()).toBe(false);
    });

    it("returns false when only GA_PROPERTY_ID is set", async () => {
      process.env.GA_PROPERTY_ID = "12345678";
      const mod = await loadMod();
      expect(mod.isGAConfigured()).toBe(false);
    });

    it("returns false when only the service-account email is set", async () => {
      process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL = "sa@example.iam.gserviceaccount.com";
      const mod = await loadMod();
      expect(mod.isGAConfigured()).toBe(false);
    });

    it("returns false when only the private key is set", async () => {
      process.env.GOOGLE_DRIVE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----";
      const mod = await loadMod();
      expect(mod.isGAConfigured()).toBe(false);
    });

    it("returns false when GA_PROPERTY_ID is the empty string", async () => {
      setAllEnv({ GA_PROPERTY_ID: "" });
      const mod = await loadMod();
      expect(mod.isGAConfigured()).toBe(false);
    });

    it("returns false when the service-account email is the empty string", async () => {
      setAllEnv({ GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL: "" });
      const mod = await loadMod();
      expect(mod.isGAConfigured()).toBe(false);
    });

    it("returns false when the private key is the empty string", async () => {
      setAllEnv({ GOOGLE_DRIVE_PRIVATE_KEY: "" });
      const mod = await loadMod();
      expect(mod.isGAConfigured()).toBe(false);
    });

    it("returns true when all three env vars are set", async () => {
      setAllEnv();
      const mod = await loadMod();
      expect(mod.isGAConfigured()).toBe(true);
    });
  });

  // ─── getGA4Report() — guard branches ───────────────────────────────────────

  describe("getGA4Report() — env guards", () => {
    it("returns null when GA_PROPERTY_ID is missing (no runReport call)", async () => {
      process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL = "sa@x.iam";
      process.env.GOOGLE_DRIVE_PRIVATE_KEY = "key";
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out).toBeNull();
      expect(runReportMock).not.toHaveBeenCalled();
      expect(googleAuthCtor).not.toHaveBeenCalled();
    });

    it("returns null when the service-account email is missing", async () => {
      process.env.GA_PROPERTY_ID = "12345678";
      process.env.GOOGLE_DRIVE_PRIVATE_KEY = "key";
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out).toBeNull();
      expect(runReportMock).not.toHaveBeenCalled();
    });

    it("returns null when the private key is missing", async () => {
      process.env.GA_PROPERTY_ID = "12345678";
      process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL = "sa@x.iam";
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out).toBeNull();
      expect(runReportMock).not.toHaveBeenCalled();
    });
  });

  // ─── getGA4Report() — success path & request contract ─────────────────────

  describe("getGA4Report() — happy path & contract", () => {
    beforeEach(() => {
      setAllEnv();
      runReportMock
        .mockResolvedValueOnce(coreRow(10, 3, 7, 22))
        .mockResolvedValueOnce(sourcesResp([{ source: "google", users: 5 }, { source: "direct", users: 2 }]))
        .mockResolvedValueOnce(pagesResp([{ page: "/", views: 20 }, { page: "/pricing", views: 2 }]));
    });

    it("maps the four core metrics by positional index", async () => {
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out).not.toBeNull();
      expect(out).toMatchObject({ activeUsers: 10, newUsers: 3, sessions: 7, pageViews: 22 });
    });

    it("maps top sources from the second runReport response", async () => {
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out?.topSources).toEqual([
        { source: "google", users: 5 },
        { source: "direct", users: 2 },
      ]);
    });

    it("maps top pages from the third runReport response", async () => {
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out?.topPages).toEqual([
        { page: "/", views: 20 },
        { page: "/pricing", views: 2 },
      ]);
    });

    it("issues exactly three runReport calls (core, sources, pages)", async () => {
      const mod = await loadMod();
      await mod.getGA4Report();
      expect(runReportMock).toHaveBeenCalledTimes(3);
    });

    it("targets `properties/${GA_PROPERTY_ID}` on every call", async () => {
      setAllEnv({ GA_PROPERTY_ID: "99887766" });
      runReportMock.mockReset();
      runReportMock
        .mockResolvedValueOnce(coreRow(0, 0, 0, 0))
        .mockResolvedValueOnce(sourcesResp([]))
        .mockResolvedValueOnce(pagesResp([]));
      const mod = await loadMod();
      await mod.getGA4Report();
      for (const call of runReportMock.mock.calls) {
        expect(call[0].property).toBe("properties/99887766");
      }
    });

    it("core request declares the four metrics in canonical order", async () => {
      const mod = await loadMod();
      await mod.getGA4Report();
      const coreCall = runReportMock.mock.calls[0][0];
      expect(coreCall.requestBody.metrics).toEqual([
        { name: "activeUsers" },
        { name: "newUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
      ]);
      expect(coreCall.requestBody.dimensions).toBeUndefined();
    });

    it("sources request groups by sessionDefaultChannelGroup with limit=5 desc", async () => {
      const mod = await loadMod();
      await mod.getGA4Report();
      const sourcesCall = runReportMock.mock.calls[1][0];
      expect(sourcesCall.requestBody.dimensions).toEqual([{ name: "sessionDefaultChannelGroup" }]);
      expect(sourcesCall.requestBody.metrics).toEqual([{ name: "activeUsers" }]);
      expect(sourcesCall.requestBody.limit).toBe("5");
      expect(sourcesCall.requestBody.orderBys).toEqual([
        { metric: { metricName: "activeUsers" }, desc: true },
      ]);
    });

    it("pages request groups by pagePath with limit=5 desc on screenPageViews", async () => {
      const mod = await loadMod();
      await mod.getGA4Report();
      const pagesCall = runReportMock.mock.calls[2][0];
      expect(pagesCall.requestBody.dimensions).toEqual([{ name: "pagePath" }]);
      expect(pagesCall.requestBody.metrics).toEqual([{ name: "screenPageViews" }]);
      expect(pagesCall.requestBody.limit).toBe("5");
      expect(pagesCall.requestBody.orderBys).toEqual([
        { metric: { metricName: "screenPageViews" }, desc: true },
      ]);
    });

    it("defaults `days` to 1 (startDate='1daysAgo', endDate='yesterday')", async () => {
      const mod = await loadMod();
      await mod.getGA4Report();
      for (const call of runReportMock.mock.calls) {
        expect(call[0].requestBody.dateRanges).toEqual([
          { startDate: "1daysAgo", endDate: "yesterday" },
        ]);
      }
    });

    it("threads a custom `days` value into every dateRange as '<N>daysAgo'", async () => {
      const mod = await loadMod();
      await mod.getGA4Report(7);
      for (const call of runReportMock.mock.calls) {
        expect(call[0].requestBody.dateRanges).toEqual([
          { startDate: "7daysAgo", endDate: "yesterday" },
        ]);
      }
    });

    it("constructs the GoogleAuth client with analytics.readonly scope + service-account creds", async () => {
      const mod = await loadMod();
      await mod.getGA4Report();
      expect(googleAuthCtor).toHaveBeenCalledTimes(1);
      const opts = googleAuthCtor.mock.calls[0][0];
      expect(opts.scopes).toEqual(["https://www.googleapis.com/auth/analytics.readonly"]);
      expect(opts.credentials.client_email).toBe("sa@example.iam.gserviceaccount.com");
    });

    it("normalises literal '\\n' sequences in GOOGLE_DRIVE_PRIVATE_KEY back to real newlines", async () => {
      const mod = await loadMod();
      await mod.getGA4Report();
      const opts = googleAuthCtor.mock.calls[0][0];
      expect(opts.credentials.private_key).toBe(
        "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----",
      );
      expect(opts.credentials.private_key).not.toContain("\\n");
    });

    it("targets the v1beta analyticsdata API surface", async () => {
      const mod = await loadMod();
      await mod.getGA4Report();
      expect(analyticsdataFactory).toHaveBeenCalledTimes(1);
      expect(analyticsdataFactory.mock.calls[0][0]).toMatchObject({ version: "v1beta" });
    });
  });

  // ─── getGA4Report() — degenerate response shapes ──────────────────────────

  describe("getGA4Report() — response coercion", () => {
    it("returns zeroed core metrics when the core response has no rows", async () => {
      setAllEnv();
      runReportMock
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce(sourcesResp([]))
        .mockResolvedValueOnce(pagesResp([]));
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out).toEqual({
        activeUsers: 0,
        newUsers: 0,
        sessions: 0,
        pageViews: 0,
        topSources: [],
        topPages: [],
      });
    });

    it("coerces missing metricValues in the core response to 0 without throwing", async () => {
      setAllEnv();
      runReportMock
        .mockResolvedValueOnce({ data: { rows: [{ metricValues: [{ value: "5" }] }] } })
        .mockResolvedValueOnce(sourcesResp([]))
        .mockResolvedValueOnce(pagesResp([]));
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out).toMatchObject({ activeUsers: 5, newUsers: 0, sessions: 0, pageViews: 0 });
    });

    it("falls back to '(unknown)' when a source row is missing its dimensionValues", async () => {
      setAllEnv();
      runReportMock
        .mockResolvedValueOnce(coreRow(1, 1, 1, 1))
        .mockResolvedValueOnce(sourcesResp([{ users: 4 }]))
        .mockResolvedValueOnce(pagesResp([]));
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out?.topSources).toEqual([{ source: "(unknown)", users: 4 }]);
    });

    it("falls back to '/' when a page row is missing its dimensionValues", async () => {
      setAllEnv();
      runReportMock
        .mockResolvedValueOnce(coreRow(1, 1, 1, 1))
        .mockResolvedValueOnce(sourcesResp([]))
        .mockResolvedValueOnce(pagesResp([{ views: 9 }]));
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out?.topPages).toEqual([{ page: "/", views: 9 }]);
    });

    it("returns empty topSources/topPages arrays when the row lists are absent", async () => {
      setAllEnv();
      runReportMock
        .mockResolvedValueOnce(coreRow(2, 1, 3, 4))
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} });
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out?.topSources).toEqual([]);
      expect(out?.topPages).toEqual([]);
    });
  });

  // ─── getGA4Report() — failure paths ───────────────────────────────────────

  describe("getGA4Report() — failure isolation", () => {
    it("returns null and logs when runReport rejects", async () => {
      setAllEnv();
      runReportMock.mockRejectedValueOnce(new Error("permission denied"));
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out).toBeNull();
      expect(errSpy).toHaveBeenCalled();
      const args = errSpy.mock.calls[0];
      expect(String(args[0])).toContain("[ga4]");
      expect(String(args[1])).toContain("permission denied");
      errSpy.mockRestore();
    });

    it("returns null when a non-Error is thrown (opaque object)", async () => {
      setAllEnv();
      runReportMock.mockRejectedValueOnce({ code: 500, msg: "boom" });
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mod = await loadMod();
      const out = await mod.getGA4Report();
      expect(out).toBeNull();
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});
