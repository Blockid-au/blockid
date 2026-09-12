// Colocated vitest for POST /api/admin/account/erase (S24-B).
// Pins: requireAdmin (401 no user / 403 not admin); reason required; target
// by uuid or email (invalid uuid 400, unknown 404); never self (400);
// eraseAccount called with actor "admin" + the admin's id; dry_run passes
// through; failures map to 500 / 404 / 503; POST is apiRoute-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; role: string },
  db: null as unknown,
  erase: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.db }));
vi.mock("@/lib/reseller/require-admin", () => {
  class AdminGateError extends Error {
    code: "no_user" | "not_admin";
    constructor(code: "no_user" | "not_admin") {
      super(code);
      this.code = code;
    }
  }
  return {
    AdminGateError,
    requireAdmin: (u: { role: string } | null) => {
      if (!u) throw new AdminGateError("no_user");
      if (u.role !== "admin") throw new AdminGateError("not_admin");
    },
  };
});
vi.mock("@/lib/privacy/erase-account", () => ({ eraseAccount: (id: string, o: unknown) => mocks.erase(id, o) }));

import { POST } from "./route";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";

function dbWith(emailToId: Record<string, string>) {
  return {
    from: () => ({
      select: () => ({
        eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: emailToId[v] ? { id: emailToId[v] } : null, error: null }) }),
      }),
    }),
  };
}

function post(body: unknown) {
  return new Request("http://localhost/api/admin/account/erase", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/admin/account/erase", () => {
  beforeEach(() => {
    mocks.user = { id: ADMIN, email: "admin@blockid.au", role: "admin" };
    mocks.db = dbWith({ "qa-founder-20260912@blockid.au": TARGET });
    mocks.erase.mockReset().mockResolvedValue({ ok: true, dryRun: false, userId: TARGET, alreadyErased: false, report: { totals: { delete: 3 } }, stripe: {}, storage: {}, audit_id: "9", duration_ms: 5 });
  });

  it("gates: 401 no user, 403 non-admin, 400 no reason / bad uuid / neither id nor email, 404 unknown email, 400 self", async () => {
    mocks.user = null;
    expect((await POST(post({ user_id: TARGET, reason: "x" }))).status).toBe(401);
    mocks.user = { id: ADMIN, email: "u@x.io", role: "user" };
    expect((await POST(post({ user_id: TARGET, reason: "x" }))).status).toBe(403);
    mocks.user = { id: ADMIN, email: "admin@blockid.au", role: "admin" };
    expect((await POST(post({ user_id: TARGET }))).status).toBe(400);
    expect((await POST(post({ user_id: "nope", reason: "x" }))).status).toBe(400);
    expect((await POST(post({ reason: "x" }))).status).toBe(400);
    expect((await POST(post({ email: "ghost@x.io", reason: "x" }))).status).toBe(404);
    const self = await POST(post({ user_id: ADMIN, reason: "x" }));
    expect(self.status).toBe(400);
    expect((await self.json()).reason).toBe("cannot_erase_self");
    expect(mocks.erase).not.toHaveBeenCalled();
  });

  it("erases by email with actor admin + admin id; dry_run passes through", async () => {
    const res = await POST(post({ email: "QA-Founder-20260912@blockid.au ", reason: "QA cleanup", dry_run: true }));
    expect(res.status).toBe(200);
    expect(mocks.erase).toHaveBeenCalledWith(TARGET, { dryRun: true, reason: "admin: QA cleanup", actor: "admin", actorUserId: ADMIN });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.audit_id).toBe("9");
  });

  it("erases by user_id (wet) and maps failures", async () => {
    const res = await POST(post({ user_id: TARGET, reason: "privacy request #42" }));
    expect(res.status).toBe(200);
    expect(mocks.erase).toHaveBeenCalledWith(TARGET, { dryRun: false, reason: "admin: privacy request #42", actor: "admin", actorUserId: ADMIN });
    mocks.erase.mockResolvedValueOnce({ ok: false, error: "stripe_failed", stripe: { errors: ["x"] } });
    expect((await POST(post({ user_id: TARGET, reason: "r" }))).status).toBe(500);
    mocks.erase.mockResolvedValueOnce({ ok: false, error: "not_found" });
    expect((await POST(post({ user_id: TARGET, reason: "r" }))).status).toBe(404);
    mocks.erase.mockResolvedValueOnce({ ok: false, error: "supabase_unavailable" });
    expect((await POST(post({ user_id: TARGET, reason: "r" }))).status).toBe(503);
  });

  it("503 without Supabase", async () => {
    mocks.db = null;
    expect((await POST(post({ user_id: TARGET, reason: "r" }))).status).toBe(503);
  });
});
