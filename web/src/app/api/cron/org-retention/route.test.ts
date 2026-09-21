// G21 P3-B — /api/cron/org-retention: CRON_SECRET gate, `?dry=1` +
// `?limit=` forwarded to runOrgRetention, 503 before 0428 / no DB, 500 on
// another failure, POST === GET, 300 s budget.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const runMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/org/retention", () => ({ runOrgRetention: (o: unknown) => runMock(o) }));

import { GET, POST, dynamic, maxDuration } from "./route";

const OK = { ok: true, dry_run: false, now: "2026-09-21T04:40:00.000Z", orgs: [], deleted_total: 0 };
function req(qs = "", auth: string | null = "Bearer s3cret") {
  return new Request(`http://localhost/api/cron/org-retention${qs}`, { headers: auth ? { authorization: auth } : {} });
}

describe("org-retention cron", () => {
  const orig = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    runMock.mockReset().mockResolvedValue({ ...OK });
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = orig;
  });

  it("module: force-dynamic, 300 s, POST === GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
    expect(POST).toBe(GET);
  });

  it("401 without / with the wrong bearer; the sweep never runs", async () => {
    expect((await GET(req("", null))).status).toBe(401);
    expect((await GET(req("", "Bearer nope"))).status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("dry-run + limit are forwarded; the summary comes back with duration_ms", async () => {
    runMock.mockResolvedValueOnce({ ...OK, dry_run: true, orgs: [{ org_id: "org-1", deleted: { cohort_snapshots: 2 } }] });
    const res = await GET(req("?dry=1&limit=50"));
    expect(res.status).toBe(200);
    expect(runMock).toHaveBeenCalledWith({ dryRun: true, limit: 50 });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dry_run: true });
    expect(typeof body.duration_ms).toBe("number");
    await GET(req());
    expect(runMock).toHaveBeenLastCalledWith({ dryRun: false, limit: undefined });
  });

  it("503 before 0428 / without a DB; 500 on any other failure", async () => {
    runMock.mockResolvedValueOnce({ ...OK, ok: false, error: "org_settings is missing — apply migration 0428" });
    expect((await GET(req())).status).toBe(503);
    runMock.mockResolvedValueOnce({ ...OK, ok: false, error: "supabase_unavailable" });
    expect((await GET(req())).status).toBe(503);
    runMock.mockResolvedValueOnce({ ...OK, ok: false, error: "boom" });
    expect((await GET(req())).status).toBe(500);
  });
});
