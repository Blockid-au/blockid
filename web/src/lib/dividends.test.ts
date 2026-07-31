// Vitest coverage for `web/src/lib/dividends.ts` — the pure Australian
// franked-dividend calculator consumed by (i) `src/app/api/dividends/route.ts`
// (Phase 7 dividend endpoint hit by the Revenue + Dividends founder pages)
// and (ii) the `/workspace/dividends` + `/workspace/revenue` UIs that read
// its `DividendResult` envelope verbatim.
//
// Closes the "no colocated test" gap on a load-bearing money-math lib:
// franking-credit drift, guard-branch drift, or perShareDividend precision
// drift silently corrupts every founder-facing payout number, and the
// resulting numbers flow into cap-table tokenisation + ATO franking-account
// reporting downstream — a signage or rounding regression here is a Phase 7
// compliance surface, not a display glitch. The suite pins the AU imputation
// formula (`gross × taxRate/(1−taxRate)`), the four zero-branch guards
// (netIncome ≤ 0, distributionPct ≤ 0, distributionPct clamped >100,
// totalShares ≤ 0), and the alt-shape `calculateDividend` wrapper's role +
// param-rename contract.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  calculateDividend,
  calculateDividends,
  type DividendPolicy,
  type DividendResult,
} from "./dividends";

// ─── fixtures ────────────────────────────────────────────────────────────

const THREE_HOLDER_POLICY: DividendPolicy = {
  netIncome: 1_000_000,
  distributionPct: 50,
  totalShares: 10_000_000,
  shareholders: [
    { name: "Founder A", shares: 6_000_000, role: "founder" },
    { name: "Founder B", shares: 3_000_000, role: "founder" },
    { name: "Angel 1", shares: 1_000_000, role: "angel" },
  ],
};

function findPayout(res: DividendResult, name: string) {
  const p = res.payouts.find((p) => p.name === name);
  if (!p) throw new Error(`payout missing for ${name}`);
  return p;
}

// ─── date freeze ─────────────────────────────────────────────────────────
// The result envelope stamps exDividendDate + paymentDate off Date.now(),
// so freeze the clock to make those two fields deterministic across CI.
const FROZEN = new Date("2026-03-15T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── calculateDividends — happy path ─────────────────────────────────────

describe("calculateDividends — happy path", () => {
  it("totalDividend = netIncome × distributionPct/100", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    expect(res.totalDividend).toBe(500_000);
  });

  it("perShareDividend = totalDividend / totalShares (round6)", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    expect(res.perShareDividend).toBe(0.05);
  });

  it("retainedEarnings = netIncome − totalDividend", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    expect(res.retainedEarnings).toBe(500_000);
  });

  it("emits one payout per shareholder in input order", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    expect(res.payouts.map((p) => p.name)).toEqual([
      "Founder A",
      "Founder B",
      "Angel 1",
    ]);
  });

  it("payouts.grossDividend sums back to totalDividend (no leakage)", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    const sum = res.payouts.reduce((a, p) => a + p.grossDividend, 0);
    expect(sum).toBeCloseTo(res.totalDividend, 2);
  });

  it("netDividend equals grossDividend for a fully franked payout", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    for (const p of res.payouts) expect(p.netDividend).toBe(p.grossDividend);
  });

  it("frankingRate is echoed back from policy default (0.25)", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    expect(res.frankingRate).toBe(0.25);
  });

  it("ownershipPct rounds to 2dp and sums ~100 across the register", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    const founderA = findPayout(res, "Founder A");
    const founderB = findPayout(res, "Founder B");
    const angel = findPayout(res, "Angel 1");
    expect(founderA.ownershipPct).toBe(60);
    expect(founderB.ownershipPct).toBe(30);
    expect(angel.ownershipPct).toBe(10);
    const sum = res.payouts.reduce((a, p) => a + p.ownershipPct, 0);
    expect(sum).toBeCloseTo(100, 2);
  });

  it("preserves shares + role from the input shareholder rows", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    const founderA = findPayout(res, "Founder A");
    expect(founderA.shares).toBe(6_000_000);
    expect(founderA.role).toBe("founder");
    expect(findPayout(res, "Angel 1").role).toBe("angel");
  });

  it("echoes distributionPct + netIncome so the UI can rerender without recomputing", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    expect(res.distributionPct).toBe(50);
    expect(res.netIncome).toBe(1_000_000);
  });
});

