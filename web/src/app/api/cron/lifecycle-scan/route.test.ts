// G34-BT4 — /api/cron/lifecycle-scan: auth, kill switch, ?flows= parsing,
// ?dry=1 passed through and recipient lists shown only on a dry run.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runMock, dbState } = vi.hoisted(() => ({ runMock: vi.fn(), dbState: { db: {} as unknown } }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => dbState.db }));
vi.mock("@/lib/lifecycle/scan", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lifecycle/scan")>("@/lib/lifecycle/scan");
  return { ...actual, runLifecycleScan: (...a: unknown[]) => runMock(...a) };
});

import * as routeModule from "./route";
import { GET, POST } from "./route";
import { POST as DIGEST_POST } from "../lifecycle-digest/route";

const SECRET = "cron-secret-lifecycle";
const auth = { authorization: `Bearer ${SECRET}` };
const req = (qs = "", headers: Record<string, string> = auth) => new Request(`http://x/api/cron/lifecycle-scan${qs}`, { method: "POST", headers });

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  process.env.LIFECYCLE_EMAIL = "live";
  dbState.db = {};
  runMock.mockReset();
  runMock.mockImplementation(async (_ctx: unknown, flows: string[]) =>
    flows.map((flow) => ({ flow, candidates: 1, queued: [`x:${flow}@example.com`], skipped: { no_consent: 2 }, ...(flow === "sunset" ? { sunsetOff: ["s@example.com"] } : {}) })),
  );
});

describe("/api/cron/lifecycle-scan", () => {
  it("is force-dynamic", () => {
    expect((routeModule as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });

  it("401 without the cron secret; nothing runs", async () => {
    expect((await POST(req("", {}))).status).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("kill switch answers disabled", async () => {
    process.env.LIFECYCLE_EMAIL = "off";
    expect(await (await POST(req())).json()).toEqual({ ok: true, disabled: true });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("default run = the daily five flows, not dry, counts only (no recipient lists)", async () => {
    const body = await (await POST(req())).json();
    const [ctx, flows] = runMock.mock.calls[0] as [{ dry: boolean }, string[]];
    expect(flows).toEqual(["evidence", "intake", "rerun", "quota", "sunset"]);
    expect(ctx.dry).toBe(false);
    expect(body.dryRun).toBe(false);
    expect(body.flows[0]).toEqual({ flow: "evidence", candidates: 1, queued: 1, skipped: { no_consent: 2 } });
    expect(body.flows[4].sunsetOff).toBe(1);
    expect(JSON.stringify(body)).not.toContain("@example.com");
  });

  it("/api/cron/lifecycle-digest runs only the monthly digest (cron-runner posts without a query string)", async () => {
    const res = await DIGEST_POST(new Request("http://x/api/cron/lifecycle-digest", { method: "POST", headers: auth }));
    expect(res.status).toBe(200);
    expect(runMock.mock.calls[0][1]).toEqual(["digest"]);
    expect((await DIGEST_POST(new Request("http://x/api/cron/lifecycle-digest", { method: "POST" }))).status).toBe(401);
  });

  it("?dry=1&flows=digest runs only the digest and lists would-be recipients", async () => {
    const body = await (await GET(new Request("http://x/api/cron/lifecycle-scan?dry=1&flows=digest", { headers: auth }))).json();
    const [ctx, flows] = runMock.mock.calls[0] as [{ dry: boolean }, string[]];
    expect(flows).toEqual(["digest"]);
    expect(ctx.dry).toBe(true);
    expect(body.flows[0].wouldQueue).toEqual(["x:digest@example.com"]);
  });

  it("rollout switch unset → every scheduled run is dry; counts only, masked samples to the server log", async () => {
    delete process.env.LIFECYCLE_EMAIL;
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const body = await (await POST(req())).json();
    expect((runMock.mock.calls[0][0] as { dry: boolean }).dry).toBe(true);
    expect(body).toMatchObject({ mode: "dry", dryRun: true });
    expect(JSON.stringify(body)).not.toContain("@example.com");
    const logged = info.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("x:e******@example.com");
    expect(logged).not.toContain("evidence@example.com");
    info.mockRestore();
  });

  it("400 on an unknown flow list; 503 without a database", async () => {
    expect((await POST(req("?flows=bogus"))).status).toBe(400);
    dbState.db = null;
    expect((await POST(req())).status).toBe(503);
  });

  it("ok:false when a flow reports an error", async () => {
    runMock.mockResolvedValueOnce([{ flow: "evidence", candidates: 0, queued: [], skipped: {}, error: "svi_analyses unavailable" }]);
    const body = await (await POST(req("?flows=evidence"))).json();
    expect(body.ok).toBe(false);
    expect(body.flows[0].error).toBe("svi_analyses unavailable");
  });
});
