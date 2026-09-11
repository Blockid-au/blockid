// Colocated vitest for /api/cron/refresh-funding-sources (T0243).
// Pins: Bearer CRON_SECRET gate (401 when unset or mismatched), 503 when the
// loop reports supabase_unavailable, `?dry=1` → dryRun:true + entries in the
// body, and that GET and POST are the same handler (cron-runner.sh POSTs).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("@/lib/funding/refresh", () => ({
  refreshFundingSources: (opts: unknown) => refreshMock(opts),
}));

import { GET, POST, dynamic, maxDuration } from "./route";

const OK_SUMMARY = {
  ok: true,
  dryRun: false,
  checked: 3,
  reachable: 2,
  blocked: 1,
  verified: 1,
  queued: 2,
  flipped: 0,
  errors: 0,
  skipped: 0,
  feed: { url: "https://www.grants.gov.au/go/list", items: 5, blocked: false, newCandidates: 1 },
  entries: [{ ts: "t", kind: "grant", id: "x", url: "u", reason: "blocked", hint: {}, current: null }],
};

function req(url = "http://localhost/api/cron/refresh-funding-sources", auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

describe("refresh-funding-sources route", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    refreshMock.mockReset();
    refreshMock.mockResolvedValue({ ...OK_SUMMARY });
  });
  afterEach(() => {
    if (origSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = origSecret;
  });

  it("exports force-dynamic + 300 s maxDuration and POST === GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
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
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("runs the loop and returns the summary without entries (cron-health detail stays short)", async () => {
    const r = await POST(req(undefined, "Bearer s3cret"));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ ok: true, checked: 3, reachable: 2, blocked: 1, queued: 2, flipped: 0 });
    expect(body.entries).toBeUndefined();
    expect(typeof body.duration_ms).toBe("number");
    expect(refreshMock).toHaveBeenCalledWith({ dryRun: false });
  });

  it("?dry=1 passes dryRun and includes the would-be queue entries", async () => {
    refreshMock.mockResolvedValue({ ...OK_SUMMARY, dryRun: true });
    const r = await GET(req("http://localhost/api/cron/refresh-funding-sources?dry=1", "Bearer s3cret"));
    const body = await r.json();
    expect(refreshMock).toHaveBeenCalledWith({ dryRun: true });
    expect(body.dryRun).toBe(true);
    expect(body.entries).toHaveLength(1);
  });

  it("503 when Supabase is unavailable, 500 on other loop failures", async () => {
    refreshMock.mockResolvedValue({ ...OK_SUMMARY, ok: false, error: "supabase_unavailable" });
    const r = await GET(req(undefined, "Bearer s3cret"));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ ok: false, error: "supabase_unavailable" });

    refreshMock.mockResolvedValue({ ...OK_SUMMARY, ok: false, error: "load_failed: boom" });
    const r2 = await GET(req(undefined, "Bearer s3cret"));
    expect(r2.status).toBe(500);
    expect((await r2.json()).error).toBe("load_failed: boom");
  });
});
