// HTTP contract for PATCH /api/outcomes/[id] (G21 P3-A): 401 anon, 404 bad
// id, 429 limit, 400 bad decision / long note, owner resolves through the
// service with an ownsProject that reads assertProjectAccess, admin flag
// from ADMIN_EMAIL / role, service errors surface with their status, audit
// action outcome.confirmed / outcome.rejected + FI event, 503 when 0427 is
// missing.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  assertProjectAccess: vi.fn(),
  resolveOutcome: vi.fn(),
  checkRateLimit: vi.fn(),
  auditAction: vi.fn(),
  auditNote: vi.fn(),
  emitOutcomeRecorded: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser(), ADMIN_EMAIL: "admin@blockid.au" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));
vi.mock("@/lib/projects", () => {
  class ProjectAccessError extends Error {
    constructor(msg: string, public code: "not_found" | "forbidden" | "service_unavailable") {
      super(msg);
    }
  }
  return { ProjectAccessError, assertProjectAccess: (...a: unknown[]) => mocks.assertProjectAccess(...a) };
});
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => mocks.checkRateLimit(...a) }));
vi.mock("@/lib/audit/context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit/context")>("@/lib/audit/context");
  return { ...actual, auditAction: (...a: unknown[]) => mocks.auditAction(...a), auditNote: (...a: unknown[]) => mocks.auditNote(...a) };
});
vi.mock("@/lib/analytics/fi-events", () => ({ emitOutcomeRecorded: (...a: unknown[]) => mocks.emitOutcomeRecorded(...a) }));
vi.mock("@/lib/outcomes/service", () => ({ resolveOutcome: (...a: unknown[]) => mocks.resolveOutcome(...a) }));
vi.mock("server-only", () => ({}));

import { PATCH } from "./route";
import { ProjectAccessError } from "@/lib/projects";

const OID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PID = "11111111-2222-4333-8444-555555555555";
const FOUNDER = { id: "u-1", email: "f@x.io", role: "user", plan: "founder_free" };
const ADMIN = { id: "a-1", email: "admin@blockid.au", role: "user", plan: "free" };
const ROW = { id: OID, project_id: PID, kind: "funding_raised", observed_at: "2026-08-15T09:30:00.000Z", value: {}, source: "founder", confidence: 60, recorded_by: "u-1", status: "confirmed", confirmed_by: "u-1", confirmed_at: "2026-09-20", note: null, created_at: "2026-09-20", updated_at: "2026-09-20" };

function patch(body: unknown, id = OID) {
  return PATCH(new Request(`http://localhost/api/outcomes/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(FOUNDER);
  mocks.assertProjectAccess.mockResolvedValue({ isOwner: true, role: "owner", ownerUserId: "u-1", project: { id: PID } });
  mocks.resolveOutcome.mockResolvedValue({ ok: true, row: ROW });
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetIn: 1000 });
});

describe("PATCH /api/outcomes/[id]", () => {
  it("401 anon · 404 bad id · 429 limit · 400 decision / note", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await patch({ decision: "confirm" })).status).toBe(401);
    expect((await patch({ decision: "confirm" }, "nope")).status).toBe(404);
    mocks.checkRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetIn: 5000 });
    expect((await patch({ decision: "confirm" })).status).toBe(429);
    expect((await patch({ decision: "maybe" })).status).toBe(400);
    expect((await patch({ decision: "reject", note: "x".repeat(2001) })).status).toBe(400);
    expect((await patch("{nope")).status).toBe(400);
    expect(mocks.resolveOutcome).not.toHaveBeenCalled();
  });

  it("owner confirms: actor isAdmin false, ownsProject reads assertProjectAccess (owner true / member false / stranger false); audit + FI event", async () => {
    const res = await patch({ decision: "confirm", note: " Verified. " });
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).not.toHaveProperty("recorded_by");
    const args = mocks.resolveOutcome.mock.calls[0]![1] as { id: string; decision: string; note: string | null; actor: { userId: string; isAdmin: boolean; ownsProject: (p: string) => Promise<boolean> } };
    expect(args).toMatchObject({ id: OID, decision: "confirm", note: "Verified." });
    expect(args.actor.isAdmin).toBe(false);
    expect(await args.actor.ownsProject(PID)).toBe(true);
    mocks.assertProjectAccess.mockResolvedValueOnce({ isOwner: false, role: "editor" });
    expect(await args.actor.ownsProject(PID)).toBe(false);
    mocks.assertProjectAccess.mockRejectedValueOnce(new ProjectAccessError("nf", "not_found"));
    expect(await args.actor.ownsProject(PID)).toBe(false);
    mocks.assertProjectAccess.mockRejectedValueOnce(new ProjectAccessError("down", "service_unavailable"));
    await expect(args.actor.ownsProject(PID)).rejects.toBeInstanceOf(ProjectAccessError);
    expect(mocks.auditAction).toHaveBeenCalledWith("outcome.confirmed");
    expect(mocks.auditNote).toHaveBeenCalledWith(OID, { project_id: PID, kind: "funding_raised", source: "founder", status: "confirmed", by_admin: false });
    expect(mocks.emitOutcomeRecorded).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "u-1", channel: "api", status: "confirmed" }));
  });

  it("admin (ADMIN_EMAIL or role admin) rejects with isAdmin true; audit outcome.rejected; channel admin_review", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(ADMIN);
    mocks.resolveOutcome.mockResolvedValueOnce({ ok: true, row: { ...ROW, status: "rejected", source: "connector" } });
    expect((await patch({ decision: "reject", note: "Not this company." })).status).toBe(200);
    expect((mocks.resolveOutcome.mock.calls[0]![1] as { actor: { isAdmin: boolean } }).actor.isAdmin).toBe(true);
    expect(mocks.auditAction).toHaveBeenCalledWith("outcome.rejected");
    expect(mocks.emitOutcomeRecorded).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: null, channel: "admin_review", status: "rejected" }));
    mocks.getCurrentUser.mockResolvedValueOnce({ ...FOUNDER, role: "admin" });
    await patch({ decision: "confirm" });
    expect((mocks.resolveOutcome.mock.calls[1]![1] as { actor: { isAdmin: boolean } }).actor.isAdmin).toBe(true);
  });

  it("service errors surface with their status (403 / 404 / 409); missing 0427 → 503; access outage → 503", async () => {
    mocks.resolveOutcome.mockResolvedValueOnce({ ok: false, error: "forbidden", message: "BlockID confirms these.", status: 403 });
    expect((await patch({ decision: "confirm" })).status).toBe(403);
    mocks.resolveOutcome.mockResolvedValueOnce({ ok: false, error: "not_found", message: "nope", status: 404 });
    expect((await patch({ decision: "confirm" })).status).toBe(404);
    mocks.resolveOutcome.mockResolvedValueOnce({ ok: false, error: "already_resolved", message: "raced", status: 409 });
    expect((await patch({ decision: "confirm" })).status).toBe(409);
    expect(mocks.auditAction).not.toHaveBeenCalled();
    mocks.resolveOutcome.mockRejectedValueOnce(new Error('relation "startup_outcomes" does not exist'));
    expect((await patch({ decision: "confirm" })).status).toBe(503);
    mocks.resolveOutcome.mockRejectedValueOnce(new ProjectAccessError("down", "service_unavailable"));
    expect((await patch({ decision: "confirm" })).status).toBe(503);
  });
});
