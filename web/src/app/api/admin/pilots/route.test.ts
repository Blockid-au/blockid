// Colocated vitest for GET + POST /api/admin/pilots and DELETE
// /api/admin/pilots/[id] (G16-C). The service is mocked at its boundary so
// this file pins the HTTP contract: auth ladder (401 anon / 403 non-admin),
// 400 bad body, 404 unknown evaluator, 409 cap, idempotent 200 vs 201,
// plan set + previous_plan in the returned row, the Stripe-subscriber guard
// surfaced as plan_reverted:false, DELETE reason parsing. The lifecycle
// itself is covered in src/lib/pilots/service.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  startPilot: vi.fn(),
  endPilot: vi.fn(),
  listPilots: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
  ADMIN_EMAIL: "admin@blockid.au",
}));
vi.mock("@/lib/pilots/service", () => ({
  startPilot: (...a: unknown[]) => mocks.startPilot(...a),
  endPilot: (...a: unknown[]) => mocks.endPilot(...a),
  listPilots: (...a: unknown[]) => mocks.listPilots(...a),
}));

import { GET, POST } from "./route";
import { DELETE } from "./[id]/route";

const ADMIN = { id: "admin-1", email: "admin@blockid.au", role: "admin", plan: null };
const FOUNDER = { id: "u-9", email: "founder@x.io", role: "user", plan: "free" };

const PILOT = {
  id: "p-1",
  user_id: "u-1",
  email: "eval@program.org",
  program_name: "Demo",
  tier: "investor_vc_small",
  previous_plan: "investor_angel",
  started_at: "2026-09-19T04:20:00.000Z",
  expires_at: "2026-10-19T04:20:00.000Z",
  credits_granted: 180,
  intake_id: "i-1",
  intake_slug: "demo-abcdefgh",
  status: "active",
  ended_at: null,
  ended_reason: null,
};

function post(body: unknown) {
  return new Request("http://localhost/api/admin/pilots", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
function del(id: string, body?: unknown) {
  return DELETE(new Request(`http://localhost/api/admin/pilots/${id}`, { method: "DELETE", ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPilots.mockResolvedValue({ pilots: [{ ...PILOT, days_left: 30, submissions: 0, reports_run: 0, assessments: 0, email_masked: "e***@program.org", intake_url: "https://blockid.au/apply/demo-abcdefgh" }], active: 1, cap: 5 });
});

describe("auth ladder", () => {
  it("401 anonymous on GET / POST / DELETE — the service is never called", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(post({ email: "a@b.co", program_name: "x" }))).status).toBe(401);
    expect((await del("p-1")).status).toBe(401);
    expect(mocks.startPilot).not.toHaveBeenCalled();
    expect(mocks.endPilot).not.toHaveBeenCalled();
    expect(mocks.listPilots).not.toHaveBeenCalled();
  });

  it("403 signed-in non-admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(FOUNDER);
    const res = await POST(post({ email: "a@b.co", program_name: "x" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "not_admin" });
    expect((await GET()).status).toBe(403);
    expect((await del("p-1")).status).toBe(403);
  });
});

describe("GET", () => {
  it("admin → the list with days_left / counts / masked e-mail / active / cap", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, active: 1, cap: 5 });
    expect(body.pilots[0]).toMatchObject({ id: "p-1", days_left: 30, email_masked: "e***@program.org", submissions: 0 });
  });
});

