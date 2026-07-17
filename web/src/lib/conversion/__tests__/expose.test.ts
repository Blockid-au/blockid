import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { exposeExperiment } from "@/lib/conversion/expose";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Reset the fetch stub per test so cross-test bleed is impossible.
  (globalThis as unknown as { fetch: typeof fetch }).fetch = vi.fn() as unknown as typeof fetch;
});

afterEach(() => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("exposeExperiment — happy path", () => {
  it("returns the variant string when the endpoint responds 200 with a variant", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        experiment_id: "pricing_anchor_order",
        variant: "anchor_scale",
        active: true,
      }),
    } as unknown as Response);

    const variant = await exposeExperiment("pricing_anchor_order");
    expect(variant).toBe("anchor_scale");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/experiments/expose");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { experiment_id: string };
    expect(body.experiment_id).toBe("pricing_anchor_order");
  });
});

describe("exposeExperiment — network error", () => {
  it("returns null and does not throw when fetch rejects", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));

    await expect(exposeExperiment("day5_email_subject")).resolves.toBeNull();
  });

  it("returns null when the endpoint responds non-2xx", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: "boom" }),
    } as unknown as Response);

    await expect(exposeExperiment("day5_email_subject")).resolves.toBeNull();
  });
});
