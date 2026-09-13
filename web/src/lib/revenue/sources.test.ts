// S25-A — P&L figure resolution + source labels. Pins the precedence
// (connector snapshot → platform Stripe → manual/metrics → estimate), the
// Xero window semantics (COGS folded into Xero expenses, net = Xero net
// profit, period label), Stripe growth vs the ~90-day prior, and the exact
// label strings the UI prints.

import { describe, expect, it } from "vitest";
import type { ConnectorSnapshotRow } from "@/lib/connectors/snapshots";
import { formatShortDate, resolveRevenueFigures, sourceLabel, type ResolveFiguresInput } from "./sources";

function snap(provider: "stripe" | "xero", taken_at: string, metrics: Record<string, unknown>): ConnectorSnapshotRow {
  return { id: `${provider}-${taken_at}`, user_id: "u", project_id: "p", provider, taken_at, metrics, source: "resync" };
}

const BASE: ResolveFiguresInput = {
  stripeSnapshot: null,
  stripePrior: null,
  xeroSnapshot: null,
  platform: { hasStripe: false, mrr: 0, activeSubscriptions: 0, netRevenue12m: 0, refunds12m: 0 },
  manual: { total12m: 0, count: 0 },
  startupMetrics: { mrr: 0, burnRate: 0 },
  cogsEstimate: 60,
  monthlyGrowthPct: 0,
};

describe("labels", () => {
  it("formatShortDate is the Sydney calendar day; sourceLabel wording", () => {
    expect(formatShortDate("2026-09-03T02:00:00Z")).toBe("3 Sep");
    expect(formatShortDate("garbage")).toBe("");
    expect(sourceLabel("xero", "2026-09-03T02:00:00Z")).toBe("from Xero, 3 Sep");
    expect(sourceLabel("stripe_connect", "2026-09-03T02:00:00Z")).toBe("from Stripe, 3 Sep");
    expect(sourceLabel("stripe_connect")).toBe("from Stripe");
    expect(sourceLabel("stripe_platform")).toBe("from your BlockID Stripe payments");
    expect(sourceLabel("manual")).toBe("manual entries");
    expect(sourceLabel("startup_metrics")).toBe("from your metrics");
    expect(sourceLabel("estimate")).toBe("estimate");
    expect(sourceLabel("none")).toBe("no data yet");
  });
});

describe("resolveRevenueFigures — fallbacks (no connector data)", () => {
  it("nothing connected: zeros, estimate opex = 1.5 × COGS × 12, sources say so", () => {
    const f = resolveRevenueFigures(BASE);
    expect(f).toMatchObject({ mrr: 0, arr: 0, revenue: 0, cogs: 60, opex: 1080, monthlyOpex: 90, netIncome: -1140, period: "last 12 months" });
    expect(f.sources.mrr.kind).toBe("none");
    expect(f.sources.revenue.kind).toBe("none");
    expect(f.sources.cogs.label).toBe("estimate");
    expect(f.sources.opex.label).toBe("estimate");
    expect(f.sources.netIncome.kind).toBe("estimate");
  });

  it("platform Stripe customer + manual entries + startup_metrics burn rate (the pre-S25-A path)", () => {
    const f = resolveRevenueFigures({
      ...BASE,
      platform: { hasStripe: true, mrr: 99, activeSubscriptions: 1, netRevenue12m: 1188, refunds12m: 99 },
      manual: { total12m: 5000, count: 3 },
      startupMetrics: { mrr: 0, burnRate: 2000 },
      monthlyGrowthPct: 12.5,
    });
    expect(f).toMatchObject({ mrr: 99, arr: 1188, activeSubscriptions: 1, revenue: 6089, refunds: 99, cogs: 60, opex: 24000, monthlyOpex: 2000, growthPct: 12.5 });
    expect(f.sources.mrr.kind).toBe("stripe_platform");
    expect(f.sources.revenue.kind).toBe("stripe_platform");
    expect(f.sources.opex.kind).toBe("startup_metrics");
    expect(f.sources.growth.kind).toBe("stripe_platform");
  });

  it("manual-only revenue is labelled manual entries; metrics MRR is used when no Stripe", () => {
    const f = resolveRevenueFigures({ ...BASE, manual: { total12m: 5000, count: 2 }, startupMetrics: { mrr: 400, burnRate: 0 } });
    expect(f.sources.revenue.label).toBe("manual entries");
    expect(f.sources.mrr.label).toBe("from your metrics");
    expect(f.mrr).toBe(400);
  });
});

