import { describe, expect, it, vi } from "vitest";
import { CLIENT_EVENT_INGEST_PATH, emitClientEvent } from "./client-emit";

describe("emitClientEvent (G16-B)", () => {
  it("POSTs { name, params } to /api/analytics/event with keepalive and same-origin cookies, dropping null params", async () => {
    const fetch = vi.fn(async () => ({ ok: true }));
    const dataLayer: unknown[] = [];
    await emitClientEvent("paywall_view", { surface: "tbr_free_cut", sku: "sku_trust_report_5aud", amount_cents: 300, project_id: null }, { fetch, dataLayer });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CLIENT_EVENT_INGEST_PATH);
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body as string)).toEqual({ name: "paywall_view", params: { surface: "tbr_free_cut", sku: "sku_trust_report_5aud", amount_cents: 300 } });
    expect(dataLayer).toEqual([{ event: "paywall_view", surface: "tbr_free_cut", sku: "sku_trust_report_5aud", amount_cents: 300 }]);
  });

  it("keeps project_id when present", async () => {
    const fetch = vi.fn(async () => ({ ok: true }));
    await emitClientEvent("checkout", { sku: "sku_trust_report_5aud", amount_cents: 300, project_id: "p-1" }, { fetch, dataLayer: null });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).params.project_id).toBe("p-1");
  });

  it("swallows transport failures and a missing fetch", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(emitClientEvent("paywall_view", { surface: "x", sku: "s", amount_cents: 1 }, { fetch, dataLayer: null })).resolves.toBeUndefined();
    await expect(emitClientEvent("paywall_view", { surface: "x", sku: "s", amount_cents: 1 }, { fetch: undefined, dataLayer: null })).resolves.toBeUndefined();
  });
});
