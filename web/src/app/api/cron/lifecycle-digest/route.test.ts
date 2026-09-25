// G34-BT4 EM19 — /api/cron/lifecycle-digest runs only the monthly digest
// flow (cron-runner.sh posts to /api/cron/<name> without a query string).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runMock } = vi.hoisted(() => ({ runMock: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/lifecycle/scan", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lifecycle/scan")>("@/lib/lifecycle/scan");
  return { ...actual, runLifecycleScan: (...a: unknown[]) => runMock(...a) };
});

import * as routeModule from "./route";
import { GET, POST } from "./route";

const SECRET = "cron-secret-digest";

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  process.env.LIFECYCLE_EMAIL = "live";
  runMock.mockReset();
  runMock.mockResolvedValue([{ flow: "digest", candidates: 2, queued: ["monthly_digest:a@example.com"], skipped: {} }]);
});

describe("/api/cron/lifecycle-digest", () => {
  it("is force-dynamic with a 300 s budget", () => {
    expect((routeModule as { dynamic?: string }).dynamic).toBe("force-dynamic");
    expect((routeModule as { maxDuration?: number }).maxDuration).toBe(300);
  });

  it("POST runs the digest flow only; 401 without the secret", async () => {
    const ok = await POST(new Request("http://x/api/cron/lifecycle-digest", { method: "POST", headers: { authorization: `Bearer ${SECRET}` } }));
    expect(ok.status).toBe(200);
    expect(runMock.mock.calls[0][1]).toEqual(["digest"]);
    expect((await POST(new Request("http://x/api/cron/lifecycle-digest", { method: "POST" }))).status).toBe(401);
  });

  it("GET ?dry=1 lists would-be recipients and passes dry through", async () => {
    const body = await (await GET(new Request("http://x/api/cron/lifecycle-digest?dry=1", { headers: { authorization: `Bearer ${SECRET}` } }))).json();
    expect((runMock.mock.calls[0][0] as { dry: boolean }).dry).toBe(true);
    expect(body.flows[0].wouldQueue).toEqual(["monthly_digest:a@example.com"]);
  });
});