describe("resolveRevenueFigures — connector snapshots win", () => {
  const stripeNow = snap("stripe", "2026-09-07T05:00:00Z", { mrrAud: 8200, activeSubscriptions: 41, churnRate90dPct: 2.4 });
  const stripePrior = snap("stripe", "2026-06-01T05:00:00Z", { mrrAud: 6560 });
  const xero = snap("xero", "2026-09-03T02:00:00Z", { totalIncomeAud: 27000, totalExpensesAud: 19500, netProfitAud: 7500, windowMonths: 3, bankBalanceAud: 42100 });

  it("Stripe Connect beats the platform lookup for MRR/ARR/subscriptions and growth is vs the 90-day prior", () => {
    const f = resolveRevenueFigures({
      ...BASE,
      stripeSnapshot: stripeNow,
      stripePrior,
      platform: { hasStripe: true, mrr: 99, activeSubscriptions: 1, netRevenue12m: 1188, refunds12m: 0 },
      monthlyGrowthPct: -3,
    });
    expect(f).toMatchObject({ mrr: 8200, arr: 98400, activeSubscriptions: 41, growthPct: 25 });
    expect(f.sources.mrr).toEqual({ kind: "stripe_connect", label: "from Stripe, 7 Sep", takenAt: "2026-09-07T05:00:00Z" });
    expect(f.sources.arr).toEqual(f.sources.mrr);
    expect(f.sources.activeSubscriptions.kind).toBe("stripe_connect");
    expect(f.sources.growth.label).toBe("vs 1 Jun, from Stripe");
    // Revenue still the 12-month platform line (no Xero) — labelled as such.
    expect(f.revenue).toBe(1188);
    expect(f.sources.revenue.kind).toBe("stripe_platform");
  });

  it("Xero provides the P&L actuals: revenue/opex/net from the 3-month window, COGS folded into Xero expenses, period label", () => {
    const f = resolveRevenueFigures({
      ...BASE,
      xeroSnapshot: xero,
      platform: { hasStripe: true, mrr: 99, activeSubscriptions: 1, netRevenue12m: 1188, refunds12m: 40 },
      manual: { total12m: 5000, count: 1 },
      startupMetrics: { mrr: 0, burnRate: 2000 },
    });
    expect(f).toMatchObject({
      revenue: 27000, refunds: 0, cogs: 0, grossMargin: 27000, grossMarginPct: 100, opex: 19500, monthlyOpex: 6500, netIncome: 7500,
      period: "3 months to 3 Sep",
      // MRR: no Stripe snapshot → Xero income ÷ 3 beats the platform's A$99.
      mrr: 9000, arr: 108000,
    });
    expect(f.sources.revenue.label).toBe("from Xero, 3 Sep");
    expect(f.sources.opex.label).toBe("from Xero, 3 Sep");
    expect(f.sources.netIncome.label).toBe("from Xero, 3 Sep");
    expect(f.sources.cogs.label).toBe("included in Xero expenses, 3 Sep");
    expect(f.sources.mrr.label).toBe("from Xero, 3 Sep");
  });

  it("Stripe + Xero together: Stripe owns MRR/subs/growth, Xero owns the P&L", () => {
    const f = resolveRevenueFigures({ ...BASE, stripeSnapshot: stripeNow, stripePrior, xeroSnapshot: xero });
    expect(f.mrr).toBe(8200);
    expect(f.sources.mrr.kind).toBe("stripe_connect");
    expect(f.revenue).toBe(27000);
    expect(f.sources.revenue.kind).toBe("xero");
    expect(f.growthPct).toBe(25);
  });

  it("Xero without a net-profit figure derives net = income − expenses; no prior → growth falls back to the monthly series", () => {
    const f = resolveRevenueFigures({
      ...BASE,
      stripeSnapshot: stripeNow,
      xeroSnapshot: snap("xero", "2026-09-03T02:00:00Z", { totalIncomeAud: 1000, totalExpensesAud: 250, windowMonths: 3 }),
      monthlyGrowthPct: 4,
    });
    expect(f.netIncome).toBe(750);
    expect(f.growthPct).toBe(4);
    expect(f.sources.growth.kind).toBe("manual");
  });
});
