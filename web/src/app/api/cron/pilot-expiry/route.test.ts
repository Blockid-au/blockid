// Colocated vitest for /api/cron/pilot-expiry (G16-C): CRON_SECRET ladder
// (Bearer / x-cron-secret / lowercase bearer rejected / missing secret fails
// closed), GET and POST both run, `?dry=1` is forwarded, a service failure
// is a 500 (never a silent 200). The expiry logic itself is pinned in
// src/lib/pilots/service.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runPilotExpiry: vi.fn() }));
vi.mock("@/lib/pilots/service", () => ({ runPilotExpiry: (...a: unknown[]) => mocks.runPilotExpiry(...a) }));

import { GET, POST } from "./route";

const SECRET = "test_cron_secret_pilots";
const RESULT = { ok: true, dry: false, at: "2026-09-19T04:20:00.000Z", reminded: [], expired: [], warnings: [] };

function req(path = "/api/cron/pilot-expiry", headers: Record<string, string> = {}, method = "GET") {
  return new Request(`http://localhost${path}`, { method, headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  mocks.runPilotExpiry.mockReset();
  mocks.runPilotExpiry.mockResolvedValue(RESULT);
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("auth", () => {
  it("401 without a credential, with the wrong one, with lowercase bearer, and when CRON_SECRET is unset (fail closed)", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("/api/cron/pilot-expiry", { authorization: "Bearer nope" }))).status).toBe(401);
    expect((await GET(req("/api/cron/pilot-expiry", { authorization: `bearer ${SECRET}` }))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req("/api/cron/pilot-expiry", { authorization: `Bearer ${SECRET}` }))).status).toBe(401);
    expect(mocks.runPilotExpiry).not.toHaveBeenCalled();
  });

  it("Bearer and x-cron-secret both work; GET and POST both run", async () => {
    expect((await GET(req("/api/cron/pilot-expiry", { authorization: `Bearer ${SECRET}` }))).status).toBe(200);
    expect((await POST(req("/api/cron/pilot-expiry", { "x-cron-secret": SECRET }, "POST"))).status).toBe(200);
    expect(mocks.runPilotExpiry).toHaveBeenCalledTimes(2);
    expect(mocks.runPilotExpiry).toHaveBeenCalledWith({ dry: false });
  });
});

describe("run", () => {
  it("?dry=1 forwards dry:true and returns the plan", async () => {
    mocks.runPilotExpiry.mockResolvedValue({ ...RESULT, dry: true, reminded: [{ id: "p-1", program_name: "Soon", email: "a***@x.io", days_left: 2 }] });
    const res = await GET(req("/api/cron/pilot-expiry?dry=1", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, dry: true, reminded: [{ id: "p-1", days_left: 2 }] });
    expect(mocks.runPilotExpiry).toHaveBeenCalledWith({ dry: true });
  });

  it("a thrown service error is a 500 with the message", async () => {
    mocks.runPilotExpiry.mockRejectedValue(new Error("ledger unreadable"));
    const res = await POST(req("/api/cron/pilot-expiry", { authorization: `Bearer ${SECRET}` }, "POST"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "ledger unreadable" });
  });
});
