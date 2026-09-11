// Colocated vitest for /api/cron/funding-report-retry (review 2026-09-10 #11).
// Pins: Bearer CRON_SECRET gate (401 when unset or mismatched), 503 when the
// sweep reports supabase_unavailable, 500 on other failures, `?dry=1` →
// dryRun:true passed through, force-dynamic, and GET === POST
// (cron-runner.sh POSTs).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const retryMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funding/report-retry", () => ({
  retryStuckFundingReports: (opts: unknown) => retryMock(opts),
}));

import { GET, POST, dynamic } from "./route";

const OK = { ok: true, dryRun: false, scanned: 3, candidates: [], regenerated: 1, failed: 0, emailed: 1, email_skipped: 0, results: [] };

function req(url = "http://localhost/api/cron/funding-report-retry", auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

describe("funding-report-retry route", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    retryMock.mockReset().mockResolvedValue({ ...OK });
  });
  afterEach(() => {
    if (origSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = origSecret;
  });

  it("exports force-dynamic and POST === GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(POST).toBe(GET);
  });

  it("401 without / with wrong bearer, and when CRON_SECRET is unset", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(undefined, "Bearer nope"))).status).toBe(401);
    // S8-C: constant-time compare — a correct prefix / extra suffix is still 401.
    expect((await GET(req(undefined, "Bearer s3cre"))).status).toBe(401);
    expect((await GET(req(undefined, "Bearer s3cretX"))).status).toBe(401);
    expect((await GET(req(undefined, "s3cret"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(401);
    expect(retryMock).not.toHaveBeenCalled();
  });

  it("runs the sweep (dryRun false) and returns its summary with duration_ms", async () => {
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, regenerated: 1, emailed: 1 });
    expect(typeof body.duration_ms).toBe("number");
    expect(retryMock).toHaveBeenCalledWith({ dryRun: false });
  });

  it("?dry=1 passes dryRun:true through", async () => {
    retryMock.mockResolvedValueOnce({ ...OK, dryRun: true, candidates: [{ id: "fr_1" }] });
    const res = await GET(req("http://localhost/api/cron/funding-report-retry?dry=1", "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ dryRun: true, candidates: [{ id: "fr_1" }] });
    expect(retryMock).toHaveBeenCalledWith({ dryRun: true });
  });

  it("503 on supabase_unavailable, 500 on any other sweep error", async () => {
    retryMock.mockResolvedValueOnce({ ...OK, ok: false, error: "supabase_unavailable" });
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(503);
    retryMock.mockResolvedValueOnce({ ...OK, ok: false, error: "boom" });
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, error: "boom" });
  });
});
