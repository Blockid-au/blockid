// Colocated vitest for the admin Verified review API (G35 Pricing v5 P4):
// mark-reviewed, claims and notes routes — admin gate (401 / 403), id + body
// validation, and the HTTP mapping of the lib results (lib suites pin the
// behaviour itself).

import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user, ADMIN_EMAIL: "admin@blockid.au" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));

const lib = vi.hoisted(() => ({ markReviewed: vi.fn(), recordClaimDecision: vi.fn(), saveReviewNotes: vi.fn() }));
vi.mock("@/lib/verified-review/mark-reviewed", () => ({ markReviewed: (...a: unknown[]) => lib.markReviewed(...a) }));
vi.mock("@/lib/verified-review/detail", async () => {
  const actual = await vi.importActual<typeof import("@/lib/verified-review/detail")>("@/lib/verified-review/detail");
  return { ...actual, recordClaimDecision: (...a: unknown[]) => lib.recordClaimDecision(...a), saveReviewNotes: (...a: unknown[]) => lib.saveReviewNotes(...a) };
});

import { POST as MARK } from "./route";
import { PATCH as CLAIM } from "../claims/route";
import { PATCH as NOTES } from "../route";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ctx = (orderId = ID) => ({ params: Promise.resolve({ orderId }) });
const req = (body?: unknown) => new Request("http://x/api", { method: body === undefined ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  auth.user = { id: "admin-1", email: "admin@blockid.au", role: "admin", displayName: "Long Do" };
  lib.markReviewed.mockReset().mockResolvedValue({ ok: true, orderId: ID, alreadyReviewed: false, repaired: false, reviewedAt: "2026-10-22T03:00:00Z", badgeLabel: "BlockID Reviewed", previousLevel: 2, verificationLevel: 3, evidenceConfidence: 41, emailSent: true, investorPackBytes: 10, slaMet: true, warnings: [] });
  lib.recordClaimDecision.mockReset().mockResolvedValue({ ok: true, reviewId: "rv", evidence: null, item: { ref: "ev:x", kind: "report", decision: "accept" } });
  lib.saveReviewNotes.mockReset().mockResolvedValue({ ok: true, reviewId: "rv", notes: "n" });
});

describe("POST …/mark-reviewed", () => {
  it("401 anonymous, 403 non-admin, nothing called", async () => {
    auth.user = null;
    expect((await MARK(req(), ctx())).status).toBe(401);
    auth.user = { id: "u", email: "founder@x.co", role: "user" };
    expect((await MARK(req(), ctx())).status).toBe(403);
    expect(lib.markReviewed).not.toHaveBeenCalled();
  });

  it("400 on a malformed id; 200 passes the reviewer as admin", async () => {
    expect((await MARK(req(), ctx("nope"))).status).toBe(400);
    const res = await MARK(req(), ctx());
    expect(res.status).toBe(200);
    expect(lib.markReviewed).toHaveBeenCalledWith(expect.anything(), { orderId: ID, reviewer: { id: "admin-1", displayName: "Long Do", isAdmin: true } });
    expect(await res.json()).toMatchObject({ ok: true, verificationLevel: 3 });
  });

  it("maps refusals: refunded / not_in_review / not_verified → 409, not_found → 404, migration_pending → 503", async () => {
    for (const [error, status] of [["refunded", 409], ["not_in_review", 409], ["not_verified", 409], ["not_found", 404], ["migration_pending", 503], ["db_error", 500]] as const) {
      lib.markReviewed.mockResolvedValueOnce({ ok: false, error });
      const res = await MARK(req(), ctx());
      expect(res.status, error).toBe(status);
      expect(await res.json()).toEqual({ ok: false, reason: error });
    }
  });
});

describe("PATCH …/claims", () => {
  it("gate + ref validation + mapping", async () => {
    auth.user = { id: "u", email: "founder@x.co", role: "user" };
    expect((await CLAIM(req({ ref: "ev:x", decision: "accept" }), ctx())).status).toBe(403);
    auth.user = { id: "admin-1", email: "admin@blockid.au", role: "admin" };
    expect((await CLAIM(req({ ref: "drop table", decision: "accept" }), ctx())).status).toBe(400);
    expect((await CLAIM(req({ ref: "ev:x", decision: "accept" }), ctx())).status).toBe(200);
    expect(lib.recordClaimDecision).toHaveBeenCalledWith(expect.anything(), { orderId: ID, ref: "ev:x", decision: "accept", note: undefined, reviewerId: "admin-1" });
    lib.recordClaimDecision.mockResolvedValueOnce({ ok: false, error: "note_required" });
    expect((await CLAIM(req({ ref: "ev:x", decision: "reject" }), ctx())).status).toBe(400);
    lib.recordClaimDecision.mockResolvedValueOnce({ ok: false, error: "refunded" });
    expect((await CLAIM(req({ ref: "ev:x", decision: "accept" }), ctx())).status).toBe(409);
  });
});

describe("PATCH …/[orderId] (notes)", () => {
  it("requires a notes key; admin only", async () => {
    expect((await NOTES(req({}), ctx())).status).toBe(400);
    expect((await NOTES(req({ notes: "ABR checked" }), ctx())).status).toBe(200);
    auth.user = null;
    expect((await NOTES(req({ notes: "x" }), ctx())).status).toBe(401);
  });
});
