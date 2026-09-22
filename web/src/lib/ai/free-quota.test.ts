import { describe, expect, it, vi } from "vitest";
import { observeOpenRouterFreeQuota, reserveOpenRouterFreeRequest, blockOpenRouterFreeAccount } from "./free-quota";
const now = Date.parse("2026-09-22T12:00:00Z");
const observation = { accountId: "provider-account", checkedAt: new Date(now).toISOString(), utcDay: "2026-09-22", used: 10, limit: 50, remaining: 40 };
describe("free quota observer and reservation boundary", () => {
  it("returns request counters only, never key/label/credit usage", async () => {
    const read = vi.fn(async () => new Response(JSON.stringify({ data: { label: "PRIVATE-LABEL", usage_daily: 999, free_model_daily_requests: { used: 10, limit: 50, remaining: 40 } } }))) as unknown as typeof fetch;
    const result = await observeOpenRouterFreeQuota({ accountId: "provider-account", apiKey: "TEST-KEY", authorized: true }, { fetch: read, now: () => now });
    expect(result).toEqual({ status: "observed", observation }); expect(JSON.stringify(result)).not.toMatch(/TEST-KEY|PRIVATE-LABEL|999/);
  });
  it("does not infer free request quota from credit counters or paid status", async () => {
    const result = await observeOpenRouterFreeQuota({ accountId: "a", apiKey: "TEST", authorized: true }, { fetch: async () => new Response('{"data":{"is_free_tier":false,"usage_daily":0}}'), now: () => now });
    expect(result).toEqual({ status: "unavailable", reason: "free_request_counter_unknown" });
  });
  it("requires account-wide adoption, fresh counter and a unique operation", async () => {
    const evalFn = vi.fn();
    for (const bad of [{ allAccountCallersUseLedger: false, now }, { allAccountCallersUseLedger: true, now: now + 60000 }]) {
      expect((await reserveOpenRouterFreeRequest({ eval: evalFn }, observation, "op", bad)).status).toBe("denied");
    }
    expect(evalFn).not.toHaveBeenCalled();
  });
  it("fails closed on store failure and never grants dispatch by reservation alone", async () => {
    expect(await reserveOpenRouterFreeRequest({ eval: async () => { throw Error("offline"); } }, observation, "op", { allAccountCallersUseLedger: true, now })).toEqual({ status: "denied", reason: "quota_store_unavailable" });
    expect(await reserveOpenRouterFreeRequest({ eval: async () => ["reserved", "39", "19"] }, observation, "op", { allAccountCallersUseLedger: true, now })).toEqual({ status: "reserved", dailyRemaining: 39, minuteRemaining: 19, executionAllowed: false });
    expect(await blockOpenRouterFreeAccount({ eval: async () => { throw Error("offline"); } }, "a", 429)).toBe(false);
  });
});
