// Unit tests for GET /api/referrals — P9-referrals-route-test.
//
// This is the plural sibling of /api/referral (singular, tested in
// route.test.ts alongside that route). The plural route is a thin
// auth-gated read-through: it looks up the current user and hands the
// user.id to getReferralStats(), which internally reads the modern
// `app_users.referral_credits_earned` + `referral_events` count and
// composes { code, url, totalReferred, creditsEarned }. The route does
// NOT re-shape or filter the payload — whatever getReferralStats returns
// lands on the wire under `stats`.
//
// Silent regressions this suite pins against:
//   - dropping the 401 gate and leaking every founder's referral code +
//     credits-earned counter to any anonymous caller;
//   - re-shaping the stats payload in the route (e.g. renaming
//     `totalReferred` → `total_referred`) which would break the referrals
//     dashboard client that consumes the raw `stats` object;
//   - passing the user's email into getReferralStats() instead of the id
//     (the lib keys on app_users.id — an email swap silently returns 0);
//   - dropping the `dynamic = "force-dynamic"` export and letting a per-user
//     read prerender into the shared static shell.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getReferralStatsMock = vi.fn<
  (userId: string) => Promise<{
    code: string;
    url: string;
    totalReferred: number;
    creditsEarned: number;
  }>
>();
vi.mock("@/lib/referrals", () => ({
  getReferralStats: (userId: string) => getReferralStatsMock(userId),
}));

import { GET, dynamic } from "./route";

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getReferralStatsMock.mockReset();

  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
  getReferralStatsMock.mockResolvedValue({
    code: "ABC12345",
    url: "https://blockid.au/?ref=ABC12345",
    totalReferred: 3,
    creditsEarned: 6,
  });
});

describe("/api/referrals — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user reads never prerender', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET — auth gate", () => {
  it("returns 401 { ok:false, error:'Authentication required' } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Authentication required",
    });
  });

  it("does NOT call getReferralStats on the anonymous path", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(getReferralStatsMock).not.toHaveBeenCalled();
  });
});

describe("GET — happy path", () => {
  it("returns 200 { ok:true, stats } with the payload from getReferralStats verbatim", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      stats: {
        code: "ABC12345",
        url: "https://blockid.au/?ref=ABC12345",
        totalReferred: 3,
        creditsEarned: 6,
      },
    });
  });

  it("passes the current user's id (not email) into getReferralStats", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "u-42",
      email: "someone@x.com",
    });
    await GET();
    expect(getReferralStatsMock).toHaveBeenCalledTimes(1);
    expect(getReferralStatsMock).toHaveBeenCalledWith("u-42");
  });

  it("does NOT re-shape the stats object — keys land on the wire verbatim (guards against snake_case regression)", async () => {
    getReferralStatsMock.mockResolvedValue({
      code: "ZZ",
      url: "https://blockid.au/?ref=ZZ",
      totalReferred: 9,
      creditsEarned: 18,
    });
    const body = await (await GET()).json();
    expect(Object.keys(body.stats).sort()).toEqual(
      ["code", "creditsEarned", "totalReferred", "url"].sort(),
    );
  });

  it("passes through a zero-referral fresh account without coercion", async () => {
    getReferralStatsMock.mockResolvedValue({
      code: "",
      url: "",
      totalReferred: 0,
      creditsEarned: 0,
    });
    const body = await (await GET()).json();
    expect(body).toEqual({
      ok: true,
      stats: {
        code: "",
        url: "",
        totalReferred: 0,
        creditsEarned: 0,
      },
    });
  });

  it("returns exactly the { ok, stats } envelope — no extra keys leaked", async () => {
    const body = await (await GET()).json();
    expect(Object.keys(body).sort()).toEqual(["ok", "stats"]);
  });

  it("calls getReferralStats exactly once per request (no wasted round-trip)", async () => {
    await GET();
    expect(getReferralStatsMock).toHaveBeenCalledTimes(1);
  });
});
