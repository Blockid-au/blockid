// Colocated vitest for /api/cron/money-radar-sweep (T0245).
// Pins: Bearer CRON_SECRET gate (401 when unset or mismatched), 503 when the
// sweep reports supabase_unavailable, 500 on other failures, `?dry=1` →
// dryRun:true + the event list in the body, counts-only otherwise, and that
// GET and POST are the same handler (cron-runner.sh POSTs).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sweepMock } = vi.hoisted(() => ({ sweepMock: vi.fn() }));
vi.mock("@/lib/funding/radar-sweep", () => ({
  runMoneyRadarSweep: (opts: unknown) => sweepMock(opts),
}));

import { GET, POST, dynamic, maxDuration } from "./route";

const OK = {
  ok: true,
  dryRun: false,
  runDate: "2026-09-13",
  subscribers: 2,
  targets: 2,
  inserted: 3,
  updated: 1,
  notifications: 4,
  events: [{ type: "new_match", ref_id: "g1" }],
  byType: { new_match: 3, deadline_t30: 1, deadline_t14: 0, deadline_t3: 0, status_changed: 0, new_round_opened: 0 },
  errors: 0,
  skipped: 0,
};

function req(url = "http://localhost/api/cron/money-radar-sweep", auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

describe("money-radar-sweep route", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    sweepMock.mockReset();
    sweepMock.mockResolvedValue({ ...OK });
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
    delete process.env.CRON_SECRET;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(401);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns counts without the event list", async () => {
    const r = await POST(req(undefined, "Bearer s3cret"));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ ok: true, subscribers: 2, inserted: 3, notifications: 4, byType: { new_match: 3 } });
    expect(body.events).toBeUndefined();
    expect(typeof body.duration_ms).toBe("number");
    expect(sweepMock).toHaveBeenCalledWith({ dryRun: false });
  });

  it("?dry=1 passes dryRun and includes the events", async () => {
    sweepMock.mockResolvedValue({ ...OK, dryRun: true });
    const r = await GET(req("http://localhost/api/cron/money-radar-sweep?dry=1", "Bearer s3cret"));
    const body = await r.json();
    expect(sweepMock).toHaveBeenCalledWith({ dryRun: true });
    expect(body.dryRun).toBe(true);
    expect(body.events).toHaveLength(1);
  });

  it("503 on supabase_unavailable, 500 on any other failure", async () => {
    sweepMock.mockResolvedValue({ ...OK, ok: false, error: "supabase_unavailable" });
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(503);
    sweepMock.mockResolvedValue({ ...OK, ok: false, error: "empty_catalogue" });
    const r = await GET(req(undefined, "Bearer s3cret"));
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe("empty_catalogue");
  });
});
