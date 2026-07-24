import { describe, expect, it } from "vitest";
import {
  buildAbsLookupUrl,
  formatAudCompact,
  formatPct,
  isAnzsicCode,
  makeEmptyAbsLookupFormState,
  parsePctInput,
} from "./abs-lookup.helpers";

describe("abs-lookup helpers", () => {
  describe("makeEmptyAbsLookupFormState", () => {
    it("returns blank fields by default", () => {
      const s = makeEmptyAbsLookupFormState();
      expect(s.query).toBe("");
      expect(s.addressablePct).toBe("");
      expect(s.targetSharePct).toBe("");
    });

    it("accepts an initial keyword and trims whitespace", () => {
      const s = makeEmptyAbsLookupFormState("  saas  ");
      expect(s.query).toBe("saas");
    });
  });

  describe("isAnzsicCode", () => {
    it("matches uppercase and lowercase 5-char ANZSIC codes", () => {
      expect(isAnzsicCode("J5810")).toBe(true);
      expect(isAnzsicCode("k6419")).toBe(true);
      expect(isAnzsicCode("  J5810  ")).toBe(true);
    });

    it("rejects freeform keywords and malformed codes", () => {
      expect(isAnzsicCode("saas")).toBe(false);
      expect(isAnzsicCode("fintech")).toBe(false);
      expect(isAnzsicCode("J581")).toBe(false);
      expect(isAnzsicCode("J58100")).toBe(false);
      expect(isAnzsicCode("58100")).toBe(false);
      expect(isAnzsicCode("")).toBe(false);
    });
  });

  describe("parsePctInput", () => {
    it("returns null for blank / non-numeric so the URL builder omits the param", () => {
      expect(parsePctInput("")).toBeNull();
      expect(parsePctInput("   ")).toBeNull();
      expect(parsePctInput("not a number")).toBeNull();
    });

    it("converts >1 user input to 0..1 fractions (0-100 percent mode)", () => {
      expect(parsePctInput("20")).toBeCloseTo(0.2);
      expect(parsePctInput("5")).toBeCloseTo(0.05);
      expect(parsePctInput("100")).toBe(1);
    });

    it("treats 0..1 input as already-fractional and passes through", () => {
      expect(parsePctInput("0.5")).toBe(0.5);
      expect(parsePctInput("0.01")).toBe(0.01);
      expect(parsePctInput("0")).toBe(0);
      // Boundary: exactly "1" is treated as fractional (100%), not "1%",
      // matching the acquisition-wizard normalisePct convention. A founder
      // who means "1%" should type "0.01" or the panel will show a warning.
      expect(parsePctInput("1")).toBe(1);
    });

    it("clamps overshoot into [0,1] so a fat-finger never hits the route", () => {
      expect(parsePctInput("500")).toBe(1);
      expect(parsePctInput("-20")).toBe(0);
    });
  });

  describe("buildAbsLookupUrl", () => {
    it("returns null when the query is blank so the panel keeps submit disabled", () => {
      const url = buildAbsLookupUrl(makeEmptyAbsLookupFormState());
      expect(url).toBeNull();
    });

    it("routes an ANZSIC-shaped query through ?anzsic=", () => {
      const url = buildAbsLookupUrl({
        query: "j5810",
        addressablePct: "",
        targetSharePct: "",
      });
      expect(url).toBe("/api/abs/lookup?anzsic=J5810");
    });

    it("routes a freeform keyword through ?keyword= (URL-encoded)", () => {
      const url = buildAbsLookupUrl({
        query: "saas",
        addressablePct: "",
        targetSharePct: "",
      });
      expect(url).toBe("/api/abs/lookup?keyword=saas");
    });

    it("attaches addressablePct + targetSharePct as fractional 0..1 values", () => {
      const url = buildAbsLookupUrl({
        query: "fintech",
        addressablePct: "25",
        targetSharePct: "2",
      });
      expect(url).toBe(
        "/api/abs/lookup?keyword=fintech&addressablePct=0.25&targetSharePct=0.02",
      );
    });

    it("omits blank pct params so the route applies its own defaults", () => {
      const url = buildAbsLookupUrl({
        query: "healthtech",
        addressablePct: "",
        targetSharePct: "",
      });
      expect(url).toBe("/api/abs/lookup?keyword=healthtech");
      expect(url?.includes("addressablePct")).toBe(false);
      expect(url?.includes("targetSharePct")).toBe(false);
    });
  });

  describe("formatAudCompact", () => {
    it("returns em-dash for null / undefined / NaN / infinity / negatives", () => {
      expect(formatAudCompact(null)).toBe("—");
      expect(formatAudCompact(undefined)).toBe("—");
      expect(formatAudCompact(Number.NaN)).toBe("—");
      expect(formatAudCompact(Number.POSITIVE_INFINITY)).toBe("—");
      expect(formatAudCompact(-1)).toBe("—");
    });

    it("formats billions with 1dp", () => {
      expect(formatAudCompact(6_500_000_000)).toBe("A$6.5B");
      expect(formatAudCompact(1_000_000_000)).toBe("A$1.0B");
    });

    it("formats millions as whole A$M with grouping", () => {
      expect(formatAudCompact(400_000_000)).toBe("A$400M");
      expect(formatAudCompact(3_100_000_000)).toBe("A$3.1B");
    });

    it("formats sub-A$M as A$k / whole AUD", () => {
      expect(formatAudCompact(50_000)).toBe("A$50k");
      expect(formatAudCompact(0)).toBe("A$0");
    });
  });

  describe("formatPct", () => {
    it("returns em-dash for null / undefined / NaN", () => {
      expect(formatPct(null)).toBe("—");
      expect(formatPct(undefined)).toBe("—");
      expect(formatPct(Number.NaN)).toBe("—");
    });

    it("formats whole percents cleanly", () => {
      expect(formatPct(0.1)).toBe("10%");
      expect(formatPct(0.2)).toBe("20%");
      expect(formatPct(1)).toBe("100%");
    });

    it("formats decimal percents with one decimal", () => {
      expect(formatPct(0.108)).toBe("10.8%");
      expect(formatPct(0.126)).toBe("12.6%");
    });

    it("keeps sub-1% signal instead of rounding to 0", () => {
      expect(formatPct(0.001)).toBe("0.1%");
      expect(formatPct(0)).toBe("0%");
    });
  });
});
