import { describe, expect, it } from "vitest";

import { cn, formatAud, formatNumber, formatPercent } from "./utils";

describe("cn", () => {
  it("joins simple class names in order", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values (undefined, null, false, empty string)", () => {
    expect(cn("a", undefined, "b", null, false, "", "c")).toBe("a b c");
  });

  it("flattens array inputs from ClassValue tuples", () => {
    expect(cn(["a", "b"], ["c"])).toBe("a b c");
  });

  it("applies object-form conditional classes when truthy", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("nests arrays + objects together via clsx", () => {
    expect(cn(["a", { b: true, c: false }], "d")).toBe("a b d");
  });

  it("returns an empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("merges conflicting tailwind utilities so the later one wins (twMerge)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("keeps unrelated tailwind utilities alongside a merge", () => {
    expect(cn("px-2 py-2", "px-4")).toBe("py-2 px-4");
  });

  it("resolves conflicting background-colour utilities to the latest", () => {
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("preserves responsive prefixes independently of base utilities", () => {
    expect(cn("p-2 md:p-4", "p-6")).toBe("md:p-4 p-6");
  });
});

describe("formatAud", () => {
  it("formats a positive integer as en-AU AUD with no fraction digits", () => {
    expect(formatAud(1000)).toBe("$1,000");
  });

  it("rounds fractional amounts to the nearest dollar (maximumFractionDigits=0)", () => {
    expect(formatAud(1234.56)).toBe("$1,235");
    expect(formatAud(1234.4)).toBe("$1,234");
  });

  it("emits a leading minus for negative amounts", () => {
    expect(formatAud(-500)).toBe("-$500");
  });

  it("returns $0 for zero", () => {
    expect(formatAud(0)).toBe("$0");
  });

  it("returns the sentinel '$0' when amount is NaN", () => {
    expect(formatAud(Number.NaN)).toBe("$0");
  });

  it("returns the sentinel '$0' for +/- Infinity (non-finite guard)", () => {
    expect(formatAud(Number.POSITIVE_INFINITY)).toBe("$0");
    expect(formatAud(Number.NEGATIVE_INFINITY)).toBe("$0");
  });

  it("uses thousands separators for large values", () => {
    expect(formatAud(1_500_000)).toBe("$1,500,000");
  });
});

describe("formatNumber", () => {
  it("formats a positive integer with en-AU thousands separators and no decimals", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("defaults fractionDigits to 0 — a fractional input is rounded", () => {
    expect(formatNumber(1234.7)).toBe("1,235");
  });

  it("respects an explicit fractionDigits argument", () => {
    expect(formatNumber(1234.5, 2)).toBe("1,234.50");
  });

  it("pads with trailing zeros to satisfy minimumFractionDigits", () => {
    expect(formatNumber(10, 3)).toBe("10.000");
  });

  it("returns '0' for NaN (non-finite guard)", () => {
    expect(formatNumber(Number.NaN)).toBe("0");
  });

  it("returns '0' for +/- Infinity (non-finite guard)", () => {
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("0");
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe("0");
  });

  it("emits a leading minus for negative values", () => {
    expect(formatNumber(-2500)).toBe("-2,500");
  });

  it("returns '0' for a literal zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

describe("formatPercent", () => {
  it("defaults to one decimal place and appends %", () => {
    expect(formatPercent(12.34)).toBe("12.3%");
  });

  it("respects an explicit fractionDigits argument", () => {
    expect(formatPercent(12.3456, 2)).toBe("12.35%");
  });

  it("pads with trailing zeros when the value has fewer digits than requested", () => {
    expect(formatPercent(50, 2)).toBe("50.00%");
  });

  it("accepts 0 fractionDigits and drops the decimal separator entirely", () => {
    expect(formatPercent(66.6, 0)).toBe("67%");
  });

  it("emits a leading minus for negative percentages", () => {
    expect(formatPercent(-3.14)).toBe("-3.1%");
  });

  it("returns '0%' for NaN (non-finite guard)", () => {
    expect(formatPercent(Number.NaN)).toBe("0%");
  });

  it("returns '0%' for +/- Infinity (non-finite guard)", () => {
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("0%");
    expect(formatPercent(Number.NEGATIVE_INFINITY)).toBe("0%");
  });

  it("returns '0.0%' for a literal zero at the default precision", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });
});
