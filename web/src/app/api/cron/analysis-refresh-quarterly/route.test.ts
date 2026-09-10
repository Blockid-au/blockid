// Colocated vitest for /api/cron/analysis-refresh-quarterly (T0251).
// Pins: Bearer CRON_SECRET gate (401 when unset or mismatched), 503 when the
// runner reports supabase_unavailable, 500 on other failures, `?dry=1` →
// dryRun:true + the note list in the body, `?force=1` → force:true, and that
// GET and POST are the same handler (cron-runner.sh POSTs).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runMock } = vi.hoisted(() => ({ runMock: vi.fn() }));
vi.mock("@/lib/funding/analysis-refresh", () => ({
  runAnalysisRefreshQuarterly: (opts: unknown) => runMock(opts),
}));

import { GET, POST, dynamic, maxDuration } from "./route";

const OK = { ok: true, dryRun: false, quarter: "2026-Q3", users: 2, projects: 3, written: 3, notified: 2, skipped: 0, errors: 0 };

function req(url = "http://localhost/api/cron/analysis-refresh-quarterly", auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

describe("analysis-refresh-quarterly route", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    runMock.mockReset();
    runMock.mockResolvedValue({ ...OK });
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

  it("401 without / with a wrong bearer, and when CRON_SECRET is unset", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(undefined, "Bearer nope"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("runs with dryRun:false / force:false by default and returns the summary + duration", async () => {
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(runMock).toHaveBeenCalledWith({ dryRun: false, force: false });
    expect(body).toMatchObject({ ok: true, quarter: "2026-Q3", written: 3, notified: 2 });
    expect(typeof body.duration_ms).toBe("number");
  });

  it("?dry=1 → dryRun:true with the notes in the body; ?force=1 → force:true", async () => {
    runMock.mockResolvedValueOnce({ ...OK, dryRun: true, notes: [{ userId: "u", projectId: "p", changes: 2, title: "t" }] });
    const dry = await GET(req("http://localhost/api/cron/analysis-refresh-quarterly?dry=1", "Bearer s3cret"));
    expect(runMock).toHaveBeenLastCalledWith({ dryRun: true, force: false });
    expect((await dry.json()).notes).toHaveLength(1);

    await GET(req("http://localhost/api/cron/analysis-refresh-quarterly?force=true", "Bearer s3cret"));
    expect(runMock).toHaveBeenLastCalledWith({ dryRun: false, force: true });
  });

  it("503 on supabase_unavailable, 500 on any other failure", async () => {
    runMock.mockResolvedValueOnce({ ...OK, ok: false, error: "supabase_unavailable" });
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(503);
    runMock.mockResolvedValueOnce({ ...OK, ok: false, error: "boom" });
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
  });
});
