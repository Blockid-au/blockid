import { describe, expect, it } from "vitest";
import {
  buildAbnLookupUrl,
  formatAbrDate,
  formatAcnDisplay,
  isProbablyCompleteAbn,
  makeEmptyAbnLookupFormState,
  normaliseAbnInput,
  pickAbnBand,
  type AbnLookupSuccess,
} from "./abn-lookup.helpers";

describe("abn-lookup helpers", () => {
  describe("makeEmptyAbnLookupFormState", () => {
    it("returns a blank ABN by default", () => {
      const s = makeEmptyAbnLookupFormState();
      expect(s.abn).toBe("");
    });

    it("accepts a seeded ABN and trims whitespace", () => {
      const s = makeEmptyAbnLookupFormState("  79 659 615 111  ");
      expect(s.abn).toBe("79 659 615 111");
    });
  });

  describe("normaliseAbnInput", () => {
    it("strips whitespace and dashes and returns the digit run", () => {
      expect(normaliseAbnInput("79 659 615 111")).toBe("79659615111");
      expect(normaliseAbnInput("79-659-615-111")).toBe("79659615111");
    });

    it("returns null when no digits remain", () => {
      expect(normaliseAbnInput("")).toBeNull();
      expect(normaliseAbnInput("   ")).toBeNull();
      expect(normaliseAbnInput("abc")).toBeNull();
    });

    it("keeps partial digit runs so isProbablyCompleteAbn can gate", () => {
      expect(normaliseAbnInput("79 659")).toBe("79659");
    });
  });

  describe("isProbablyCompleteAbn", () => {
    it("returns true only when the cleaned input is exactly 11 digits", () => {
      expect(isProbablyCompleteAbn({ abn: "79 659 615 111" })).toBe(true);
      expect(isProbablyCompleteAbn({ abn: "79659615111" })).toBe(true);
    });

    it("returns false for shorter or longer runs", () => {
      expect(isProbablyCompleteAbn({ abn: "" })).toBe(false);
      expect(isProbablyCompleteAbn({ abn: "79 659" })).toBe(false);
      expect(isProbablyCompleteAbn({ abn: "79659615111234" })).toBe(false);
    });
  });

  describe("buildAbnLookupUrl", () => {
    it("returns null when the input has no digits so submit stays disabled", () => {
      expect(buildAbnLookupUrl({ abn: "" })).toBeNull();
      expect(buildAbnLookupUrl({ abn: "   " })).toBeNull();
      expect(buildAbnLookupUrl({ abn: "abc" })).toBeNull();
    });

    it("passes the cleaned digit run through as the abn query param", () => {
      const url = buildAbnLookupUrl({ abn: "79 659 615 111" });
      expect(url).toBe("/api/abr/lookup?abn=79659615111");
    });

    it("passes partial input through so the route can 400 with a clear message", () => {
      // isProbablyCompleteAbn gates the button; this fallback path only
      // fires when a caller programmatically submits. The route returns
      // 400 invalid_abn_format for a 5-digit ABN.
      expect(buildAbnLookupUrl({ abn: "79659" })).toBe("/api/abr/lookup?abn=79659");
    });
  });

  describe("pickAbnBand", () => {
    const base: AbnLookupSuccess = {
      abn: "79659615111",
      abn_formatted: "79 659 615 111",
      valid_checksum: true,
      source: "checksum",
      live: null,
      live_error: null,
    };

    it("returns red when the checksum fails", () => {
      expect(pickAbnBand({ ...base, valid_checksum: false })).toBe("red");
    });

    it("returns amber when the checksum passes but no live ABR record", () => {
      expect(pickAbnBand({ ...base })).toBe("amber");
    });

    it("returns amber when ABR returns a non-active status (cancelled)", () => {
      expect(
        pickAbnBand({
          ...base,
          source: "abr-live",
          live: {
            entity_name: "Auschain Pty Ltd",
            entity_type_name: "Australian Private Company",
            abn_status: "Cancelled",
            abn_status_effective_from: "2020-01-01",
            gst_registered: false,
            gst_effective_from: null,
            business_state: "NSW",
            business_postcode: "2000",
            acn: "659615111",
          },
        }),
      ).toBe("amber");
    });

    it("returns emerald when ABR confirms an active ABN", () => {
      expect(
        pickAbnBand({
          ...base,
          source: "abr-live",
          live: {
            entity_name: "Auschain Pty Ltd",
            entity_type_name: "Australian Private Company",
            abn_status: "Active",
            abn_status_effective_from: "2022-08-04",
            gst_registered: true,
            gst_effective_from: "2022-08-04",
            business_state: "NSW",
            business_postcode: "2000",
            acn: "659615111",
          },
        }),
      ).toBe("emerald");
    });
  });

  describe("formatAcnDisplay", () => {
    it("returns em-dash for missing input", () => {
      expect(formatAcnDisplay(null)).toBe("—");
      expect(formatAcnDisplay(undefined)).toBe("—");
      expect(formatAcnDisplay("")).toBe("—");
    });

    it("groups a 9-digit ACN as NNN NNN NNN", () => {
      expect(formatAcnDisplay("659615111")).toBe("659 615 111");
      expect(formatAcnDisplay("659 615 111")).toBe("659 615 111");
    });

    it("returns the raw string when the digit count is unexpected", () => {
      expect(formatAcnDisplay("12345")).toBe("12345");
    });
  });

  describe("formatAbrDate", () => {
    it("returns em-dash for missing / blank input", () => {
      expect(formatAbrDate(null)).toBe("—");
      expect(formatAbrDate(undefined)).toBe("—");
      expect(formatAbrDate("")).toBe("—");
      expect(formatAbrDate("   ")).toBe("—");
    });

    it("formats a parseable ISO date as a locale-friendly string", () => {
      const out = formatAbrDate("2022-08-04");
      // Locale format may vary, but must contain the year + month token
      // ("Aug" for en-AU short month) — assert both.
      expect(out).toContain("2022");
      expect(out.toLowerCase()).toContain("aug");
    });

    it("falls back to the raw string for an unparseable value", () => {
      expect(formatAbrDate("not-a-date")).toBe("not-a-date");
    });
  });
});
