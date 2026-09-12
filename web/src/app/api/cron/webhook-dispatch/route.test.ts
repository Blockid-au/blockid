// S20-B — /api/cron/webhook-dispatch: bearer auth (constant-time helper),
// ?dry=1 passthrough, limit clamp, 503 / 500 mapping, POST alias.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dispatchMock = vi.fn();
vi.mock("@/lib/webhooks/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/webhooks/dispatch")>();
  return { ...actual, dispatchDue: (o: unknown) => dispatchMock(o) };
});

import { GET, POST } from "./route";

const SECRET = "cron-secret-webhooks";
const ok = { ok: true, dry: false, claimed: 1, delivered: 1, failed: 0, dead: 0, skipped: 0, disabled_endpoints: [], results: [] };

function req(qs = "", auth: string | null = `Bearer ${SECRET}`) {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new Request(`http://x/api/cron/webhook-dispatch${qs}`, { headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  dispatchMock.mockReset().mockResolvedValue(ok);
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/webhook-dispatch", () => {
  it("401 without / with a wrong bearer, and when CRON_SECRET is unset", async () => {
    expect((await GET(req("", null))).status).toBe(401);
    expect((await GET(req("", "Bearer nope"))).status).toBe(401);
    expect((await GET(req("", `bearer ${SECRET}`))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req())).status).toBe(401);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("runs a live tick with the default batch (25) and echoes the summary", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(dispatchMock).toHaveBeenCalledWith({ limit: 25, dryRun: false });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, delivered: 1, limit: 25 });
    expect(typeof body.duration_ms).toBe("number");
  });

  it("?dry=1 previews; ?limit clamps to ≤ 50 (MAX_BATCH) and junk falls back to 25", async () => {
    dispatchMock.mockResolvedValue({ ...ok, dry: true, claimed: 0, delivered: 0, results: [{ id: "d", endpoint_id: "e", event: "ping", outcome: "dry" }] });
    const body = await (await GET(req("?dry=1&limit=7"))).json();
    expect(dispatchMock).toHaveBeenCalledWith({ limit: 7, dryRun: true });
    expect(body.dry).toBe(true);
    expect(body.results[0].outcome).toBe("dry");
    await GET(req("?limit=999"));
    expect(dispatchMock).toHaveBeenLastCalledWith({ limit: 50, dryRun: false });
    await GET(req("?limit=abc"));
    expect(dispatchMock).toHaveBeenLastCalledWith({ limit: 25, dryRun: false });
  });

  it("503 when Supabase is unavailable, 500 on a dispatcher error; POST is the same handler", async () => {
    dispatchMock.mockResolvedValue({ ...ok, ok: false, error: "supabase_unavailable" });
    expect((await GET(req())).status).toBe(503);
    dispatchMock.mockResolvedValue({ ...ok, ok: false, error: "boom" });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
  });
});
