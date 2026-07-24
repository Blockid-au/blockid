import { describe, expect, it } from "vitest";
import {
  checkComAuRegistration,
  formatComAuFqdn,
  normalizeComAuLabel,
  validateComAuLabel,
} from "./comau-availability";

describe("normalizeComAuLabel", () => {
  it("strips .com.au suffix and lowercases", () => {
    expect(normalizeComAuLabel("BlockID.com.au")).toBe("blockid");
  });

  it("strips a bare .au suffix", () => {
    expect(normalizeComAuLabel("example.au")).toBe("example");
  });

  it("returns empty string for null/undefined without throwing", () => {
    expect(normalizeComAuLabel(null)).toBe("");
    expect(normalizeComAuLabel(undefined)).toBe("");
  });
});

describe("validateComAuLabel", () => {
  it("accepts a canonical label", () => {
    const v = validateComAuLabel("blockid");
    expect(v.valid).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it("accepts an IDN xn-- prefix even with the 3rd/4th hyphens", () => {
    const v = validateComAuLabel("xn--flchen");
    expect(v.valid).toBe(true);
  });

  it("rejects empty input", () => {
    expect(validateComAuLabel("").reasons).toContain("empty");
  });

  it("rejects a single-char label as too_short", () => {
    expect(validateComAuLabel("a").reasons).toContain("too_short");
  });

  it("rejects labels longer than 63 chars", () => {
    const v = validateComAuLabel("a".repeat(64));
    expect(v.reasons).toContain("too_long");
  });

  it("rejects illegal characters (underscore, dot, punct)", () => {
    expect(validateComAuLabel("hello_world").reasons).toContain("illegal_chars");
    expect(validateComAuLabel("block.id").reasons).toContain("illegal_chars");
  });

  it("rejects leading/trailing hyphen", () => {
    expect(validateComAuLabel("-block").reasons).toContain("leading_hyphen");
    expect(validateComAuLabel("block-").reasons).toContain("trailing_hyphen");
  });

  it("rejects consecutive hyphens at positions 3-4 for non-IDN", () => {
    const v = validateComAuLabel("ab--cd");
    expect(v.reasons).toContain("consecutive_hyphens_non_idn");
  });
});

describe("formatComAuFqdn", () => {
  it("appends .com.au for valid labels", () => {
    expect(formatComAuFqdn("blockid")).toBe("blockid.com.au");
    expect(formatComAuFqdn("BlockID.com.au")).toBe("blockid.com.au");
  });

  it("returns null for invalid labels", () => {
    expect(formatComAuFqdn("-nope")).toBeNull();
    expect(formatComAuFqdn("")).toBeNull();
  });
});

describe("checkComAuRegistration", () => {
  const nxdomain = Object.assign(new Error("nxdomain"), { code: "ENOTFOUND" });

  it("returns 'invalid' status for a syntactically invalid label without touching DNS", async () => {
    let called = false;
    const res = await checkComAuRegistration("-nope", {
      resolveSoa: async () => {
        called = true;
        throw new Error("should not be called");
      },
      resolveNs: async () => {
        called = true;
        throw new Error("should not be called");
      },
    });
    expect(res.status).toBe("invalid");
    expect(res.fqdn).toBeNull();
    expect(called).toBe(false);
  });

  it("returns 'likely-registered' when SOA resolves", async () => {
    const res = await checkComAuRegistration("blockid", {
      resolveSoa: async () => ({ nsname: "ns1.example.com" }),
      resolveNs: async () => ["ns1.example.com", "ns2.example.com"],
    });
    expect(res.status).toBe("likely-registered");
    expect(res.fqdn).toBe("blockid.com.au");
    expect(res.evidence.soa_records).toBe(1);
    expect(res.evidence.ns_records).toBe(2);
  });

  it("returns 'likely-registered' when only NS resolves (parked domain)", async () => {
    const res = await checkComAuRegistration("parked", {
      resolveSoa: async () => {
        throw nxdomain;
      },
      resolveNs: async () => ["ns1.parked.example"],
    });
    expect(res.status).toBe("likely-registered");
    expect(res.evidence.ns_records).toBe(1);
  });

  it("returns 'likely-available' when both SOA and NS return NXDOMAIN/ENODATA", async () => {
    const res = await checkComAuRegistration("nobody-owns-this-yet-2026", {
      resolveSoa: async () => {
        throw nxdomain;
      },
      resolveNs: async () => {
        throw Object.assign(new Error("nodata"), { code: "ENODATA" });
      },
    });
    expect(res.status).toBe("likely-available");
    expect(res.evidence.soa_records).toBe(0);
    expect(res.evidence.ns_records).toBe(0);
  });

  it("propagates non-NXDOMAIN errors as probe_error", async () => {
    const res = await checkComAuRegistration("timeout", {
      resolveSoa: async () => {
        throw Object.assign(new Error("timed out"), { code: "ETIMEOUT" });
      },
      resolveNs: async () => {
        throw Object.assign(new Error("timed out"), { code: "ETIMEOUT" });
      },
    });
    expect(res.status).toBe("probe_error");
    expect(res.probe_error).toBe("ETIMEOUT");
  });
});
