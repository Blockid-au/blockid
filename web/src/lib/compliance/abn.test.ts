// Pure-helper coverage for abn.ts. Contract: docs/plans/atlassian-standard-mapping-goal.md
// §1 phase 1 (ABR ABN-lookup probe, P0 raise-blocker, spun off as P1g).

import { describe, it, expect } from "vitest";
import {
  normalizeAbn,
  validateAbnChecksum,
  formatAbn,
  lookupAbnLive,
} from "./abn";

describe("normalizeAbn", () => {
  it("strips whitespace and non-digits", () => {
    expect(normalizeAbn("79 659 615 111")).toBe("79659615111");
    expect(normalizeAbn("ABN: 79-659-615-111")).toBe("79659615111");
  });

  it("returns null when digit count is wrong", () => {
    expect(normalizeAbn("796596151")).toBeNull();
    expect(normalizeAbn("7965961511199")).toBeNull();
    expect(normalizeAbn("")).toBeNull();
    expect(normalizeAbn(null)).toBeNull();
    expect(normalizeAbn(undefined)).toBeNull();
  });
});

describe("validateAbnChecksum", () => {
  it("accepts a real ABN (Auschain PTY LTD)", () => {
    // From /home/dovanlong/.claude/projects/-home-dovanlong-blockid-au/memory/business_entity.md
    // ABN 79 659 615 111 — verified by summing digit·weight to 356 (89 × 4).
    expect(validateAbnChecksum("79659615111")).toBe(true);
    expect(validateAbnChecksum("79 659 615 111")).toBe(true);
  });

  it("rejects obviously-wrong ABNs", () => {
    expect(validateAbnChecksum("12345678901")).toBe(false);
    expect(validateAbnChecksum("00000000000")).toBe(false);
    expect(validateAbnChecksum("11111111111")).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    expect(validateAbnChecksum("not-an-abn")).toBe(false);
    expect(validateAbnChecksum(null)).toBe(false);
    expect(validateAbnChecksum(undefined)).toBe(false);
    expect(validateAbnChecksum("")).toBe(false);
  });
});

describe("formatAbn", () => {
  it("formats as NN NNN NNN NNN", () => {
    expect(formatAbn("79659615111")).toBe("79 659 615 111");
  });

  it("returns null for malformed input", () => {
    expect(formatAbn("nope")).toBeNull();
    expect(formatAbn(null)).toBeNull();
  });
});

describe("lookupAbnLive", () => {
  it("returns a friendly error when ABR_GUID is missing", async () => {
    // Explicit empty guid + a stub fetch that would fail loudly if called.
    const failFetch = (async () => {
      throw new Error("network should not be called without a guid");
    }) as unknown as typeof fetch;
    const result = await lookupAbnLive("79659615111", { guid: "", fetchImpl: failFetch });
    expect(result.live).toBeNull();
    expect(result.live_error).toMatch(/ABR_GUID not configured/);
  });

  it("parses a successful ABR response", async () => {
    const stubBody = JSON.stringify({
      Abn: "79659615111",
      AbnStatus: "Active",
      AbnStatusEffectiveFrom: "2022-06-01",
      Acn: "659615111",
      AddressPostcode: "2000",
      AddressState: "NSW",
      EntityName: "AUSCHAIN PTY LTD",
      EntityTypeName: "Australian Private Company",
      Gst: "2022-06-01",
      Message: "",
    });
    const stubFetch = (async () => new Response(stubBody, { status: 200 })) as unknown as typeof fetch;
    const result = await lookupAbnLive("79659615111", { guid: "test-guid", fetchImpl: stubFetch });
    expect(result.live_error).toBeNull();
    expect(result.live).not.toBeNull();
    expect(result.live?.entity_name).toBe("AUSCHAIN PTY LTD");
    expect(result.live?.abn_status).toBe("Active");
    expect(result.live?.gst_registered).toBe(true);
    expect(result.live?.business_state).toBe("NSW");
    expect(result.live?.acn).toBe("659615111");
  });

  it("strips a JSONP wrapper when present", async () => {
    const inner = JSON.stringify({ Abn: "79659615111", EntityName: "AUSCHAIN PTY LTD", Message: "" });
    const jsonp = `callback(${inner});`;
    const stubFetch = (async () => new Response(jsonp, { status: 200 })) as unknown as typeof fetch;
    const result = await lookupAbnLive("79659615111", { guid: "test-guid", fetchImpl: stubFetch });
    expect(result.live?.entity_name).toBe("AUSCHAIN PTY LTD");
    expect(result.live_error).toBeNull();
  });

  it("surfaces the ABR Message field as live_error for unknown ABNs", async () => {
    const stubBody = JSON.stringify({ Message: "No ABN records found." });
    const stubFetch = (async () => new Response(stubBody, { status: 200 })) as unknown as typeof fetch;
    const result = await lookupAbnLive("12345678901", { guid: "test-guid", fetchImpl: stubFetch });
    expect(result.live).toBeNull();
    expect(result.live_error).toBe("No ABN records found.");
  });

  it("returns an HTTP error rather than throwing on non-200 responses", async () => {
    const stubFetch = (async () => new Response("boom", { status: 502 })) as unknown as typeof fetch;
    const result = await lookupAbnLive("79659615111", { guid: "test-guid", fetchImpl: stubFetch });
    expect(result.live).toBeNull();
    expect(result.live_error).toBe("ABR HTTP 502");
  });
});
