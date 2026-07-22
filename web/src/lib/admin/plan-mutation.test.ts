import { describe, it, expect } from "vitest";
import { decidePlanChange, validatePlanBody } from "./plan-mutation";

describe("validatePlanBody", () => {
  it("accepts a minimal valid body", () => {
    const out = validatePlanBody({ plan: "founder_growth" });
    expect(out).toEqual({
      ok: true,
      value: { plan: "founder_growth", reconcile_credits: false },
    });
  });

  it("trims the plan value", () => {
    const out = validatePlanBody({ plan: "  founder_free  " });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.plan).toBe("founder_free");
  });

  it("accepts reconcile_credits=true", () => {
    const out = validatePlanBody({ plan: "founder_growth", reconcile_credits: true });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.reconcile_credits).toBe(true);
  });

  it("treats null reconcile_credits as false", () => {
    const out = validatePlanBody({ plan: "founder_growth", reconcile_credits: null });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.reconcile_credits).toBe(false);
  });

  it("accepts a legacy plan id", () => {
    const out = validatePlanBody({ plan: "growth_annual" });
    expect(out.ok).toBe(true);
  });

  it("rejects a non-object body", () => {
    expect(validatePlanBody(null)).toEqual({ ok: false, reason: "invalid_body" });
    expect(validatePlanBody("founder_free").ok).toBe(false);
    expect(validatePlanBody(42).ok).toBe(false);
  });

  it("rejects a missing plan field", () => {
    expect(validatePlanBody({})).toEqual({ ok: false, reason: "plan_invalid" });
  });

  it("rejects an empty plan string", () => {
    expect(validatePlanBody({ plan: "   " })).toEqual({
      ok: false,
      reason: "plan_invalid",
    });
  });

  it("rejects a plan slug with uppercase or spaces", () => {
    expect(validatePlanBody({ plan: "Founder_Growth" })).toEqual({
      ok: false,
      reason: "plan_slug_invalid",
    });
    expect(validatePlanBody({ plan: "founder growth" })).toEqual({
      ok: false,
      reason: "plan_slug_invalid",
    });
  });

  it("rejects a plan slug starting with a digit", () => {
    expect(validatePlanBody({ plan: "2growth" })).toEqual({
      ok: false,
      reason: "plan_slug_invalid",
    });
  });

  it("rejects a non-boolean reconcile_credits", () => {
    expect(
      validatePlanBody({ plan: "founder_free", reconcile_credits: "yes" }),
    ).toEqual({ ok: false, reason: "reconcile_credits_invalid" });
    expect(
      validatePlanBody({ plan: "founder_free", reconcile_credits: 1 }),
    ).toEqual({ ok: false, reason: "reconcile_credits_invalid" });
  });
});

describe("decidePlanChange", () => {
  it("no-ops when the target already sits on the requested plan", () => {
    expect(decidePlanChange("founder_growth", "founder_growth", true, 200)).toEqual({
      changed: false,
      grant_credits: 0,
    });
  });

  it("changes without a grant when reconcile_credits is false", () => {
    expect(decidePlanChange("founder_free", "founder_growth", false, 200)).toEqual({
      changed: true,
      grant_credits: 0,
    });
  });

  it("grants the plan's monthly_credits when reconciliation is on", () => {
    expect(decidePlanChange("founder_free", "founder_growth", true, 200)).toEqual({
      changed: true,
      grant_credits: 200,
    });
  });

  it("floors a fractional monthly_credits allowance", () => {
    expect(decidePlanChange("founder_free", "founder_growth", true, 200.9)).toEqual({
      changed: true,
      grant_credits: 200,
    });
  });

  it("does not grant when monthly_credits is 0", () => {
    expect(decidePlanChange("founder_free", "founder_starter", true, 0)).toEqual({
      changed: true,
      grant_credits: 0,
    });
  });

  it("does not grant when monthly_credits is negative (unlimited sentinel)", () => {
    expect(decidePlanChange("founder_free", "founder_enterprise", true, -1)).toEqual({
      changed: true,
      grant_credits: 0,
    });
  });

  it("does not grant when monthly_credits is null", () => {
    expect(decidePlanChange("founder_free", "founder_growth", true, null)).toEqual({
      changed: true,
      grant_credits: 0,
    });
  });

  it("does not grant when monthly_credits is undefined", () => {
    expect(decidePlanChange("founder_free", "founder_growth", true, undefined)).toEqual({
      changed: true,
      grant_credits: 0,
    });
  });
});
