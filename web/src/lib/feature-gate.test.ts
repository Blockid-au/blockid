import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("./auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const requireFeatureMock = vi.fn();
vi.mock("./entitlements", () => {
  class MockEntitlementError extends Error {
    readonly feature: string;
    readonly userId: string | null;
    readonly reason: "not_authenticated" | "feature_locked";
    constructor(feature: string, userId: string | null) {
      super(`lacks ${feature}`);
      this.feature = feature;
      this.userId = userId;
      this.reason = userId ? "feature_locked" : "not_authenticated";
      this.name = "EntitlementError";
    }
  }
  return {
    requireFeature: (...args: unknown[]) => requireFeatureMock(...args),
    EntitlementError: MockEntitlementError,
  };
});
import { EntitlementError as MockEntitlementError } from "./entitlements";

const maybeSingleMock = vi.fn();
const supabaseMock = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: () => maybeSingleMock() }),
    }),
  }),
};
const getSupabaseAdminMock = vi.fn();
vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { gateRequireFeature } from "./feature-gate";

describe("gateRequireFeature", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    requireFeatureMock.mockReset();
    getSupabaseAdminMock.mockReset();
    maybeSingleMock.mockReset();
  });

  it("returns 401 response when no user is authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await gateRequireFeature("share_management");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.response.status).toBe(401);
    const body = await res.response.json();
    expect(body).toEqual({ ok: false, error: "Authentication required" });
    expect(requireFeatureMock).not.toHaveBeenCalled();
  });

  it("returns 402 with feature key when EntitlementError fires", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    maybeSingleMock.mockResolvedValue({ data: { segment: "founder" } });
    requireFeatureMock.mockImplementation(() => {
      throw new MockEntitlementError("share_management", "u1");
    });
    const res = await gateRequireFeature("share_management");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.response.status).toBe(402);
    const body = await res.response.json();
    expect(body).toEqual({
      ok: false,
      error: "feature_locked",
      feature: "share_management",
      reason: "feature_locked",
    });
  });

  it("returns success with user + uwp when feature is granted", async () => {
    const user = { id: "u1", plan: "founder_growth", email: "a@b.c" };
    getCurrentUserMock.mockResolvedValue(user);
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    maybeSingleMock.mockResolvedValue({ data: { segment: "founder" } });
    requireFeatureMock.mockResolvedValue(undefined);
    const res = await gateRequireFeature("share_management");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.user).toBe(user);
    expect(res.uwp).toEqual({
      id: "u1",
      plan: "founder_growth",
      segment: "founder",
    });
    expect(requireFeatureMock).toHaveBeenCalledWith(res.uwp, "share_management");
  });

  it("defaults plan to 'free' when app_users.plan is null", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: null });
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    maybeSingleMock.mockResolvedValue({ data: { segment: "founder" } });
    requireFeatureMock.mockResolvedValue(undefined);
    const res = await gateRequireFeature("svi.run");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.uwp.plan).toBe("free");
  });

  it("falls back to segment='founder' when supabase returns nothing", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "founder_growth" });
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    maybeSingleMock.mockResolvedValue({ data: null });
    requireFeatureMock.mockResolvedValue(undefined);
    const res = await gateRequireFeature("share_management");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.uwp.segment).toBe("founder");
  });

  it("falls back to segment='founder' when supabase is unconfigured", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "founder_growth" });
    getSupabaseAdminMock.mockReturnValue(null);
    requireFeatureMock.mockResolvedValue(undefined);
    const res = await gateRequireFeature("share_management");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.uwp.segment).toBe("founder");
  });

  it("rethrows non-Entitlement errors so unexpected failures still surface", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "founder_growth" });
    getSupabaseAdminMock.mockReturnValue(supabaseMock);
    maybeSingleMock.mockResolvedValue({ data: { segment: "founder" } });
    requireFeatureMock.mockImplementation(() => {
      throw new TypeError("boom");
    });
    await expect(gateRequireFeature("share_management")).rejects.toThrow(
      "boom",
    );
  });
});
