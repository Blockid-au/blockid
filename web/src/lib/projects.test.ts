import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ getSupabaseAdmin: () => null }));

const getPlanCachedMock = vi.fn();
vi.mock("./plans-db", () => ({
  getPlanCached: (id: string) => getPlanCachedMock(id),
}));

import { getProjectLimit } from "./projects";

const UNLIMITED = Number.MAX_SAFE_INTEGER;

describe("getProjectLimit — plans.usage_limits.profiles lookup", () => {
  beforeEach(() => {
    getPlanCachedMock.mockReset();
  });

  it("reads profiles from DB row for v2 plan id", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_growth", usage_limits: { profiles: 3 } });
    expect(await getProjectLimit("founder_growth")).toBe(3);
    expect(getPlanCachedMock).toHaveBeenCalledWith("founder_growth");
  });

  it("maps legacy plan id via LEGACY_PLAN_MAP before lookup", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_growth", usage_limits: { profiles: 3 } });
    expect(await getProjectLimit("growth")).toBe(3);
    expect(getPlanCachedMock).toHaveBeenCalledWith("founder_growth");
  });

  it("treats profiles=-1 as unlimited", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_enterprise", usage_limits: { profiles: -1 } });
    expect(await getProjectLimit("founder_enterprise")).toBe(UNLIMITED);
  });

  it("falls back to static map when plan row is missing", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit("founder_scale")).toBe(10);
  });

  it("falls back to static map when plan row lacks usage_limits.profiles", async () => {
    getPlanCachedMock.mockResolvedValue({ id: "founder_starter", usage_limits: {} });
    expect(await getProjectLimit("founder_starter")).toBe(1);
  });

  it("falls back to static map when getPlanCached throws", async () => {
    getPlanCachedMock.mockRejectedValue(new Error("DB down"));
    expect(await getProjectLimit("founder_growth")).toBe(3);
  });

  it("defaults to founder_free (limit 1) for null/undefined plan", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit(null)).toBe(1);
    expect(await getProjectLimit(undefined)).toBe(1);
  });

  it("legacy 'free' and 'founding50' resolve to 1 via fallback", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit("free")).toBe(1);
    expect(await getProjectLimit("founding50")).toBe(1);
  });

  it("unknown plan id defaults to 1", async () => {
    getPlanCachedMock.mockResolvedValue(null);
    expect(await getProjectLimit("mystery_tier")).toBe(1);
  });
});