// ─── AU imputation formula (franking credits) ────────────────────────────

describe("calculateDividends — franking-credit formula (AU imputation)", () => {
  it("25% base rate: gross × (0.25/0.75) — Founder A gets 300k gross, 100k credit", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    const founderA = findPayout(res, "Founder A");
    expect(founderA.grossDividend).toBe(300_000);
    // 300_000 × 1/3 = 100_000.00 (round2)
    expect(founderA.frankingCredit).toBe(100_000);
  });

  it("30% full corporate rate: gross × (0.30/0.70) = gross × 3/7", () => {
    const res = calculateDividends({
      ...THREE_HOLDER_POLICY,
      companyTaxRate: 0.3,
    });
    const angel = findPayout(res, "Angel 1");
    expect(angel.grossDividend).toBe(50_000);
    // 50_000 × 3/7 ≈ 21428.57 (round2)
    expect(angel.frankingCredit).toBeCloseTo(21_428.57, 2);
    expect(res.frankingRate).toBe(0.3);
  });

  it("aggregate frankingCredits = totalDividend × frankingMultiplier", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    // totalDividend 500_000 × 1/3 = 166_666.67
    expect(res.frankingCredits).toBeCloseTo(166_666.67, 2);
  });

  it("aggregate frankingCredits at 30% rate matches gross × 3/7", () => {
    const res = calculateDividends({
      ...THREE_HOLDER_POLICY,
      companyTaxRate: 0.3,
    });
    expect(res.frankingCredits).toBeCloseTo(500_000 * (3 / 7), 1);
  });

  it("zero-tax-rate company (0%) produces zero franking credits", () => {
    const res = calculateDividends({
      ...THREE_HOLDER_POLICY,
      companyTaxRate: 0,
    });
    expect(res.frankingCredits).toBe(0);
    for (const p of res.payouts) expect(p.frankingCredit).toBe(0);
    // gross dividend is unaffected by tax rate
    expect(res.totalDividend).toBe(500_000);
  });
});

// ─── clamping + guards ───────────────────────────────────────────────────

