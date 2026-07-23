import { describe, expect, it } from "vitest";
import { canUsePdfBranding, PDF_BRANDING_PLANS } from "./gate";

describe("canUsePdfBranding", () => {
  it("returns false for null / undefined / empty plan codes", () => {
    expect(canUsePdfBranding(null)).toBe(false);
    expect(canUsePdfBranding(undefined)).toBe(false);
    expect(canUsePdfBranding("")).toBe(false);
  });

  it("returns false for locked founder tiers", () => {
    expect(canUsePdfBranding("free")).toBe(false);
    expect(canUsePdfBranding("founding50")).toBe(false);
    expect(canUsePdfBranding("founder_free")).toBe(false);
    expect(canUsePdfBranding("founder_starter")).toBe(false);
  });

  it("returns true for Growth / Scale / Enterprise (legacy plan codes)", () => {
    expect(canUsePdfBranding("growth")).toBe(true);
    expect(canUsePdfBranding("growth_annual")).toBe(true);
    expect(canUsePdfBranding("scale")).toBe(true);
    expect(canUsePdfBranding("enterprise")).toBe(true);
  });

  it("returns true for the canonical v2 plan IDs", () => {
    expect(canUsePdfBranding("founder_growth")).toBe(true);
    expect(canUsePdfBranding("founder_scale")).toBe(true);
    expect(canUsePdfBranding("founder_enterprise")).toBe(true);
  });

  it("returns false for investor / accelerator / reseller segments", () => {
    // Those segments have their own gate posture — see reseller-module-plan.md § F.
    expect(canUsePdfBranding("investor_pro")).toBe(false);
    expect(canUsePdfBranding("accelerator_partner")).toBe(false);
    expect(canUsePdfBranding("reseller_admin")).toBe(false);
  });

  it("does not accidentally allow arbitrary strings", () => {
    expect(canUsePdfBranding("Growth")).toBe(false); // case-sensitive
    expect(canUsePdfBranding("growth-plus")).toBe(false);
    expect(canUsePdfBranding("ENTERPRISE")).toBe(false);
  });

  it("PDF_BRANDING_PLANS is frozen so downstream code cannot mutate it", () => {
    expect(Object.isFrozen(PDF_BRANDING_PLANS)).toBe(true);
  });
});