describe("POST", () => {
  beforeEach(() => mocks.getCurrentUser.mockResolvedValue(ADMIN));

  it("400 on a non-JSON body without calling the service", async () => {
    const res = await POST(post("not json"));
    expect(res.status).toBe(400);
    expect(mocks.startPilot).not.toHaveBeenCalled();
  });

  it("201 with the ledger row (tier set, previous_plan kept), intake_url and the actor forwarded", async () => {
    mocks.startPilot.mockResolvedValue({ ok: true, existing: false, pilot: PILOT, intake_url: "https://blockid.au/apply/demo-abcdefgh", warnings: [] });
    const res = await POST(post({ email: "Eval@Program.org", program_name: "Demo", days: 30 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, existing: false, intake_url: "https://blockid.au/apply/demo-abcdefgh", warnings: [] });
    expect(body.pilot).toMatchObject({ tier: "investor_vc_small", previous_plan: "investor_angel", status: "active" });
    expect(mocks.startPilot).toHaveBeenCalledWith({ email: "Eval@Program.org", program_name: "Demo", days: 30 }, { email: "admin@blockid.au", id: "admin-1" });
  });

  it("200 existing:true when the e-mail already has an active pilot (idempotent)", async () => {
    mocks.startPilot.mockResolvedValue({ ok: true, existing: true, pilot: PILOT, intake_url: null, warnings: [] });
    const res = await POST(post({ email: "eval@program.org", program_name: "Other" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, existing: true, pilot: { id: "p-1" } });
  });

  it("404 unknown evaluator, 409 cap (with active count), 400 invalid, 503 no db — status + error passed through", async () => {
    mocks.startPilot.mockResolvedValueOnce({ ok: false, status: 404, error: "user_not_found", message: "No BlockID account" });
    let res = await POST(post({ email: "ghost@x.io", program_name: "x" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "user_not_found", message: "No BlockID account" });

    mocks.startPilot.mockResolvedValueOnce({ ok: false, status: 409, error: "cap_reached", message: "5 of 5", active: 5 });
    res = await POST(post({ email: "a@x.io", program_name: "x" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "cap_reached", message: "5 of 5", active: 5 });

    mocks.startPilot.mockResolvedValueOnce({ ok: false, status: 400, error: "invalid_input", message: "days" });
    expect((await POST(post({ email: "a@x.io", program_name: "x", days: 0 }))).status).toBe(400);

    mocks.startPilot.mockResolvedValueOnce({ ok: false, status: 503, error: "db_unavailable", message: "no db" });
    expect((await POST(post({ email: "a@x.io", program_name: "x" }))).status).toBe(503);
  });
});

describe("DELETE /api/admin/pilots/[id]", () => {
  beforeEach(() => mocks.getCurrentUser.mockResolvedValue(ADMIN));

  it("ends early with the default reason; the admin actor + note are forwarded", async () => {
    mocks.endPilot.mockResolvedValue({ ok: true, pilot: { ...PILOT, status: "ended", ended_reason: "ended_early" }, plan_reverted: true, warnings: [] });
    const res = await del("p-1", { note: "throw-away" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, plan_reverted: true, pilot: { status: "ended", ended_reason: "ended_early" } });
    expect(mocks.endPilot).toHaveBeenCalledWith("p-1", "ended_early", { email: "admin@blockid.au", id: "admin-1", kind: "admin" }, {}, "throw-away");
  });

  it("accepts a known reason, falls back to ended_early for an unknown one; no body is fine", async () => {
    mocks.endPilot.mockResolvedValue({ ok: true, pilot: PILOT, plan_reverted: false, warnings: [] });
    await del("p-1", { reason: "converted" });
    expect(mocks.endPilot.mock.calls[0][1]).toBe("converted");
    await del("p-1", { reason: "expired" }); // the cron's reason is not accepted from an admin
    expect(mocks.endPilot.mock.calls[1][1]).toBe("ended_early");
    await del("p-1");
    expect(mocks.endPilot.mock.calls[2][1]).toBe("ended_early");
    expect(mocks.endPilot.mock.calls[2][4]).toBeNull();
  });

  it("Stripe-subscriber guard surfaces as plan_reverted:false; 404 / 409 pass through", async () => {
    mocks.endPilot.mockResolvedValueOnce({ ok: true, pilot: { ...PILOT, status: "ended", plan_reverted: false }, plan_reverted: false, warnings: [] });
    expect(await (await del("p-1")).json()).toMatchObject({ ok: true, plan_reverted: false });
    mocks.endPilot.mockResolvedValueOnce({ ok: false, status: 404, error: "not_found", message: "nope" });
    expect((await del("zzz")).status).toBe(404);
    mocks.endPilot.mockResolvedValueOnce({ ok: false, status: 409, error: "not_active", message: "already ended" });
    expect((await del("p-1")).status).toBe(409);
  });
});
