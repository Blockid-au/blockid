// G16-B — POST /api/entitlement/gate-hit: the <FeatureGate> beacon lands in
// recordGateHit() with the page path as `surface` (it 404'd before).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string; plan: string | null } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const recordGateHitMock = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock("@/lib/entitlements", () => ({ recordGateHit: (...args: unknown[]) => recordGateHitMock(...args) }));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("https://blockid.au/api/entitlement/gate-hit", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@example.com", plan: "free" });
  recordGateHitMock.mockResolvedValue();
});

describe("POST /api/entitlement/gate-hit", () => {
  it("401 anonymous — nothing recorded", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await post({ feature: "investor.dealflow" });
    expect(res.status).toBe(401);
    expect(recordGateHitMock).not.toHaveBeenCalled();
  });

  it("400 on bad JSON or a missing / malformed feature", async () => {
    expect((await post("{nope")).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ feature: "Bad Feature!" })).status).toBe(400);
    expect(recordGateHitMock).not.toHaveBeenCalled();
  });

  it("records the hit with the user's plan, 'menu' by default and the page path as surface → 204", async () => {
    const res = await post({ feature: "investor.dealflow", surface: "/workspace/investor/dealflow" });
    expect(res.status).toBe(204);
    expect(recordGateHitMock).toHaveBeenCalledWith({ id: "u-1", plan: "free", segment: "founder" }, "investor.dealflow", "menu", "/workspace/investor/dealflow");
  });

  it("accepts source 'action'; a recordGateHit failure is swallowed (still 204)", async () => {
    recordGateHitMock.mockRejectedValueOnce(new Error("db down"));
    const res = await post({ feature: "cap_table.write", source: "action" });
    expect(res.status).toBe(204);
    expect(recordGateHitMock).toHaveBeenCalledWith(expect.anything(), "cap_table.write", "action", null);
  });
});