describe("calculateDividends — clamping + zero-payout guards", () => {
  it("clamps distributionPct > 100 down to 100 (full payout)", () => {
    const res = calculateDividends({
      ...THREE_HOLDER_POLICY,
      distributionPct: 150,
    });
    expect(res.distributionPct).toBe(100);
    expect(res.totalDividend).toBe(1_000_000);
    expect(res.retainedEarnings).toBe(0);
  });

  it("distributionPct = 0 short-circuits to the zero-payout envelope", () => {
    const res = calculateDividends({
      ...THREE_HOLDER_POLICY,
      distributionPct: 0,
    });
    expect(res.totalDividend).toBe(0);
    expect(res.frankingCredits).toBe(0);
    for (const p of res.payouts) {
      expect(p.grossDividend).toBe(0);
      expect(p.netDividend).toBe(0);
      expect(p.frankingCredit).toBe(0);
    }
    // ownershipPct is still populated because totalShares > 0
    expect(findPayout(res, "Founder A").ownershipPct).toBe(60);
    // and the retained-earnings mirror leaves the full profit undistributed
    expect(res.retainedEarnings).toBe(1_000_000);
  });

  it("negative distributionPct hits the ≤ 0 guard, not the negative-clamp branch", () => {
    const res = calculateDividends({
      ...THREE_HOLDER_POLICY,
      distributionPct: -10,
    });
    expect(res.totalDividend).toBe(0);
    // distributionPct echoed as-is inside the guard branch (not clamped)
    expect(res.distributionPct).toBe(-10);
  });

  it("netIncome = 0 short-circuits without dividing by zero", () => {
    const res = calculateDividends({ ...THREE_HOLDER_POLICY, netIncome: 0 });
    expect(res.totalDividend).toBe(0);
    expect(res.retainedEarnings).toBe(0);
    expect(res.netIncome).toBe(0);
  });

  it("netIncome < 0 → zero payouts and retainedEarnings floored at 0", () => {
    const res = calculateDividends({
      ...THREE_HOLDER_POLICY,
      netIncome: -250_000,
    });
    expect(res.totalDividend).toBe(0);
    expect(res.retainedEarnings).toBe(0); // Math.max(0, -250_000)
    expect(res.netIncome).toBe(-250_000); // echoed raw
  });

  it("totalShares = 0 → guard, and ownershipPct also collapses to 0", () => {
    const res = calculateDividends({ ...THREE_HOLDER_POLICY, totalShares: 0 });
    expect(res.totalDividend).toBe(0);
    for (const p of res.payouts) expect(p.ownershipPct).toBe(0);
    // frankingRate still stamped so the UI can render the tax band
    expect(res.frankingRate).toBe(0.25);
  });

  it("guard-branch payouts still carry name + role + shares from input", () => {
    const res = calculateDividends({ ...THREE_HOLDER_POLICY, netIncome: 0 });
    expect(res.payouts.map((p) => p.name)).toEqual([
      "Founder A",
      "Founder B",
      "Angel 1",
    ]);
    expect(findPayout(res, "Founder A").shares).toBe(6_000_000);
    expect(findPayout(res, "Angel 1").role).toBe("angel");
  });
});

// ─── date envelope + degenerate registers ────────────────────────────────

describe("calculateDividends — date envelope + degenerate registers", () => {
  it("exDividendDate = 14 days from now (UTC-anchored, YYYY-MM-DD)", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    // FROZEN = 2026-03-15, +14 days = 2026-03-29
    expect(res.exDividendDate).toBe("2026-03-29");
  });

  it("paymentDate = 30 days from now", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    // FROZEN = 2026-03-15, +30 days = 2026-04-14
    expect(res.paymentDate).toBe("2026-04-14");
  });

  it("date stamps also render inside the zero-payout guard branch", () => {
    const res = calculateDividends({ ...THREE_HOLDER_POLICY, netIncome: 0 });
    expect(res.exDividendDate).toBe("2026-03-29");
    expect(res.paymentDate).toBe("2026-04-14");
  });

  it("empty shareholders array → empty payouts, non-empty envelope math", () => {
    const res = calculateDividends({
      ...THREE_HOLDER_POLICY,
      shareholders: [],
    });
    // main-path branch — totalShares > 0 + netIncome > 0
    expect(res.payouts).toEqual([]);
    expect(res.totalDividend).toBe(500_000);
    expect(res.perShareDividend).toBe(0.05);
  });

  it("single-shareholder register: 100% ownership + full totalDividend to one holder", () => {
    const res = calculateDividends({
      netIncome: 400_000,
      distributionPct: 100,
      totalShares: 100,
      shareholders: [{ name: "Solo", shares: 100, role: "founder" }],
    });
    const solo = findPayout(res, "Solo");
    expect(solo.ownershipPct).toBe(100);
    expect(solo.grossDividend).toBe(400_000);
    expect(res.retainedEarnings).toBe(0);
  });

  it("zero-share holder inside a mixed register gets a 0 dividend + 0 ownership", () => {
    const res = calculateDividends({
      netIncome: 1_000_000,
      distributionPct: 100,
      totalShares: 1_000_000,
      shareholders: [
        { name: "Whale", shares: 1_000_000, role: "founder" },
        { name: "Ghost", shares: 0, role: "adviser" },
      ],
    });
    const ghost = findPayout(res, "Ghost");
    expect(ghost.shares).toBe(0);
    expect(ghost.grossDividend).toBe(0);
    expect(ghost.frankingCredit).toBe(0);
    expect(ghost.ownershipPct).toBe(0);
    expect(findPayout(res, "Whale").grossDividend).toBe(1_000_000);
  });
});

