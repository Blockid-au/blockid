// Colocated vitest for /api/cron/evidence-expiry (G21 P1-A): CRON_SECRET
// ladder (Bearer / x-cron-secret / lowercase bearer rejected / missing secret
// fails closed), GET and POST both run, `?dry=1` is forwarded, a job failure
// is a 500 (never a silent 200). The expiry logic itself is pinned in
// src/lib/evidence/expiry.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runEvidenceExpiry: vi.fn() }));
vi.mock("@/lib/evidence/expiry", () => ({ runEvidenceExpiry: (...a: unknown[]) => mocks.runEvidenceExpiry(...a) }));

import { GET, POST } from "./route";

const SECRET = "test_cron_secret_evidence";
const RESULT = { ok: true, dry: false, at: "2026-09-20T02:35:00.000Z", records_expired: 0, claims_regraded: 0, claim_status_changes: 0, phase3_expired: 0, projects: [], warnings: [] };

function req(path = "/api/cron/evidence-expiry", headers: Record<string, string> = {}, method = "GET") {
  return new Request(`http://localhost${path}`, { method, headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  mocks.runEvidenceExpiry.mockReset();
  mocks.runEvidenceExpiry.mockResolvedValue(RESULT);
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("auth", () => {
  it("401 without a credential, with the wrong one, with lowercase bearer, and when CRON_SECRET is unset (fail closed)", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("/api/cron/evidence-expiry", { authorization: "Bearer nope" }))).status).toBe(401);
    expect((await GET(req("/api/cron/evidence-expiry", { authorization: `bearer ${SECRET}` }))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req("/api/cron/evidence-expiry", { authorization: `Bearer ${SECRET}` }))).status).toBe(401);
    expect(mocks.runEvidenceExpiry).not.toHaveBeenCalled();
  });

  it("Bearer and x-cron-secret both work; GET and POST both run", async () => {
    expect((await GET(req("/api/cron/evidence-expiry", { authorization: `Bearer ${SECRET}` }))).status).toBe(200);
    expect((await POST(req("/api/cron/evidence-expiry", { "x-cron-secret": SECRET }, "POST"))).status).toBe(200);
    expect(mocks.runEvidenceExpiry).toHaveBeenCalledTimes(2);
    expect(mocks.runEvidenceExpiry).toHaveBeenCalledWith({ dry: false });
  });
});

describe("run", () => {
  it("?dry=1 forwards dry:true and returns the plan", async () => {
    mocks.runEvidenceExpiry.mockResolvedValue({ ...RESULT, dry: true, records_expired: 3, projects: ["p-1"] });
    const res = await GET(req("/api/cron/evidence-expiry?dry=1", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, dry: true, records_expired: 3, projects: ["p-1"] });
    expect(mocks.runEvidenceExpiry).toHaveBeenCalledWith({ dry: true });
  });

  it("a thrown job error is a 500 with the message", async () => {
    mocks.runEvidenceExpiry.mockRejectedValue(new Error("database unavailable"));
    const res = await POST(req("/api/cron/evidence-expiry", { authorization: `Bearer ${SECRET}` }, "POST"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "database unavailable" });
  });
});
