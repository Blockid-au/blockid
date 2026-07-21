import { describe, it, expect } from "vitest";
import { validateAdminResellerPatch, type AdminResellerRow } from "./admin-validator";

const RETAIL: AdminResellerRow = {
  billing_model: "retail",
  gst_registered: false,
  abn: null,
};

const WHOLESALE_OK: AdminResellerRow = {
  billing_model: "wholesale",
  gst_registered: true,
  abn: "79 659 615 111",
};

describe("validateAdminResellerPatch — empty & shape", () => {
  it("rejects an empty patch", () => {
    const r = validateAdminResellerPatch(RETAIL, {});
    expect(r).toEqual({ ok: false, reason: "empty_patch" });
  });

  it("trims display_name and rejects blank", () => {
    expect(validateAdminResellerPatch(RETAIL, { display_name: "  " })).toEqual({
      ok: false,
      reason: "display_name_blank",
    });
    const r = validateAdminResellerPatch(RETAIL, { display_name: "  Acme  " });
    if (!r.ok) throw new Error("expected ok");
    expect(r.patch.display_name).toBe("Acme");
  });
});

describe("validateAdminResellerPatch — status enum", () => {
  it("accepts active/paused/terminated", () => {
    for (const s of ["active", "paused", "terminated"] as const) {
      const r = validateAdminResellerPatch(RETAIL, { status: s });
      if (!r.ok) throw new Error("expected ok for " + s);
      expect(r.patch.status).toBe(s);
    }
  });

  it("rejects unknown status", () => {
    const r = validateAdminResellerPatch(RETAIL, {
      status: "frozen" as unknown as "active",
    });
    expect(r).toEqual({ ok: false, reason: "invalid_status" });
  });
});

describe("validateAdminResellerPatch — wholesale/GST/ABN invariant", () => {
  it("rejects switch to wholesale without GST already set", () => {
    const r = validateAdminResellerPatch(RETAIL, { billing_model: "wholesale" });
    expect(r).toEqual({ ok: false, reason: "wholesale_requires_gst" });
  });

  it("rejects switch to wholesale when gst_registered is true but ABN missing", () => {
    const noAbn: AdminResellerRow = { billing_model: "retail", gst_registered: true, abn: null };
    const r = validateAdminResellerPatch(noAbn, { billing_model: "wholesale" });
    expect(r).toEqual({ ok: false, reason: "wholesale_requires_abn" });
  });

  it("accepts switch to wholesale when GST + ABN provided in same patch", () => {
    const r = validateAdminResellerPatch(RETAIL, {
      billing_model: "wholesale",
      gst_registered: true,
      abn: "79 659 615 111",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.patch.billing_model).toBe("wholesale");
    expect(r.patch.abn).toBe("79 659 615 111");
  });

  it("rejects clearing GST while row is wholesale", () => {
    const r = validateAdminResellerPatch(WHOLESALE_OK, { gst_registered: false });
    expect(r).toEqual({ ok: false, reason: "wholesale_requires_gst" });
  });

  it("rejects clearing ABN while row is wholesale", () => {
    const r = validateAdminResellerPatch(WHOLESALE_OK, { abn: null });
    expect(r).toEqual({ ok: false, reason: "wholesale_requires_abn" });
  });

  it("allows retail row to clear ABN", () => {
    const withAbn: AdminResellerRow = { billing_model: "retail", gst_registered: false, abn: "79 659 615 111" };
    const r = validateAdminResellerPatch(withAbn, { abn: null });
    if (!r.ok) throw new Error("expected ok");
    expect(r.patch.abn).toBeNull();
  });

  it("rejects malformed ABN", () => {
    const r = validateAdminResellerPatch(RETAIL, { abn: "79-659-615-111" });
    expect(r).toEqual({ ok: false, reason: "abn_bad_format" });
  });
});

describe("validateAdminResellerPatch — numeric bounds", () => {
  it("rejects negative budget/sandbox", () => {
    expect(validateAdminResellerPatch(RETAIL, { monthly_credit_budget: -1 })).toEqual({
      ok: false,
      reason: "budget_negative",
    });
    expect(validateAdminResellerPatch(RETAIL, { monthly_sandbox_credits: -1 })).toEqual({
      ok: false,
      reason: "sandbox_negative",
    });
  });

  it("floors fractional budget", () => {
    const r = validateAdminResellerPatch(RETAIL, { monthly_credit_budget: 100.9 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.patch.monthly_credit_budget).toBe(100);
  });

  it("rejects commission_share_pct outside [0,100]", () => {
    expect(validateAdminResellerPatch(RETAIL, { commission_share_pct: -0.1 })).toEqual({
      ok: false,
      reason: "commission_out_of_range",
    });
    expect(validateAdminResellerPatch(RETAIL, { commission_share_pct: 100.5 })).toEqual({
      ok: false,
      reason: "commission_out_of_range",
    });
    const r = validateAdminResellerPatch(RETAIL, { commission_share_pct: 40 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.patch.commission_share_pct).toBe(40);
  });
});

describe("validateAdminResellerPatch — allowed_tiers", () => {
  it("rejects empty or non-array", () => {
    expect(validateAdminResellerPatch(RETAIL, { allowed_tiers: [] })).toEqual({
      ok: false,
      reason: "tiers_bad_value",
    });
  });

  it("rejects tier values outside {0,10,20,30,40}", () => {
    expect(validateAdminResellerPatch(RETAIL, { allowed_tiers: [15] })).toEqual({
      ok: false,
      reason: "tiers_bad_value",
    });
  });

  it("dedupes and sorts valid tiers", () => {
    const r = validateAdminResellerPatch(RETAIL, { allowed_tiers: [30, 10, 30, 0] });
    if (!r.ok) throw new Error("expected ok");
    expect(r.patch.allowed_tiers).toEqual([0, 10, 30]);
  });
});

describe("validateAdminResellerPatch — primary_color", () => {
  it("accepts #RRGGBB", () => {
    const r = validateAdminResellerPatch(RETAIL, { primary_color: "#0055AA" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.patch.primary_color).toBe("#0055AA");
  });

  it("rejects malformed color", () => {
    expect(validateAdminResellerPatch(RETAIL, { primary_color: "blue" })).toEqual({
      ok: false,
      reason: "primary_color_bad_format",
    });
    expect(validateAdminResellerPatch(RETAIL, { primary_color: "#F00" })).toEqual({
      ok: false,
      reason: "primary_color_bad_format",
    });
  });

  it("allows clearing", () => {
    const r = validateAdminResellerPatch(RETAIL, { primary_color: null });
    if (!r.ok) throw new Error("expected ok");
    expect(r.patch.primary_color).toBeNull();
  });
});
