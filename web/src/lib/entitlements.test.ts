import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ getSupabaseAdmin: () => null }));

const getPlanCachedMock = vi.fn();
vi.mock("./plans-db", () => ({
  getPlanCached: (id: string) => getPlanCachedMock(id),
}));

import { getEntitlements, can } from "./entitlements";

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
