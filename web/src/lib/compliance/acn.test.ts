// Pure-helper coverage for acn.ts. Contract: docs/plans/atlassian-standard-mapping-goal.md
// §2 Folder 1 item 1.2 ("Company Extract (ASIC) — auto-probe via ASIC Connect API"),
// spun off as P1h. Mirrors abn.test.ts so ABN/ACN parity is easy to audit.

import { describe, it, expect } from "vitest";
import {
  normalizeAcn,
  validateAcnChecksum,
  formatAcn,
  lookupAcnLive,
} from "./acn";

describe("normalizeAcn", () => {
  it("strips whitespace and non-digits", () => {
    expect(normalizeAcn("659 615 111")).toBe("659615111");
    expect(normalizeAcn("ACN: 659-615-111")).toBe("659615111");
  });

  it("returns null when digit count is wrong", () => {
    expect(normalizeAcn("65961511")).toBeNull();
    expect(normalizeAcn("6596151111")).toBeNull();
    expect(normalizeAcn("")).toBeNull();
    expect(normalizeAcn(null)).toBeNull();
    expect(normalizeAcn(undefined)).toBeNull();
  });
});

describe("validateAcnChecksum", () => {
  it("accepts a real ACN (Auschain PTY LTD)", () => {
    // ACN 659 615 111 — verified by summing digit·weight to 189, complement
    // (10 - 9) % 10 = 1 = the 9th digit.
    expect(validateAcnChecksum("659615111")).toBe(true);
    expect(validateAcnChecksum("659 615 111")).toBe(true);
  });

  it("rejects obviously-wrong ACNs", () => {
    expect(validateAcnChecksum("123456789")).toBe(false);
    expect(validateAcnChecksum("000000001")).toBe(false);
    expect(validateAcnChecksum("111111111")).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    expect(validateAcnChecksum("not-an-acn")).toBe(false);
    expect(validateAcnChecksum(null)).toBe(false);
    expect(validateAcnChecksum(undefined)).toBe(false);
    expect(validateAcnChecksum("")).toBe(false);
  });

  it("accepts an ACN whose checksum happens to be 0", () => {
    // Weights 8,7,6,5,4,3,2,1 → digits 1,0,0,0,0,0,0,0 → sum=8 → check=(10-8)%10=2.
    // Digits 5,0,0,0,0,0,0,0 → sum=40 → 40%10=0 → check=(10-0)%10=0.
    // So "500000000" should be valid.
    expect(validateAcnChecksum("500000000")).toBe(true);
  });
});

describe("formatAcn", () => {
  it("formats as NNN NNN NNN", () => {
    expect(formatAcn("659615111")).toBe("659 615 111");
  });

  it("returns null for malformed input", () => {
    expect(formatAcn("nope")).toBeNull();
    expect(formatAcn(null)).toBeNull();
  });
});

describe("lookupAcnLive", () => {
  it("returns a friendly error when ABR_GUID is missing", async () => {
    // Explicit empty guid + a stub fetch that would fail loudly if called.
    const failFetch = (async () => {
      throw new Error("network should not be called without a guid");
    }) as unknown as typeof fetch;
    const result = await lookupAcnLive("659615111", { guid: "", fetchImpl: failFetch });
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
    const result = await lookupAcnLive("659615111", { guid: "test-guid", fetchImpl: stubFetch });
    expect(result.live_error).toBeNull();
    expect(result.live).not.toBeNull();
    expect(result.live?.entity_name).toBe("AUSCHAIN PTY LTD");
    expect(result.live?.abn).toBe("79659615111");
    expect(result.live?.abn_status).toBe("Active");
    expect(result.live?.gst_registered).toBe(true);
    expect(result.live?.business_state).toBe("NSW");
  });

  it("strips a JSONP wrapper when present", async () => {
    const inner = JSON.stringify({ Acn: "659615111", EntityName: "AUSCHAIN PTY LTD", Message: "" });
    const jsonp = `callback(${inner});`;
    const stubFetch = (async () => new Response(jsonp, { status: 200 })) as unknown as typeof fetch;
    const result = await lookupAcnLive("659615111", { guid: "test-guid", fetchImpl: stubFetch });
    expect(result.live?.entity_name).toBe("AUSCHAIN PTY LTD");
    expect(result.live_error).toBeNull();
  });

  it("surfaces the ABR Message field as live_error for unknown ACNs", async () => {
    const stubBody = JSON.stringify({ Message: "No ACN records found." });
    const stubFetch = (async () => new Response(stubBody, { status: 200 })) as unknown as typeof fetch;
    const result = await lookupAcnLive("123456789", { guid: "test-guid", fetchImpl: stubFetch });
    expect(result.live).toBeNull();
    expect(result.live_error).toBe("No ACN records found.");
  });

  it("returns an HTTP error rather than throwing on non-200 responses", async () => {
    const stubFetch = (async () => new Response("boom", { status: 502 })) as unknown as typeof fetch;
    const result = await lookupAcnLive("659615111", { guid: "test-guid", fetchImpl: stubFetch });
    expect(result.live).toBeNull();
    expect(result.live_error).toBe("ABR HTTP 502");
  });
});
