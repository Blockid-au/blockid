// Route tests for /api/investor/organisation (+ /accept) — seats (G13-W5-D3
// E4.5 / F4). 401 anonymous · 402 feature_locked for a non-evaluator on the
// team routes (accept has NO evaluator gate — accepting is what makes the
// seat) · GET shape · POST 201 / 402 seat_limit with the upgrade path / 409
// already_member / 403 not_owner / 400 · DELETE member or invite · accept
// 200 / 404 / 410 / 403; every mutation apiRoute-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const isEvaluatorMock = vi.fn(async () => true);
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: () => isEvaluatorMock() }));
const gateHitMock = vi.fn(async () => {});
vi.mock("@/lib/entitlements", () => ({ recordGateHit: (...a: unknown[]) => gateHitMock(...(a as [])) }));
const org = vi.hoisted(() => ({ team: vi.fn(), invite: vi.fn(), remove: vi.fn(), accept: vi.fn() }));
vi.mock("@/lib/investor/organisations", () => ({
  SEAT_ROLES: ["investor_viewer", "investor_analyst", "investment_manager", "investment_partner", "ic_member", "fund_admin", "accelerator_analyst", "institutional_admin"],
  getTeam: (u: unknown) => org.team(u),
  inviteMember: (u: unknown, i: unknown) => org.invite(u, i),
  removeSeat: (u: unknown, t: unknown) => org.remove(u, t),
  acceptInvite: (u: unknown, t: string) => org.accept(u, t),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { DELETE, GET, POST } from "./route";
import { POST as ACCEPT } from "./accept/route";

const USER = { id: "u-me", email: "me@fund.vc", displayName: "Mia", plan: "investor_advisor" };
const TEAM = {
  available: true,
  org: { id: "org-1", name: "Blue Fund", kind: "vc", is_personal: true, slug: "blue", owner_user_id: "u-me" },
  isOwner: true,
  members: [{ id: "m-1", userId: "u-me", role: "investment_partner", displayName: "Mia", email: "me@fund.vc", isOwner: true, joinedAt: "x" }],
  invites: [{ id: "i-1", email: "b@fund.vc", role: "ic_member", expiresAt: "y", createdAt: "x", token: "SECRET" }],
  seats: { limit: 3, used: 2, remaining: 1, unlimited: false },
};
const json = (body: unknown, method = "POST", path = "") => new Request(`http://localhost/api/investor/organisation${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  isEvaluatorMock.mockReset().mockResolvedValue(true);
  gateHitMock.mockClear();
  org.team.mockReset().mockResolvedValue(TEAM);
  org.invite.mockReset().mockResolvedValue({ ok: true, invite: { id: "i-2", email: "c@fund.vc", role: "investment_partner", expiresAt: "z", createdAt: "x", token: "SECRET" }, inviteUrl: "https://blockid.au/auth/login?next=x", emailSent: true, seats: { limit: 3, used: 3, remaining: 0, unlimited: false } });
  org.remove.mockReset().mockResolvedValue({ ok: true });
  org.accept.mockReset().mockResolvedValue({ ok: true, org: { id: "org-1", name: "Blue Fund" }, alreadyMember: false });
});

describe("gate", () => {
  it("401 anonymous; 402 feature_locked (gate hit recorded) for a non-evaluator on GET / POST / DELETE; accept is open to any signed-in user", async () => {
    expect(isAuditedHandler(POST)).toBe(true);
    expect(isAuditedHandler(DELETE)).toBe(true);
    expect(isAuditedHandler(ACCEPT)).toBe(true);
    getCurrentUserMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await ACCEPT(json({ token: "a".repeat(24) }, "POST", "/accept"))).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(USER);
    isEvaluatorMock.mockResolvedValue(false);
    const locked = await GET();
    expect(locked.status).toBe(402);
    expect((await locked.json())).toMatchObject({ error: "feature_locked", feature: "investor.dealflow", upgrade_url: "/pricing?segment=evaluator" });
    expect((await POST(json({ email: "x@y.z" }))).status).toBe(402);
    expect((await DELETE(json({ member_id: "m-1" }, "DELETE"))).status).toBe(402);
    expect(gateHitMock).toHaveBeenCalledTimes(3);
    const acc = await ACCEPT(json({ token: "a".repeat(24) }, "POST", "/accept"));
    expect(acc.status).toBe(200);
    expect(org.accept).toHaveBeenCalledWith({ id: "u-me", email: "me@fund.vc" }, "a".repeat(24));
  });
});

describe("GET", () => {
  it("returns org, members, invites (never the token) and seats {limit, used, remaining}; unlimited → null", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, available: true, is_owner: true, org: { id: "org-1", name: "Blue Fund", kind: "vc", is_personal: true }, seats: { limit: 3, used: 2, remaining: 1 } });
    expect(body.members[0]).toEqual({ id: "m-1", user_id: "u-me", role: "investment_partner", display_name: "Mia", email: "me@fund.vc", is_owner: true, joined_at: "x" });
    expect(body.invites[0]).toEqual({ id: "i-1", email: "b@fund.vc", role: "ic_member", expires_at: "y", created_at: "x" });
    expect(JSON.stringify(body)).not.toContain("SECRET");
    org.team.mockResolvedValue({ ...TEAM, seats: { limit: -1, used: 9, remaining: Number.MAX_SAFE_INTEGER, unlimited: true } });
    expect((await (await GET()).json()).seats).toEqual({ limit: null, used: 9, remaining: null });
  });
});

describe("POST invite", () => {
  it("201 with the invite (no token), invite_url, email_sent and seats; validation 400; lib errors map to 402 / 409 / 403 / 400 / 503", async () => {
    const res = await POST(json({ email: "c@fund.vc", role: "ic_member" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true, invite: { id: "i-2", email: "c@fund.vc", role: "investment_partner", expires_at: "z" }, invite_url: "https://blockid.au/auth/login?next=x", email_sent: true, seats: { limit: 3, used: 3, remaining: 0 } });
    expect(org.invite).toHaveBeenCalledWith({ id: "u-me", plan: "investor_advisor", email: "me@fund.vc", displayName: "Mia" }, { email: "c@fund.vc", role: "ic_member" });
    expect((await POST(json({ email: "c@fund.vc", role: "ceo" }))).status).toBe(400);
    expect((await POST(json({}))).status).toBe(400);

    org.invite.mockResolvedValue({ ok: false, error: "seat_limit", message: "Your plan includes 3 seats (3 in use).", limit: 3, used: 3, upgradeHint: "Program adds 5." });
    const limit = await POST(json({ email: "d@fund.vc" }));
    expect(limit.status).toBe(402);
    expect(await limit.json()).toEqual({ ok: false, error: "seat_limit", message: "Your plan includes 3 seats (3 in use).", limit: 3, used: 3, upgrade_hint: "Program adds 5.", upgrade_url: "/pricing?segment=evaluator" });
    for (const [error, status] of [["already_member", 409], ["not_owner", 403], ["invalid_email", 400], ["unavailable", 503], ["db_error", 500]] as const) {
      org.invite.mockResolvedValue({ ok: false, error, message: "x" });
      expect((await POST(json({ email: "d@fund.vc" }))).status, error).toBe(status);
    }
  });
});

describe("DELETE", () => {
  it("removes a member or revokes an invite; 400 on neither; lib errors 403 / 404", async () => {
    expect((await DELETE(json({ member_id: "m-2" }, "DELETE"))).status).toBe(200);
    expect(org.remove).toHaveBeenCalledWith({ id: "u-me", plan: "investor_advisor" }, { memberId: "m-2" });
    expect((await DELETE(json({ invite_id: "0f6e5c1a-1111-4111-8111-aaaaaaaaaaaa" }, "DELETE"))).status).toBe(200);
    expect(org.remove).toHaveBeenLastCalledWith({ id: "u-me", plan: "investor_advisor" }, { inviteId: "0f6e5c1a-1111-4111-8111-aaaaaaaaaaaa" });
    expect((await DELETE(json({}, "DELETE"))).status).toBe(400);
    org.remove.mockResolvedValue({ ok: false, error: "not_owner", message: "x" });
    expect((await DELETE(json({ member_id: "m-2" }, "DELETE"))).status).toBe(403);
    org.remove.mockResolvedValue({ ok: false, error: "not_found", message: "x" });
    expect((await DELETE(json({ member_id: "m-2" }, "DELETE"))).status).toBe(404);
  });
});

describe("POST accept", () => {
  it("200 with the org; 400 short token; 404 / 410 / 403 from the lib", async () => {
    const res = await ACCEPT(json({ token: "b".repeat(24) }, "POST", "/accept"));
    expect(await res.json()).toEqual({ ok: true, org: { id: "org-1", name: "Blue Fund" }, already_member: false });
    expect((await ACCEPT(json({ token: "short" }, "POST", "/accept"))).status).toBe(400);
    for (const [error, status] of [["not_found", 404], ["expired", 410], ["email_mismatch", 403], ["unavailable", 503]] as const) {
      org.accept.mockResolvedValue({ ok: false, error, message: "x" });
      expect((await ACCEPT(json({ token: "b".repeat(24) }, "POST", "/accept"))).status, error).toBe(status);
    }
  });
});
