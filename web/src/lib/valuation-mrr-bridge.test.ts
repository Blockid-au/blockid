// Colocated tests for the S17-B connected-revenue → valuation bridge.
//
// Pins the four behaviours the reconciliation asked for:
//   - overlap  → narrow to the overlap
//   - disjoint → widen to cover both + "connected revenue disagrees…" note
//   - stale    → signal > 90 days is ignored + noted, range unchanged
//   - zero MRR → unchanged, method stays "svi"
// plus: never below zero, latest-signal selection, sector multiples come from
// SECTOR_MULTIPLES (lib/agents/cfo-valuation.ts) via vcBenchmark().

import { describe, expect, it } from "vitest";
import { vcBenchmark } from "@/lib/agents/cfo-valuation";
import {
  CONNECTED_REVENUE_MAX_AGE_DAYS,
  DISAGREEMENT_NOTE,
  applyConnectedRevenueBridge,
  formatAudCompact,
  selectConnectedRevenue,
  type ConnectedRevenueSignal,
} from "./valuation-mrr-bridge";

const NOW = new Date("2026-09-11T00:00:00Z");
const FRESH = "2026-09-01T00:00:00Z"; // 10 days old
const STALE = "2026-05-01T00:00:00Z"; // 133 days old

function stripe(mrrAud: number, capturedAt = FRESH): ConnectedRevenueSignal {
  return { provider: "stripe", mrrAud, capturedAt };
}

describe("selectConnectedRevenue", () => {
  it("returns null with no signals", () => {
    expect(selectConnectedRevenue([], { now: NOW })).toEqual({ signal: null, ignored: [] });
  });

  it("drops non-positive MRR and stale signals, reporting each", () => {
    const { signal, ignored } = selectConnectedRevenue(
      [stripe(0), stripe(5000, STALE), { provider: "xero", mrrAud: -10, capturedAt: FRESH }],
      { now: NOW },
    );
    expect(signal).toBeNull();
    expect(ignored.map((i) => i.reason)).toEqual(["non_positive", "stale", "non_positive"]);
    expect(ignored[1].ageDays).toBeGreaterThan(CONNECTED_REVENUE_MAX_AGE_DAYS);
  });

  it("prefers the most recently captured usable signal", () => {
    const older = stripe(4000, "2026-08-01T00:00:00Z");
    const newer: ConnectedRevenueSignal = { provider: "xero", mrrAud: 6000, capturedAt: "2026-09-05T00:00:00Z" };
    expect(selectConnectedRevenue([older, newer], { now: NOW }).signal).toBe(newer);
  });

  it("treats exactly 90 days as still fresh", () => {
    const edge = stripe(1000, new Date(NOW.getTime() - 90 * 86_400_000).toISOString());
    expect(selectConnectedRevenue([edge], { now: NOW }).signal).toBe(edge);
  });
});

