import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ getSupabaseAdmin: () => null }));

const getPlanCachedMock = vi.fn();
vi.mock("./plans-db", () => ({
  getPlanCached: (id: string) => getPlanCachedMock(id),
}));

// The per-user grant layer is exercised in depth by its own colocated suite
// (entitlements/user-grants.test.ts). Here it is a seam, so these cases can
// pin the *union rule* — how the plan layer and the user layer combine.
const getUserGrantedFeaturesMock =
  vi.fn<(userId: string | null | undefined) => Promise<readonly string[]>>();
vi.mock("./entitlements/user-grants", () => ({
  getUserGrantedFeatures: (u: string | null | undefined) =>
    getUserGrantedFeaturesMock(u),
}));

import { getEntitlements, can } from "./entitlements";

beforeEach(() => {
  getUserGrantedFeaturesMock.mockReset().mockResolvedValue([]);
});

describe("LEGACY_FEATURE_FALLBACK — reseller_admin bundle", () => {
  beforeEach(() => {
    getPlanCachedMock.mockReset();
  });

  it("returns the reseller.* triad when the plans table has no reseller_admin row", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    const flags = await getEntitlements("reseller_admin");
    expect(flags).toEqual([
      "reseller.console",
      "reseller.create_startup",
      "reseller.grant_credits",
    ]);
  });

  it("prefers the DB row when the plans table has a reseller_admin entry", async () => {
    getPlanCachedMock.mockResolvedValue({
      id: "reseller_admin",
      feature_flags: ["reseller.console"],
    });
    const flags = await getEntitlements("reseller_admin");
    expect(flags).toEqual(["reseller.console"]);
  });

  it("falls back to the reseller bundle when plans-db throws", async () => {
    getPlanCachedMock.mockRejectedValue(new Error("db down"));
    const flags = await getEntitlements("reseller_admin");
    expect(flags).toContain("reseller.create_startup");
    expect(flags).toContain("reseller.grant_credits");
  });

  it("grants reseller.create_startup via can() for a reseller_admin plan user", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    const ok = await can(
      { id: "u1", plan: "reseller_admin", segment: "reseller" },
      "reseller.create_startup",
    );
    expect(ok).toBe(true);
  });

  it("does NOT grant founder-track features to a reseller_admin plan user", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    const ok = await can(
      { id: "u1", plan: "reseller_admin", segment: "reseller" },
      "cap_table.write",
    );
    expect(ok).toBe(false);
  });

  it("does NOT grant reseller.* to a founder_free user (isolation)", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    const ok = await can(
      { id: "u2", plan: "free", segment: "founder" },
      "reseller.grant_credits",
    );
    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Add-on union — the rule that makes the A$59 Equity add-on sellable.
// ---------------------------------------------------------------------------

describe("getEntitlements — plan layer unioned with the user layer", () => {
  beforeEach(() => {
    getPlanCachedMock.mockReset();
    getPlanCachedMock.mockResolvedValue({
      id: "founder_growth",
      feature_flags: ["cap_table.write", "data_room.access"],
    });
  });

  it("returns the plan bundle unchanged when no user id is supplied", async () => {
    getUserGrantedFeaturesMock.mockResolvedValue(["esop.manage"]);
    const flags = await getEntitlements("growth");
    expect(flags).toEqual(["cap_table.write", "data_room.access"]);
    // Without a user, the user layer is never even consulted — an anonymous
    // session cannot pick up somebody's add-on.
    expect(getUserGrantedFeaturesMock).not.toHaveBeenCalled();
  });

  it("returns the plan bundle unchanged when the user holds no grants", async () => {
    getUserGrantedFeaturesMock.mockResolvedValue([]);
    const flags = await getEntitlements("growth", "u1");
    expect(flags).toEqual(["cap_table.write", "data_room.access"]);
  });

  it("adds the user's granted features on top of the plan bundle", async () => {
    getUserGrantedFeaturesMock.mockResolvedValue(["esop.manage", "vesting.write"]);
    const flags = await getEntitlements("growth", "u1");
    expect(flags.slice().sort()).toEqual([
      "cap_table.write",
      "data_room.access",
      "esop.manage",
      "vesting.write",
    ]);
  });

  it("never removes a plan feature, even if the user layer is empty or odd", async () => {
    getUserGrantedFeaturesMock.mockResolvedValue([]);
    expect(await getEntitlements("growth", "u1")).toContain("cap_table.write");
    getUserGrantedFeaturesMock.mockResolvedValue(["cap_table.write"]);
    expect(await getEntitlements("growth", "u1")).toContain("data_room.access");
  });

  it("de-duplicates an overlap between the two layers", async () => {
    getUserGrantedFeaturesMock.mockResolvedValue(["cap_table.write"]);
    const flags = await getEntitlements("growth", "u1");
    expect(flags.filter((f) => f === "cap_table.write")).toHaveLength(1);
  });

  it("does not mutate the cached plan row when unioning", async () => {
    const row = { id: "founder_growth", feature_flags: ["cap_table.write"] };
    getPlanCachedMock.mockResolvedValue(row);
    getUserGrantedFeaturesMock.mockResolvedValue(["esop.manage"]);
    await getEntitlements("growth", "u1");
    expect(row.feature_flags).toEqual(["cap_table.write"]);
  });
});

describe("can() — add-on awareness at the gate", () => {
  const growth = { id: "u1", plan: "growth", segment: "founder" };

  beforeEach(() => {
    getPlanCachedMock.mockReset();
    getPlanCachedMock.mockResolvedValue({
      id: "founder_growth",
      feature_flags: ["cap_table.write", "data_room.access"],
    });
  });

  it("denies an add-on-only feature to a Growth subscriber without the add-on", async () => {
    getUserGrantedFeaturesMock.mockResolvedValue([]);
    expect(await can(growth, "esop.manage")).toBe(false);
  });

  it("allows it once the add-on grant exists for that user", async () => {
    getUserGrantedFeaturesMock.mockResolvedValue([
      "esop.manage",
      "vesting.read",
      "vesting.write",
      "blockchain.sync",
    ]);
    expect(await can(growth, "esop.manage")).toBe(true);
    expect(await can(growth, "vesting.write")).toBe(true);
    expect(await can(growth, "blockchain.sync")).toBe(true);
  });

  it("denies again the moment the grant is gone (cancellation)", async () => {
    getUserGrantedFeaturesMock.mockResolvedValue(["esop.manage"]);
    expect(await can(growth, "esop.manage")).toBe(true);
    getUserGrantedFeaturesMock.mockResolvedValue([]);
    expect(await can(growth, "esop.manage")).toBe(false);
  });

  it("fails closed: a user-layer lookup that resolves empty denies, and the plan still works", async () => {
    // getUserGrantedFeatures never throws — it returns [] on any failure.
    // That is the whole fail-closed contract, observed from the gate.
    getUserGrantedFeaturesMock.mockResolvedValue([]);
    expect(await can(growth, "esop.manage")).toBe(false);
    expect(await can(growth, "cap_table.write")).toBe(true);
  });

  it("passes the caller's own user id down — grants are never cross-user", async () => {
    getUserGrantedFeaturesMock.mockResolvedValue([]);
    await can({ id: "user-abc", plan: "growth", segment: "founder" }, "esop.manage");
    expect(getUserGrantedFeaturesMock).toHaveBeenCalledWith("user-abc");
  });

  it("still denies everything for an anonymous caller", async () => {
    getUserGrantedFeaturesMock.mockResolvedValue(["esop.manage"]);
    expect(await can(null, "esop.manage")).toBe(false);
  });
});