// ─── precision (round2 for AUD, round6 for perShareDividend) ─────────────

describe("calculateDividends — precision", () => {
  it("perShareDividend rounds to 6dp (sub-cent per-share values keep 6-digit tail)", () => {
    // 100 / 7 = 14.285714… → round6
    const res = calculateDividends({
      netIncome: 200,
      distributionPct: 100,
      totalShares: 7,
      shareholders: [{ name: "Solo", shares: 7, role: "founder" }],
    });
    expect(res.perShareDividend).toBeCloseTo(28.571429, 6);
    // grossDividend rounds to 2dp so 7 × 28.571429 = 199.999998 → 200
    expect(findPayout(res, "Solo").grossDividend).toBeCloseTo(200, 2);
  });

  it("ownershipPct rounds to 2dp even when register produces repeating decimals", () => {
    const res = calculateDividends({
      netIncome: 3,
      distributionPct: 100,
      totalShares: 3,
      shareholders: [
        { name: "A", shares: 1, role: "founder" },
        { name: "B", shares: 1, role: "founder" },
        { name: "C", shares: 1, role: "founder" },
      ],
    });
    for (const p of res.payouts) expect(p.ownershipPct).toBe(33.33);
  });

  it("frankingCredit and grossDividend are numeric (never NaN) for the standard fixture", () => {
    const res = calculateDividends(THREE_HOLDER_POLICY);
    for (const p of res.payouts) {
      expect(Number.isFinite(p.grossDividend)).toBe(true);
      expect(Number.isFinite(p.frankingCredit)).toBe(true);
      expect(Number.isFinite(p.netDividend)).toBe(true);
      expect(Number.isFinite(p.ownershipPct)).toBe(true);
    }
  });
});

// ─── calculateDividend wrapper (alt Phase-7 interface) ───────────────────

describe("calculateDividend — alt Phase 7 wrapper", () => {
  it("maps policyPercent → distributionPct + defaults role to 'shareholder'", () => {
    const res = calculateDividend({
      netIncome: 1_000_000,
      policyPercent: 50,
      totalShares: 10_000_000,
      shareholders: [
        { name: "Alice", shares: 6_000_000 },
        { name: "Bob", shares: 4_000_000 },
      ],
    });
    expect(res.distributionPct).toBe(50);
    for (const p of res.payouts) expect(p.role).toBe("shareholder");
    expect(findPayout(res, "Alice").grossDividend).toBe(300_000);
    expect(findPayout(res, "Bob").grossDividend).toBe(200_000);
  });

  it("threads companyTaxRate through to the imputation multiplier", () => {
    const res = calculateDividend({
      netIncome: 1_000_000,
      policyPercent: 50,
      totalShares: 10_000_000,
      shareholders: [{ name: "Alice", shares: 10_000_000 }],
      companyTaxRate: 0.3,
    });
    expect(res.frankingRate).toBe(0.3);
    // gross 500_000 × 3/7 ≈ 214_285.71
    expect(findPayout(res, "Alice").frankingCredit).toBeCloseTo(214_285.71, 2);
  });

  it("omitting companyTaxRate falls through to the 25% base-rate default", () => {
    const res = calculateDividend({
      netIncome: 1_000_000,
      policyPercent: 50,
      totalShares: 10_000_000,
      shareholders: [{ name: "Alice", shares: 10_000_000 }],
    });
    expect(res.frankingRate).toBe(0.25);
  });

  it("passes zero-payout guards through unchanged (policyPercent = 0)", () => {
    const res = calculateDividend({
      netIncome: 1_000_000,
      policyPercent: 0,
      totalShares: 10_000_000,
      shareholders: [{ name: "Alice", shares: 10_000_000 }],
    });
    expect(res.totalDividend).toBe(0);
    expect(res.retainedEarnings).toBe(1_000_000);
    expect(findPayout(res, "Alice").role).toBe("shareholder");
  });
});