describe("applyConnectedRevenueBridge", () => {
  const svi = { lowAud: 1_000_000, midAud: 3_000_000, highAud: 5_000_000 };

  it("zero MRR / no signals → range unchanged, method 'svi', no note", () => {
    const out = applyConnectedRevenueBridge(svi, [stripe(0)], { sector: "saas", now: NOW });
    expect(out).toMatchObject({ ...svi, valuationMethod: "svi", methodNote: null, connectedRevenue: null });
    const none = applyConnectedRevenueBridge(svi, [], { now: NOW });
    expect(none).toMatchObject({ ...svi, valuationMethod: "svi", methodNote: null });
  });

  it("overlap → narrows to the overlap using the sector ARR multiple range", () => {
    // saas: 6.0–7.5× (SECTOR_MULTIPLES) · mrr 50k → arr 600k → 3.6M–4.5M
    const bm = vcBenchmark("saas");
    const out = applyConnectedRevenueBridge(svi, [stripe(50_000)], { sector: "saas", now: NOW });
    expect(out.valuationMethod).toBe("svi+arr_multiple");
    expect(out.methodNote).toBeNull();
    expect(out.lowAud).toBe(Math.round(600_000 * bm.arrMultiple.low));
    expect(out.highAud).toBe(Math.round(600_000 * bm.arrMultiple.high));
    expect(out.lowAud).toBeGreaterThanOrEqual(svi.lowAud);
    expect(out.highAud).toBeLessThanOrEqual(svi.highAud);
    // original mid (3.0M) sits outside the overlap → re-centred
    expect(out.midAud).toBe(Math.round((out.lowAud + out.highAud) / 2));
    expect(out.connectedRevenue).toMatchObject({
      provider: "stripe",
      mrrAud: 50_000,
      arrAud: 600_000,
      sector: "saas",
      multipleLow: bm.arrMultiple.low,
      multipleHigh: bm.arrMultiple.high,
      multipleSource: bm.source,
      relation: "overlap",
      label: "Includes connected revenue (A$50K MRR from Stripe)",
    });
  });

  it("overlap keeps the SVI midpoint when it still falls inside the narrowed range", () => {
    // default: 4–6× · mrr 60k → arr 720k → 2.88M–4.32M — mid 3.0M inside
    const out = applyConnectedRevenueBridge(svi, [stripe(60_000)], { now: NOW });
    expect(out.connectedRevenue?.sector).toBe("default");
    expect(out.midAud).toBe(3_000_000);
  });

  it("disjoint → widens to cover both ranges and flags the disagreement", () => {
    // saas 6–7.5× · mrr 200k → arr 2.4M → 14.4M–18M vs SVI 1M–5M
    const out = applyConnectedRevenueBridge(svi, [stripe(200_000)], { sector: "saas", now: NOW });
    expect(out.valuationMethod).toBe("svi+arr_multiple");
    expect(out.methodNote).toBe(DISAGREEMENT_NOTE);
    expect(out.lowAud).toBe(1_000_000);
    expect(out.highAud).toBe(18_000_000);
    expect(out.connectedRevenue?.relation).toBe("disjoint");
    expect(out.midAud).toBe(3_000_000); // still inside the widened range
  });

  it("disjoint below the SVI range widens downwards too", () => {
    // default 4–6× · mrr 5k → arr 60k → 240k–360k vs SVI 1M–5M
    const out = applyConnectedRevenueBridge(svi, [stripe(5_000)], { now: NOW });
    expect(out.lowAud).toBe(240_000);
    expect(out.highAud).toBe(5_000_000);
    expect(out.methodNote).toBe(DISAGREEMENT_NOTE);
  });

  it("stale signal (> 90 days) is ignored and noted; range unchanged", () => {
    const out = applyConnectedRevenueBridge(svi, [stripe(50_000, STALE)], { sector: "saas", now: NOW });
    expect(out).toMatchObject({ ...svi, valuationMethod: "svi", connectedRevenue: null });
    expect(out.methodNote).toContain("older than 90 days");
    expect(out.methodNote).toContain("Stripe");
    expect(out.ignoredSignals).toHaveLength(1);
  });

  it("uses the fresh signal and still notes the stale one", () => {
    const out = applyConnectedRevenueBridge(
      svi,
      [stripe(50_000, FRESH), { provider: "xero", mrrAud: 40_000, capturedAt: STALE }],
      { sector: "saas", now: NOW },
    );
    expect(out.valuationMethod).toBe("svi+arr_multiple");
    expect(out.connectedRevenue?.provider).toBe("stripe");
    expect(out.methodNote).toContain("Xero");
  });

  it("never returns a bound below zero", () => {
    const out = applyConnectedRevenueBridge(
      { lowAud: -500_000, midAud: -100_000, highAud: 100_000 },
      [stripe(1_000)],
      { now: NOW },
    );
    expect(out.lowAud).toBeGreaterThanOrEqual(0);
    expect(out.midAud).toBeGreaterThanOrEqual(0);
    expect(out.highAud).toBeGreaterThanOrEqual(out.lowAud);
    const none = applyConnectedRevenueBridge({ lowAud: -1, midAud: -1, highAud: -1 }, [], { now: NOW });
    expect(none).toMatchObject({ lowAud: 0, midAud: 0, highAud: 0 });
  });

  it("unknown sector falls back to the default multiples", () => {
    const out = applyConnectedRevenueBridge(svi, [stripe(60_000)], { sector: "underwater-basket-weaving", now: NOW });
    expect(out.connectedRevenue?.sector).toBe("default");
    expect(out.connectedRevenue?.multipleLow).toBe(vcBenchmark("default").arrMultiple.low);
  });
});

describe("S25-A sviContribution — the bridge and the rescore route read the same table", () => {
  const svi = { lowAud: 500_000, midAud: 1_000_000, highAud: 2_000_000 };

  it("carries the TRE points for the selected signal (tier + growth + churn, fresh ×1)", () => {
    const out = applyConnectedRevenueBridge(
      svi,
      [{ provider: "stripe", mrrAud: 8_200, capturedAt: FRESH, priorMrrAud: 7_321, churnRate90dPct: 2.1, origin: "connector_snapshot" }],
      { now: NOW },
    );
    expect(out.connectedRevenue?.sviContribution).toMatchObject({ points: 13, tier: "1k_10k", tierPoints: 10, growthPoints: 3, churnPoints: 0, decay: 1 });
    expect(out.connectedRevenue?.sviContribution.breakdown).toMatch(/→ \+13 TRE$/);
  });

  it("a legacy signal without history scores the tier alone", () => {
    const out = applyConnectedRevenueBridge(svi, [stripe(60_000)], { now: NOW });
    expect(out.connectedRevenue?.sviContribution).toMatchObject({ points: 20, growthPct: null, churnRate90dPct: null });
  });
});

describe("formatAudCompact", () => {
  it("formats thousands, millions and billions compactly", () => {
    expect(formatAudCompact(0)).toBe("A$0");
    expect(formatAudCompact(950)).toBe("A$950");
    expect(formatAudCompact(8_200)).toBe("A$8.2K");
    expect(formatAudCompact(50_000)).toBe("A$50K");
    expect(formatAudCompact(250_000)).toBe("A$250K");
    expect(formatAudCompact(1_460_000)).toBe("A$1.5M");
    expect(formatAudCompact(2_000_000_000)).toBe("A$2.0B");
    expect(formatAudCompact(-12_000)).toBe("-A$12K");
    expect(formatAudCompact(Number.NaN)).toBe("—");
  });
});
