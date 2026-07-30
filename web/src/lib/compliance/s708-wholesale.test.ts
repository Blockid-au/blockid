// Pure-helper coverage for s708-wholesale.ts — s708(8) Corporations Act 2001
// (Cth) wholesale / sophisticated investor certificate intake shipped alongside
// the P9-wholesale-cert-slot data-room slot (§2 folder 12 item 12.1a). The
// module has been in the tree without colocated tests; this file follows the
// same test-hygiene posture as rd-calendar.test.ts + au-comparable-raises.test.ts.
//
// Statutory refs:
//   Corporations Act 2001 (Cth) s708(8) + Corporations Regulations 2001 reg 6D.2.03
//   ASIC RG 236 wholesale-client threshold guidance
//
// Certs are valid for two years from cert_date (with a 60-day amber
// "expiring_soon" band before expiry). The module intentionally does NOT
// authenticate the accountant — the tests only cover the pure classifier +
// input normaliser.

import { describe, it, expect } from "vitest";
import {
  addYearsIso,
  classifyCert,
  normaliseCert,
  summariseCerts,
  S708_DISCLAIMER,
  type S708CertInput,
  type S708CertRecord,
} from "./s708-wholesale";

describe("S708_DISCLAIMER", () => {
  it("is a non-empty AFSL-safe disclaimer citing the professional-accounting-body boundary", () => {
    expect(S708_DISCLAIMER).toMatch(/Not legal advice/i);
    expect(S708_DISCLAIMER).toMatch(/CA\/CPA\/IPA/);
    expect(S708_DISCLAIMER).toMatch(/6D\.2\.03/);
  });
});

describe("addYearsIso", () => {
  it("adds whole years keeping day-of-month", () => {
    expect(addYearsIso("2026-01-15", 2)).toBe("2028-01-15");
    expect(addYearsIso("2026-12-31", 2)).toBe("2028-12-31");
  });

  it("accepts negative years", () => {
    expect(addYearsIso("2026-05-01", -1)).toBe("2025-05-01");
  });

  it("throws on invalid ISO input", () => {
    expect(() => addYearsIso("not-a-date", 2)).toThrow(/Invalid ISO date/);
  });
});

describe("classifyCert", () => {
  const CERT_DATE = "2026-01-01";

  it("marks a cert with > 60 days remaining as valid", () => {
    const now = new Date("2026-03-01T00:00:00Z"); // 306 days to 2028-01-01
    const out = classifyCert(CERT_DATE, "2028-01-01", now);
    expect(out.status).toBe("valid");
    expect(out.days_to_expiry).toBeGreaterThan(60);
  });

  it("marks a cert inside the 60-day amber band as expiring_soon", () => {
    // Exactly 60 days before expiry — inclusive boundary.
    const now = new Date("2027-11-02T00:00:00Z"); // 60 days to 2028-01-01
    const out = classifyCert(CERT_DATE, "2028-01-01", now);
    expect(out.status).toBe("expiring_soon");
    expect(out.days_to_expiry).toBe(60);
  });

  it("marks the day-of-expiry as expiring_soon (0 days)", () => {
    const now = new Date("2028-01-01T00:00:00Z");
    const out = classifyCert(CERT_DATE, "2028-01-01", now);
    expect(out.status).toBe("expiring_soon");
    expect(out.days_to_expiry).toBe(0);
  });

  it("marks a past-expiry cert as expired with a negative day count", () => {
    const now = new Date("2028-02-01T00:00:00Z");
    const out = classifyCert(CERT_DATE, "2028-01-01", now);
    expect(out.status).toBe("expired");
    expect(out.days_to_expiry).toBeLessThan(0);
  });
});

