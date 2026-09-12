// S23-B — /api/cron/ga4-event-audit: bearer gate, ?dry=1 skips the write,
// findings (missing / blocked) are 200, transport errors are 500, POST is GET.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ga4EventAuditReport } from "@/lib/analytics/ga4-event-audit";

const mocks = vi.hoisted(() => ({
  run: vi.fn<(opts: { dry?: boolean }) => Promise<Ga4EventAuditReport>>(),
  persist: vi.fn<(r: Ga4EventAuditReport) => Promise<boolean>>(),
}));
vi.mock("@/lib/analytics/ga4-event-audit", () => ({
  runGa4EventAudit: (opts: { dry?: boolean }) => mocks.run(opts),
  persistGa4EventAudit: (r: Ga4EventAuditReport) => mocks.persist(r),
}));

import { GET, POST } from "./route";

const SECRET = "ga4-audit-test-secret";

function report(overrides: Partial<Ga4EventAuditReport> = {}): Ga4EventAuditReport {
  return {
    ts: "2026-09-14T04:30:00.000Z",
    ok: true,
    status: "ok",
    property: "properties/1",
    range: { start: "2026-09-07", end: "2026-09-13", days: 7 },
    expected: ["hero_variant_shown"],
    seen: { hero_variant_shown: 5 },
    missing: [],
    total_event_names: 9,
    hero_variant: { parameter: "arm", registered: true, arms: { F1: 5 } },
    blocked: null,
    error: null,
    dry: false,
    duration_ms: 3,
    ...overrides,
  };
}

function req(query = "", auth: string | null = `Bearer ${SECRET}`, method: "GET" | "POST" = "GET"): Request {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new Request(`http://localhost/api/cron/ga4-event-audit${query}`, { method, headers });
}

let origSecret: string | undefined;
beforeEach(() => {
  origSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
  mocks.run.mockReset();
  mocks.persist.mockReset();
  mocks.run.mockResolvedValue(report());
  mocks.persist.mockResolvedValue(true);
});
afterEach(() => {
  if (origSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = origSecret;
});

describe("auth", () => {
  it("401 without / with a wrong bearer, and no audit run", async () => {
    expect((await GET(req("", null))).status).toBe(401);
    expect((await GET(req("", "Bearer nope"))).status).toBe(401);
    expect((await GET(req("", SECRET))).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("fails closed when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req())).status).toBe(401);
  });
});

describe("run", () => {
  it("runs the audit, persists the report and returns it with persisted:true", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ dry: false });
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.persisted).toBe(true);
  });

  it("?dry=1 runs but does not persist", async () => {
    mocks.run.mockResolvedValue(report({ dry: true }));
    const res = await GET(req("?dry=1"));
    expect(res.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ dry: true });
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(((await res.json()) as Record<string, unknown>).persisted).toBe(false);
  });

  it("missing and blocked are findings → 200 with the detail (cron-runner records the body)", async () => {
    mocks.run.mockResolvedValue(report({ ok: false, status: "missing", missing: ["funding_preview"] }));
    let res = await GET(req());
    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, unknown>).missing).toEqual(["funding_preview"]);

    mocks.run.mockResolvedValue(report({ ok: false, status: "blocked", blocked: { reason: "api_disabled", steps: ["1", "2"], message: "disabled" } }));
    res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { blocked: { steps: string[] } };
    expect(body.blocked.steps).toEqual(["1", "2"]);
    expect(mocks.persist).toHaveBeenCalledTimes(2);
  });

  it("a transport error is a 500 (still persisted so status shows unknown, not stale-ok)", async () => {
    mocks.run.mockResolvedValue(report({ ok: false, status: "unknown", error: "ECONNRESET" }));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(mocks.persist).toHaveBeenCalledTimes(1);
  });

  it("POST is the same handler", async () => {
    expect(POST).toBe(GET);
    expect((await POST(req("", `Bearer ${SECRET}`, "POST"))).status).toBe(200);
  });
});
