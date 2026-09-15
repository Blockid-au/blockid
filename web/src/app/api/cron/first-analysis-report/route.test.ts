// Colocated vitest for /api/cron/first-analysis-report (S32-B).
// Pins: Bearer CRON_SECRET gate (401 unset / mismatched / prefix), `?dry=1`
// → dryRun:true, 500 on a sweep failure, force-dynamic, GET === POST.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sweepMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analyses/first-analysis/sweep", () => ({
  sweepFirstAnalysisReports: (opts: unknown) => sweepMock(opts),
}));

import { GET, POST, dynamic } from "./route";

const OK = { ok: true, dryRun: false, runnable: [], emailable: [], ran: [{ id: "a", outcome: "done" }], emailed: [] };

function req(url = "http://localhost/api/cron/first-analysis-report", auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

describe("first-analysis-report cron route", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    sweepMock.mockReset().mockResolvedValue({ ...OK });
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
    expect((await GET(req(undefined, "Bearer s3cre"))).status).toBe(401);
    expect((await GET(req(undefined, "s3cret"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(401);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns its summary with duration_ms", async () => {
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ran: [{ id: "a", outcome: "done" }] });
    expect(typeof body.duration_ms).toBe("number");
    expect(sweepMock).toHaveBeenCalledWith({ dryRun: false });
  });

  it("?dry=1 passes dryRun:true", async () => {
    sweepMock.mockResolvedValue({ ...OK, dryRun: true });
    const res = await GET(req("http://localhost/api/cron/first-analysis-report?dry=1", "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(sweepMock).toHaveBeenCalledWith({ dryRun: true });
    expect((await res.json()).dryRun).toBe(true);
  });

  it("500 when the sweep reports failure", async () => {
    sweepMock.mockResolvedValue({ ...OK, ok: false, error: "supabase down" });
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("supabase down");
  });
});