describe("normaliseCert — happy path", () => {
  const NOW = new Date("2026-06-01T00:00:00Z");
  const goodInput: S708CertInput = {
    investor_email: "alice@example.com",
    certifying_accountant_name: "  Ada Lovelace  ",
    certifying_accountant_firm: "  Analytical Accounting  ",
    cert_type: "net_assets",
    cert_date: "2026-01-15",
  };

  it("computes expiry_date = cert_date + 2 years when omitted", () => {
    const out = normaliseCert(goodInput, NOW);
    expect(out.expiry_date).toBe("2028-01-15");
    expect(out.status).toBe("valid");
    expect(out.days_to_expiry).toBeGreaterThan(60);
  });

  it("trims accountant name + firm whitespace", () => {
    const out = normaliseCert(goodInput, NOW);
    expect(out.certifying_accountant_name).toBe("Ada Lovelace");
    expect(out.certifying_accountant_firm).toBe("Analytical Accounting");
  });

  it("defaults evidence_url to null when omitted", () => {
    const out = normaliseCert(goodInput, NOW);
    expect(out.evidence_url).toBeNull();
  });

  it("preserves supplied evidence_url", () => {
    const out = normaliseCert(
      { ...goodInput, evidence_url: "https://example.com/cert.pdf" },
      NOW,
    );
    expect(out.evidence_url).toBe("https://example.com/cert.pdf");
  });

  it("accepts caller-provided expiry_date within 1-day tolerance of cert_date + 2y", () => {
    const out = normaliseCert(
      { ...goodInput, expiry_date: "2028-01-14" }, // 1 day early
      NOW,
    );
    expect(out.expiry_date).toBe("2028-01-14");
  });
});

describe("normaliseCert — validation errors", () => {
  const NOW = new Date("2026-06-01T00:00:00Z");
  const base: S708CertInput = {
    investor_email: "alice@example.com",
    certifying_accountant_name: "Ada",
    certifying_accountant_firm: "Analytical",
    cert_type: "net_assets",
    cert_date: "2026-01-15",
  };

  it("rejects an email without an @", () => {
    expect(() =>
      normaliseCert({ ...base, investor_email: "not-an-email" }, NOW),
    ).toThrow(/investor_email/);
  });

  it("rejects a blank certifying accountant name", () => {
    expect(() =>
      normaliseCert({ ...base, certifying_accountant_name: "   " }, NOW),
    ).toThrow(/certifying_accountant_name/);
  });

  it("rejects a blank certifying accountant firm", () => {
    expect(() =>
      normaliseCert({ ...base, certifying_accountant_firm: "" }, NOW),
    ).toThrow(/certifying_accountant_firm/);
  });

  it("rejects an unknown cert_type", () => {
    expect(() =>
      normaliseCert(
        { ...base, cert_type: "other" as S708CertInput["cert_type"] },
        NOW,
      ),
    ).toThrow(/cert_type/);
  });

  it("rejects a cert_date that is not ISO YYYY-MM-DD", () => {
    expect(() =>
      normaliseCert({ ...base, cert_date: "15/01/2026" }, NOW),
    ).toThrow(/cert_date/);
  });

  it("rejects a caller-provided expiry_date beyond the s708 2-year cap", () => {
    // cert_date + 2 years = 2028-01-15; 2028-04-15 is 90 days beyond the cap.
    expect(() =>
      normaliseCert({ ...base, expiry_date: "2028-04-15" }, NOW),
    ).toThrow(/2-year cap/);
  });
});

describe("summariseCerts", () => {
  const mk = (
    status: S708CertRecord["status"],
    email = `${status}@example.com`,
  ): S708CertRecord => ({
    investor_email: email,
    certifying_accountant_name: "Ada",
    certifying_accountant_firm: "Analytical",
    cert_type: "net_assets",
    cert_date: "2026-01-15",
    expiry_date: "2028-01-15",
    evidence_url: null,
    status,
    days_to_expiry: 0,
  });

  it("returns all-zero counts + has_valid_or_expiring=false for an empty set", () => {
    expect(summariseCerts([])).toEqual({
      total: 0,
      valid: 0,
      expiring_soon: 0,
      expired: 0,
      has_valid_or_expiring: false,
    });
  });

  it("counts each status bucket and flags has_valid_or_expiring when a valid cert is present", () => {
    const out = summariseCerts([mk("valid"), mk("expired"), mk("expired", "b@x")]);
    expect(out.total).toBe(3);
    expect(out.valid).toBe(1);
    expect(out.expiring_soon).toBe(0);
    expect(out.expired).toBe(2);
    expect(out.has_valid_or_expiring).toBe(true);
  });

  it("treats an expiring_soon cert as 'on file' (has_valid_or_expiring=true)", () => {
    const out = summariseCerts([mk("expiring_soon"), mk("expired", "b@x")]);
    expect(out.expiring_soon).toBe(1);
    expect(out.has_valid_or_expiring).toBe(true);
  });

  it("returns has_valid_or_expiring=false when every cert has fully lapsed", () => {
    const out = summariseCerts([mk("expired"), mk("expired", "b@x")]);
    expect(out.expired).toBe(2);
    expect(out.has_valid_or_expiring).toBe(false);
  });
});
