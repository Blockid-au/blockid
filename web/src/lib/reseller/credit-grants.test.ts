import { describe, it, expect } from "vitest";
import {
  monthKey,
  computeMonthlyUsage,
  decideGrant,
  decideSandboxSpend,
  ceilSandboxCost,
  type ResellerCreditGrantRow,
} from "./credit-grants";

describe("monthKey", () => {
  it("returns YYYY-MM in UTC regardless of local TZ", () => {
    expect(monthKey(new Date("2026-07-21T14:00:00Z"))).toBe("2026-07");
    expect(monthKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(monthKey(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });

  it("uses UTC when local timezone would roll a day", () => {
    // 2026-08-01 09:30 in AEST is 2026-07-31 23:30 UTC — must remain 2026-07.
    const d = new Date(Date.UTC(2026, 6, 31, 23, 30, 0));
    expect(monthKey(d)).toBe("2026-07");
  });
});

describe("computeMonthlyUsage", () => {
  const row = (over: Partial<ResellerCreditGrantRow> = {}): ResellerCreditGrantRow => ({
    reseller_id: "r1",
    kind: "grant",
    amount: 100,
    month_key: "2026-07",
    over_budget: false,
    created_at: "2026-07-10T10:00:00Z",
    ...over,
  });

  it("sums grants + sandbox spend independently and skips other months", () => {
    const grants: ResellerCreditGrantRow[] = [
      row({ amount: 200 }),
      row({ amount: 500 }),
      row({ kind: "sandbox_spend", amount: -50, sandbox_project_id: "sp1" }),
      row({ kind: "sandbox_spend", amount: -75, sandbox_project_id: "sp1" }),
      row({ amount: 999, month_key: "2026-06" }),
      row({ kind: "sandbox_spend", amount: -999, month_key: "2026-06", sandbox_project_id: "sp1" }),
    ];
    expect(computeMonthlyUsage(grants, "2026-07")).toEqual({
      grant_credits_used: 700,
      sandbox_credits_used: 125,
      over_budget_grant_count: 0,
    });
  });

  it("counts over_budget grants distinctly", () => {
    const grants = [
      row({ amount: 100, over_budget: false }),
      row({ amount: 5000, over_budget: true }),
      row({ amount: 250, over_budget: true }),
    ];
    expect(computeMonthlyUsage(grants, "2026-07")).toEqual({
      grant_credits_used: 5350,
      sandbox_credits_used: 0,
      over_budget_grant_count: 2,
    });
  });

  it("returns zeroes when no grants match the month", () => {
    expect(computeMonthlyUsage([], "2026-07")).toEqual({
      grant_credits_used: 0,
      sandbox_credits_used: 0,
      over_budget_grant_count: 0,
    });
  });
});

describe("decideGrant", () => {
  const base = {
    monthly_credit_budget: 20_000,
    already_granted_this_month: 5_000,
    can_grant_credits: true,
  } as const;

  it("allows a grant that fits inside the remaining budget", () => {
    expect(decideGrant({ ...base, requested_amount: 1_000 })).toEqual({
      ok: true,
      over_budget: false,
    });
  });

  it("allows exactly the remaining budget as the final grant", () => {
    expect(decideGrant({ ...base, requested_amount: 15_000 })).toEqual({
      ok: true,
      over_budget: false,
    });
  });

  it("rejects an over-budget grant without admin approval", () => {
    expect(decideGrant({ ...base, requested_amount: 15_001 })).toEqual({
      ok: false,
      reason: "over_budget_requires_approval",
    });
  });

  it("allows an over-budget grant when admin has pre-approved", () => {
    expect(
      decideGrant({
        ...base,
        requested_amount: 15_001,
        admin_over_budget_approved: true,
      }),
    ).toEqual({ ok: true, over_budget: true });
  });

  it("rejects non-positive or non-integer amounts", () => {
    for (const amount of [0, -50, 3.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(decideGrant({ ...base, requested_amount: amount })).toEqual({
        ok: false,
        reason: "invalid_amount",
      });
    }
  });

  it("rejects when capability flag is off", () => {
    expect(
      decideGrant({ ...base, can_grant_credits: false, requested_amount: 100 }),
    ).toEqual({ ok: false, reason: "capability_disabled" });
  });

  it("with monthly_credit_budget=0, every grant requires admin approval", () => {
    const zeroBudget = {
      monthly_credit_budget: 0,
      already_granted_this_month: 0,
      can_grant_credits: true,
    };
    expect(decideGrant({ ...zeroBudget, requested_amount: 1 })).toEqual({
      ok: false,
      reason: "over_budget_requires_approval",
    });
    expect(
      decideGrant({ ...zeroBudget, requested_amount: 1, admin_over_budget_approved: true }),
    ).toEqual({ ok: true, over_budget: true });
  });
});

describe("decideSandboxSpend", () => {
  const now = new Date("2026-07-21T12:00:00Z");
  const sp = "sandbox-1";
  const other = "sandbox-2";

  const spend = (
    minutesAgo: number,
    amount: number,
    project = sp,
  ): ResellerCreditGrantRow => ({
    reseller_id: "r1",
    kind: "sandbox_spend",
    amount: -amount,
    month_key: monthKey(now),
    over_budget: false,
    sandbox_project_id: project,
    created_at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
  });

  it("allows a spend when both monthly and hourly windows have room", () => {
    expect(
      decideSandboxSpend({
        requested_amount: 20,
        monthly_sandbox_credits: 500,
        grants: [spend(30, 10), spend(20, 5)],
        sandbox_project_id: sp,
        now,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects when monthly cap is exceeded across the whole month", () => {
    const grants: ResellerCreditGrantRow[] = [];
    for (let i = 0; i < 10; i++) {
      grants.push({
        reseller_id: "r1",
        kind: "sandbox_spend",
        amount: -49,
        month_key: monthKey(now),
        over_budget: false,
        sandbox_project_id: sp,
        // Spread across days so the hourly window is not what triggers.
        created_at: new Date(now.getTime() - (i + 1) * 24 * 60 * 60_000).toISOString(),
      });
    }
    const result = decideSandboxSpend({
      requested_amount: 15,
      monthly_sandbox_credits: 500,
      grants,
      sandbox_project_id: sp,
      now,
    });
    expect(result).toEqual({
      ok: false,
      reason: "monthly_cap_reached",
      remaining_month: 10,
    });
  });

  it("rejects when hourly rate limit is breached (default 50)", () => {
    const result = decideSandboxSpend({
      requested_amount: 5,
      monthly_sandbox_credits: 500,
      // 48 credits already spent in the last 30 minutes -> only 2 headroom.
      grants: [spend(30, 48)],
      sandbox_project_id: sp,
      now,
    });
    expect(result).toEqual({
      ok: false,
      reason: "hourly_rate_limit",
      remaining_hour: 2,
    });
  });

  it("does not count sandbox spend from a different project against the hourly window", () => {
    const result = decideSandboxSpend({
      requested_amount: 40,
      monthly_sandbox_credits: 500,
      grants: [spend(15, 49, other)],
      sandbox_project_id: sp,
      now,
    });
    expect(result).toEqual({ ok: true });
  });

  it("does not count spend outside the last 60 minutes against the hourly window", () => {
    const result = decideSandboxSpend({
      requested_amount: 40,
      monthly_sandbox_credits: 500,
      grants: [spend(61, 49)],
      sandbox_project_id: sp,
      now,
    });
    expect(result).toEqual({ ok: true });
  });

  it("honours the hourly_limit override for stricter caps", () => {
    const result = decideSandboxSpend({
      requested_amount: 6,
      monthly_sandbox_credits: 500,
      grants: [spend(10, 20)],
      sandbox_project_id: sp,
      now,
      hourly_limit: 25,
    });
    expect(result).toEqual({
      ok: false,
      reason: "hourly_rate_limit",
      remaining_hour: 5,
    });
  });

  it("rejects non-positive or non-integer amounts", () => {
    for (const amount of [0, -1, 3.5, Number.NaN]) {
      expect(
        decideSandboxSpend({
          requested_amount: amount,
          monthly_sandbox_credits: 500,
          grants: [],
          sandbox_project_id: sp,
          now,
        }),
      ).toEqual({ ok: false, reason: "invalid_amount" });
    }
  });
});

describe("ceilSandboxCost", () => {
  it("rounds fractional feature costs up to the next whole credit", () => {
    expect(ceilSandboxCost(0.10)).toBe(1);
    expect(ceilSandboxCost(0.25)).toBe(1);
    expect(ceilSandboxCost(0.50)).toBe(1);
    expect(ceilSandboxCost(0.75)).toBe(1);
    expect(ceilSandboxCost(1.00)).toBe(1);
    expect(ceilSandboxCost(1.01)).toBe(2);
    expect(ceilSandboxCost(1.50)).toBe(2);
    expect(ceilSandboxCost(2.99)).toBe(3);
    expect(ceilSandboxCost(3)).toBe(3);
  });

  it("returns 0 when the cost is zero, negative, or non-finite so free features skip sandbox routing", () => {
    expect(ceilSandboxCost(0)).toBe(0);
    expect(ceilSandboxCost(-0.5)).toBe(0);
    expect(ceilSandboxCost(-1)).toBe(0);
    expect(ceilSandboxCost(Number.NaN)).toBe(0);
    expect(ceilSandboxCost(Number.POSITIVE_INFINITY)).toBe(0);
    expect(ceilSandboxCost(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});
