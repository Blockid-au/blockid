import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  lookupAbn,
  _resetAbrAdapterCache,
  AbnLookupResultSchema,
} from "./abr-adapter";

/**
 * Colocated tests for the ABR adapter (Phase 2 Batch F sub-F2).
 *
 * Uses a fetch mock (no MSW dep) so we can drive JSONP-wrapped responses
 * directly, cover both v202001 and v202108 payload shapes, and assert the
 * malformed-response → null contract without hitting the network.
 */

const FIXTURE_ACTIVE_V202001 = `abn_data({
  "Abn": "51824753556",
  "AbnStatus": "Active",
  "AbnStatusEffectiveFrom": "2000-06-01",
  "EntityName": "COMMONWEALTH BANK OF AUSTRALIA",
  "EntityTypeName": "Australian Public Company",
  "Gst": "2000-07-01",
  "AddressState": "NSW",
  "AddressPostcode": "2000"
});`;

const FIXTURE_ACTIVE_V202108 = `abn_data({
  "Abn": "51824753556",
  "AbnStatus": "Active",
  "AbnStatusEffectiveFrom": "2000-06-01",
  "EntityName": { "OrganisationName": "COMMONWEALTH BANK OF AUSTRALIA" },
  "EntityTypeName": "Australian Public Company",
  "GstRegistered": true,
  "AddressState": "NSW",
  "AddressPostcode": "2000"
})`;

const FIXTURE_CANCELLED = `abn_data({
  "Abn": "12345678901",
  "AbnStatus": "Cancelled",
  "AbnStatusEffectiveFrom": "2020-01-15",
  "EntityName": "DEFUNCT PTY LTD",
  "EntityTypeName": "Australian Private Company",
  "Gst": ""
});`;

const FIXTURE_MALFORMED = `abn_data(not-valid-json-at-all);`;

function mockFetch(body: string, init: { ok?: boolean; status?: number } = {}): typeof fetch {
  return vi.fn(async () => {
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      text: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("abr-adapter · lookupAbn", () => {
  beforeEach(() => {
    _resetAbrAdapterCache();
    process.env.ABR_GUID = "test-guid-do-not-log";
  });

  afterEach(() => {
    delete process.env.ABR_GUID;
    vi.restoreAllMocks();
  });

  it("returns null when ABR_GUID is unset (never throws)", async () => {
    delete process.env.ABR_GUID;
    const spy = vi.fn();
    const result = await lookupAbn("51824753556", { fetchImpl: spy as unknown as typeof fetch });
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null when ABN is not 11 digits", async () => {
    const spy = vi.fn();
    expect(
      await lookupAbn("123", { fetchImpl: spy as unknown as typeof fetch }),
    ).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("parses an Active v202001 JSONP payload", async () => {
    const result = await lookupAbn("51 824 753 556", {
      fetchImpl: mockFetch(FIXTURE_ACTIVE_V202001),
    });
    expect(result).not.toBeNull();
    expect(result?.abn).toBe("51824753556");
    expect(result?.status).toBe("Active");
    expect(result?.entityName).toBe("COMMONWEALTH BANK OF AUSTRALIA");
    expect(result?.gstRegistered).toBe(true);
    expect(result?.postcode).toBe("2000");
    expect(result?.state).toBe("NSW");
    expect(result?.source).toBe("abr_web_services");
    // Round-trip through the exported schema to guarantee shape stability.
    expect(AbnLookupResultSchema.parse(result)).toEqual(result);
  });

  it("parses the v202108 nested-EntityName shape + GstRegistered boolean", async () => {
    const result = await lookupAbn("51824753556", {
      fetchImpl: mockFetch(FIXTURE_ACTIVE_V202108),
    });
    expect(result).not.toBeNull();
    expect(result?.entityName).toBe("COMMONWEALTH BANK OF AUSTRALIA");
    expect(result?.gstRegistered).toBe(true);
  });

  it("surfaces a Cancelled ABN as status='Cancelled' with gstRegistered=false", async () => {
    const result = await lookupAbn("12345678901", {
      fetchImpl: mockFetch(FIXTURE_CANCELLED),
    });
    expect(result?.status).toBe("Cancelled");
    expect(result?.gstRegistered).toBe(false);
  });

  it("returns null on malformed JSONP body", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await lookupAbn("51824753556", {
      fetchImpl: mockFetch(FIXTURE_MALFORMED),
    });
    expect(result).toBeNull();
    // Sanity — we logged only the ABN, never the GUID.
    for (const call of warnSpy.mock.calls) {
      const line = JSON.stringify(call);
      expect(line).not.toContain("test-guid-do-not-log");
    }
  });

  it("returns null on non-2xx and never logs the GUID", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await lookupAbn("51824753556", {
      fetchImpl: mockFetch("Server Error", { ok: false, status: 503 }),
    });
    expect(result).toBeNull();
    for (const call of warnSpy.mock.calls) {
      const line = JSON.stringify(call);
      expect(line).not.toContain("test-guid-do-not-log");
      expect(line).not.toContain("guid=");
    }
  });

  it("caches successful lookups for 24h (no second network call)", async () => {
    const fetchSpy = mockFetch(FIXTURE_ACTIVE_V202001);
    const first = await lookupAbn("51824753556", { fetchImpl: fetchSpy });
    const second = await lookupAbn("51824753556", { fetchImpl: fetchSpy });
    expect(first?.entityName).toBe(second?.entityName);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("bypasses the cache when skipCache is set", async () => {
    const fetchSpy = mockFetch(FIXTURE_ACTIVE_V202001);
    await lookupAbn("51824753556", { fetchImpl: fetchSpy });
    await lookupAbn("51824753556", { fetchImpl: fetchSpy, skipCache: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
