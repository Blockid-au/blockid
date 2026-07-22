import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPE_VALUES,
  accountTypeLabel,
  isAccountType,
  type AccountType,
} from "./segments";

describe("account_type enum (P12.1)", () => {
  it("carries the seven P12 persona buckets alongside the legacy 0067 trio", () => {
    expect(ACCOUNT_TYPE_VALUES).toEqual([
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
    ]);
  });

  it("isAccountType narrows valid strings", () => {
    for (const v of ACCOUNT_TYPE_VALUES) {
      expect(isAccountType(v)).toBe(true);
    }
  });

  it("isAccountType rejects unknown values, null, undefined, and non-strings", () => {
    expect(isAccountType("lp")).toBe(false);
    expect(isAccountType("")).toBe(false);
    expect(isAccountType(null)).toBe(false);
    expect(isAccountType(undefined)).toBe(false);
    expect(isAccountType(42)).toBe(false);
    expect(isAccountType({})).toBe(false);
  });

  it("accountTypeLabel returns a human label per persona", () => {
    expect(accountTypeLabel("founder")).toBe("Founder");
    expect(accountTypeLabel("investor_angel")).toBe("Angel investor");
    expect(accountTypeLabel("investor_vc")).toBe("VC investor");
    expect(accountTypeLabel("advisor")).toBe("Advisor");
    expect(accountTypeLabel("accelerator")).toBe("Accelerator");
    expect(accountTypeLabel("incubator")).toBe("Incubator");
    expect(accountTypeLabel("reseller")).toBe("Reseller");
    expect(accountTypeLabel("affiliate")).toBe("Affiliate");
  });

  it("accountTypeLabel falls back to the raw slug when a runtime-only value slips in", () => {
    // Cast through unknown so TS still enforces the union everywhere else.
    expect(accountTypeLabel("mystery" as unknown as AccountType)).toBe("mystery");
  });
});
