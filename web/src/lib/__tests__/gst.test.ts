import { describe, it, expect } from "vitest";
import { calculateGst } from "../gst";

describe("calculateGst", () => {
  it("returns zero GST when not registered (AU customer)", () => {
    expect(calculateGst(11000, false, "AU")).toEqual({ gst_cents: 0, net_cents: 11000, gross_cents: 11000 });
  });

  it("returns zero GST for non-AU customer even when registered", () => {
    expect(calculateGst(11000, true, "US")).toEqual({ gst_cents: 0, net_cents: 11000, gross_cents: 11000 });
  });

  it("splits GST-inclusive AU sale (A$110.00 gross)", () => {
    // 11000 / 11 = 1000 GST; 10000 net
    expect(calculateGst(11000, true, "AU")).toEqual({ gst_cents: 1000, net_cents: 10000, gross_cents: 11000 });
  });

  it("splits GST on Founder Starter (A$29.00)", () => {
    // 2900 / 11 = 263.63 -> 264 GST; 2636 net
    expect(calculateGst(2900, true, "AU")).toEqual({ gst_cents: 264, net_cents: 2636, gross_cents: 2900 });
  });

  it("splits GST on Founder Growth (A$99.00)", () => {
    // 9900 / 11 = 900 GST; 9000 net
    expect(calculateGst(9900, true, "AU")).toEqual({ gst_cents: 900, net_cents: 9000, gross_cents: 9900 });
  });

  it("splits GST on VC Small (A$349.00)", () => {
    // 34900 / 11 = 3172.72 -> 3173 GST; 31727 net
    expect(calculateGst(34900, true, "AU")).toEqual({ gst_cents: 3173, net_cents: 31727, gross_cents: 34900 });
  });

  it("normalises jurisdiction casing/whitespace", () => {
    expect(calculateGst(11000, true, " au ")).toEqual({ gst_cents: 1000, net_cents: 10000, gross_cents: 11000 });
    expect(calculateGst(11000, true, "Au")).toEqual({ gst_cents: 1000, net_cents: 10000, gross_cents: 11000 });
  });

  it("returns zeros for zero-priced free plan", () => {
    expect(calculateGst(0, true, "AU")).toEqual({ gst_cents: 0, net_cents: 0, gross_cents: 0 });
  });

  it("clamps negative or NaN input to safe zero output", () => {
    expect(calculateGst(-500, true, "AU")).toEqual({ gst_cents: 0, net_cents: -500, gross_cents: -500 });
    expect(calculateGst(Number.NaN, true, "AU")).toEqual({ gst_cents: 0, net_cents: 0, gross_cents: 0 });
  });

  it("treats empty or missing jurisdiction as non-AU", () => {
    expect(calculateGst(11000, true, "")).toEqual({ gst_cents: 0, net_cents: 11000, gross_cents: 11000 });
    // @ts-expect-error runtime robustness
    expect(calculateGst(11000, true, undefined)).toEqual({ gst_cents: 0, net_cents: 11000, gross_cents: 11000 });
  });
});
