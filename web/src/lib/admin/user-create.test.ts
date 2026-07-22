import { describe, it, expect } from "vitest";
import {
  buildAppUsersInsert,
  CREATE_USER_SEGMENTS,
  validateCreateUserBody,
} from "./user-create";

describe("validateCreateUserBody", () => {
  const base = {
    email: "founder@example.com",
    segment: "founder",
    account_type: "founder",
    plan: "founder_growth",
  } as const;

  it("accepts a minimal valid body", () => {
    const out = validateCreateUserBody(base);
    expect(out).toEqual({
      ok: true,
      value: {
        email: "founder@example.com",
        segment: "founder",
        account_type: "founder",
        plan: "founder_growth",
        credits: 0,
        display_name: null,
      },
    });
  });

  it("lowercases + trims the email", () => {
    const out = validateCreateUserBody({ ...base, email: "  FOUNDER@Example.COM  " });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.email).toBe("founder@example.com");
  });

  it("accepts a display_name and trims it", () => {
    const out = validateCreateUserBody({ ...base, display_name: "  Jane  " });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.display_name).toBe("Jane");
  });

  it("collapses an empty display_name to null", () => {
    const out = validateCreateUserBody({ ...base, display_name: "   " });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.display_name).toBeNull();
  });

  it("accepts a positive credits grant", () => {
    const out = validateCreateUserBody({ ...base, credits: 100 });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.credits).toBe(100);
  });

  it("parses a stringified integer credits value", () => {
    const out = validateCreateUserBody({ ...base, credits: "50" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.credits).toBe(50);
  });

  it("treats null credits as 0", () => {
    const out = validateCreateUserBody({ ...base, credits: null });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.credits).toBe(0);
  });

  it("accepts every allowed account_type from P12.1", () => {
    for (const at of [
      "founder",
      "investor",
      "journalist",
      "investor_angel",
      "investor_vc",
      "advisor",
      "accelerator",
      "incubator",
      "reseller",
      "affiliate",
    ]) {
      const out = validateCreateUserBody({ ...base, account_type: at });
      expect(out.ok, `account_type=${at}`).toBe(true);
    }
  });

  it("accepts every allowed segment", () => {
    for (const seg of CREATE_USER_SEGMENTS) {
      const out = validateCreateUserBody({ ...base, segment: seg });
      expect(out.ok, `segment=${seg}`).toBe(true);
    }
  });

  it("rejects a non-object body", () => {
    expect(validateCreateUserBody(null)).toEqual({ ok: false, reason: "invalid_body" });
    expect(validateCreateUserBody("email").ok).toBe(false);
    expect(validateCreateUserBody(42).ok).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(
      validateCreateUserBody({ ...base, email: "not-an-email" }),
    ).toEqual({ ok: false, reason: "invalid_email" });
  });

  it("rejects an email over 320 chars", () => {
    const local = "a".repeat(320);
    const out = validateCreateUserBody({ ...base, email: `${local}@x.co` });
    expect(out).toEqual({ ok: false, reason: "invalid_email" });
  });

  it("rejects an unknown segment", () => {
    const out = validateCreateUserBody({ ...base, segment: "hacker" });
    expect(out).toEqual({ ok: false, reason: "segment_invalid" });
  });

  it("rejects an unknown account_type", () => {
    const out = validateCreateUserBody({ ...base, account_type: "spy" });
    expect(out).toEqual({ ok: false, reason: "account_type_invalid" });
  });

  it("rejects a missing plan field", () => {
    const { plan: _p, ...noPlan } = base;
    const out = validateCreateUserBody(noPlan);
    expect(out).toEqual({ ok: false, reason: "plan_invalid" });
  });

  it("rejects a plan slug with uppercase or spaces", () => {
    expect(
      validateCreateUserBody({ ...base, plan: "Founder_Growth" }),
    ).toEqual({ ok: false, reason: "plan_slug_invalid" });
    expect(
      validateCreateUserBody({ ...base, plan: "founder growth" }),
    ).toEqual({ ok: false, reason: "plan_slug_invalid" });
  });

  it("rejects a plan slug starting with a digit", () => {
    expect(
      validateCreateUserBody({ ...base, plan: "2growth" }),
    ).toEqual({ ok: false, reason: "plan_slug_invalid" });
  });

  it("rejects a negative credits value", () => {
    expect(
      validateCreateUserBody({ ...base, credits: -1 }),
    ).toEqual({ ok: false, reason: "credits_invalid" });
  });

  it("rejects a non-integer credits value", () => {
    expect(
      validateCreateUserBody({ ...base, credits: 1.5 }),
    ).toEqual({ ok: false, reason: "credits_invalid" });
  });

  it("rejects a credits value over the 100 000 cap", () => {
    expect(
      validateCreateUserBody({ ...base, credits: 100_001 }),
    ).toEqual({ ok: false, reason: "credits_invalid" });
  });

  it("rejects an over-long display_name", () => {
    const out = validateCreateUserBody({
      ...base,
      display_name: "x".repeat(121),
    });
    expect(out).toEqual({ ok: false, reason: "display_name_too_long" });
  });

  it("rejects a non-string display_name", () => {
    const out = validateCreateUserBody({ ...base, display_name: 42 });
    expect(out).toEqual({ ok: false, reason: "display_name_too_long" });
  });
});

describe("buildAppUsersInsert", () => {
  it("returns exactly the app_users columns the create route writes", () => {
    const row = buildAppUsersInsert({
      email: "founder@example.com",
      segment: "founder",
      account_type: "founder",
      plan: "founder_growth",
      credits: 200,
      display_name: "Jane",
    });
    expect(row).toEqual({
      email: "founder@example.com",
      segment: "founder",
      account_type: "founder",
      plan: "founder_growth",
      display_name: "Jane",
    });
    // credits is intentionally not in the insert row — it flows through
    // grantCredits() so the balance/tx ledger stays authoritative.
    expect(Object.keys(row).sort()).toEqual([
      "account_type",
      "display_name",
      "email",
      "plan",
      "segment",
    ]);
  });

  it("preserves a null display_name", () => {
    const row = buildAppUsersInsert({
      email: "a@b.co",
      segment: "founder",
      account_type: "founder",
      plan: "founder_free",
      credits: 0,
      display_name: null,
    });
    expect(row.display_name).toBeNull();
  });
});
