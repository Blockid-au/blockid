// S25-A — P&L figure resolution + source labels for `api/revenue`.
//
// Roadmap-v2 reconciliation 2026-09-11, "Real-time P&L dashboard (partial:
// reads the platform's own Stripe, not connector data)": the dashboard
// looked up the FOUNDER as a customer of BlockID's own Stripe account and
// called that "revenue". This module decides, per figure, which store wins
// and stamps every number with where it came from so the UI can print
// "from Xero, 3 Sep" / "from Stripe, 3 Sep" / "manual entries" / "estimate"
// next to it.
//
// Precedence (highest first)
//   MRR / ARR / subscriptions   Stripe Connect snapshot → Xero (income ÷ 3)
//                               → platform Stripe customer → startup_metrics
//                               A zero / absent Stripe MRR is "no figure"
//                               (a connected account with no subscriptions
//                               yet must not hide Xero income), so it falls
//                               through exactly like a missing snapshot.
//   Revenue (P&L top line)      Xero 3-month income → platform charges +
//                               manual revenue_entries (12 months)
//   COGS                        always the AI/infra estimate — except with
//                               Xero, where it is inside Xero's expenses (0)
//   Opex                        Xero 3-month expenses → bank CSV burn × 12
//                               (S28-C) → burn rate × 12 → 1.5 × COGS
//                               estimate × 12 — the first three ARE
//                               `pickBurnRate` (S29-hardening), the one
//                               burn precedence every route shares
//   Net income                  Xero net profit → gross margin − opex
//
//   S28-C: `bankCsv` (categorised bank_transactions, lib/expenses/server.ts
//   `bankCsvFigures`) is the "manual / estimate" fallback source — after the
//   connectors, before startup_metrics — for MRR (average monthly income),
//   revenue (when neither the platform Stripe nor manual entries have any)
//   and opex (average monthly spend). Label: "from bank CSV, 3 Sep".
//   Growth                      Stripe snapshot vs its ~90-day prior →
//                               month-over-month from the monthly series
//
// Pure: no I/O, no Date.now().

import type { ConnectorSnapshotRow } from "@/lib/connectors/snapshots";
import { snapshotMrrAud } from "@/lib/connectors/snapshots";

export type RevenueSourceKind =
  | "xero"
  | "stripe_connect"
  | "stripe_platform"
  | "manual"
  | "bank_csv"
  | "startup_metrics"
  | "estimate"
  | "none";

export interface RevenueSource {
  kind: RevenueSourceKind;
  /** Human label the UI prints under the figure. */
  label: string;
  /** ISO timestamp of the connector pull the figure came from, when any. */
  takenAt: string | null;
}

// Numeric parts + our own month table: ICU renders en-AU September as
// "Sept" in some Node builds, and the label must be stable across deploys.
const SYDNEY_PARTS = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "numeric", timeZone: "Australia/Sydney" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "3 Sep" — Sydney calendar day of an ISO timestamp; "" when unparsable. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "";
  const parts = SYDNEY_PARTS.formatToParts(t);
  const day = parts.find((p) => p.type === "day")?.value;
  const month = Number(parts.find((p) => p.type === "month")?.value);
  if (!day || !Number.isFinite(month) || month < 1 || month > 12) return "";
  return `${Number(day)} ${MONTHS[month - 1]}`;
}

export function sourceLabel(kind: RevenueSourceKind, takenAt: string | null = null): string {
  const when = formatShortDate(takenAt);
  switch (kind) {
    case "xero":
      return when ? `from Xero, ${when}` : "from Xero";
    case "stripe_connect":
      return when ? `from Stripe, ${when}` : "from Stripe";
    case "stripe_platform":
      return "from your BlockID Stripe payments";
    case "manual":
      return "manual entries";
    case "bank_csv":
      return when ? `from bank CSV, ${when}` : "from bank CSV";
    case "startup_metrics":
      return "from your metrics";
    case "estimate":
      return "estimate";
    case "none":
      return "no data yet";
  }
}

export function source(kind: RevenueSourceKind, takenAt: string | null = null): RevenueSource {
  return { kind, label: sourceLabel(kind, takenAt), takenAt };
}

export interface ResolveFiguresInput {
  stripeSnapshot: ConnectorSnapshotRow | null;
  /** Stripe snapshot ~90 days before `stripeSnapshot` (growth baseline). */
  stripePrior: ConnectorSnapshotRow | null;
  xeroSnapshot: ConnectorSnapshotRow | null;
  /** The platform's own Stripe: the founder as a BlockID customer. */
  platform: { hasStripe: boolean; mrr: number; activeSubscriptions: number; netRevenue12m: number; refunds12m: number };
  manual: { total12m: number; count: number };
  startupMetrics: { mrr: number; burnRate: number };
  /**
   * S28-C — categorised bank lines (lib/expenses/server.ts `bankCsvFigures`),
   * or null / absent when the project has imported none.
   */
  bankCsv?: BankCsvInput | null;
  /** AI + infra cost estimate (COGS) for the platform-side P&L. */
  cogsEstimate: number;
  /** Month-over-month growth from the monthly series (already computed). */
  monthlyGrowthPct: number;
}

export interface BankCsvInput {
  /** Average monthly operating spend over the months with data. */
  monthlyOpex: number;
  /** Average monthly income (revenue + grants) — the P&L top line, never MRR. */
  monthlyIncome: number;
  /**
   * S28-review P2: average monthly `revenue`-category income only (no
   * government grants) — the ONLY bank figure that may stand in for MRR.
   * Absent (a payload from before the fix) → the bank CSV does not set MRR.
   */
  monthlyRevenue?: number;
  /** Income over the whole window (≤ 12 months). */
  income: number;
  monthsWithData: number;
  /** Latest import (ISO) — the label date. */
  takenAt: string | null;
}

export interface RevenueFigures {
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  revenue: number;
  refunds: number;
  cogs: number;
  grossMargin: number;
  grossMarginPct: number;
  opex: number;
  monthlyOpex: number;
  netIncome: number;
  growthPct: number;
  /** "last 12 months" | "3 months to 3 Sep" */
  period: string;
  sources: {
    mrr: RevenueSource;
    arr: RevenueSource;
    activeSubscriptions: RevenueSource;
    revenue: RevenueSource;
    cogs: RevenueSource;
    opex: RevenueSource;
    netIncome: RevenueSource;
    growth: RevenueSource;
  };
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ── Burn rate (monthly opex) — the ONE precedence ─────────────────────────
//
// S29-hardening (S28 review #7): `/api/revenue` printed a metrics-first burn
// while `resolveRevenueFigures` put the bank CSV first for opex, so a founder
// with both saw two burn figures on one page. Every consumer — `/api/revenue`
// `burnRate`, `/api/pnl`, `/api/valuation`, `/api/valuation/vc` and the P&L
// opex line below — now goes through `pickBurnRate`:
//
//   connector Xero opex (expenses ÷ window months)
//     → bank CSV average monthly spend
//       → startup_metrics.burn_rate_aud (manual)
//         → none (0)
//
// A connector figure beats a founder-typed one because it is dated and
// reproducible; the bank CSV beats the manual metric for the same reason.
// The P&L's "estimate" (1.5 × COGS) is NOT part of the burn precedence — it
// only stands in for opex on the dashboard when nothing else exists, and a
// runway / valuation must never be built on it.

export const BURN_RATE_PRECEDENCE: readonly BurnRateSourceKind[] = ["xero", "bank_csv", "startup_metrics", "none"];

export type BurnRateSourceKind = Extract<RevenueSourceKind, "xero" | "bank_csv" | "startup_metrics" | "none">;

export interface BurnRateInput {
  /** Latest Xero snapshot (connector), or null when the project has none. */
  xeroSnapshot?: Pick<ConnectorSnapshotRow, "taken_at" | "metrics"> | null;
  /** Categorised bank lines (`bankCsvFigures`), or null when none imported. */
  bankCsv?: Pick<BankCsvInput, "monthlyOpex" | "monthsWithData" | "takenAt"> | null;
  /** `startup_metrics.burn_rate_aud` — the founder's manual entry. */
  metricBurn?: number | null;
}

export interface ResolvedBurnRate {
  /** Average monthly operating spend in AUD; 0 when `source` is "none". */
  burnRate: number;
  source: BurnRateSourceKind;
  /** The `RevenueSource` the UI prints under the figure. */
  sourceInfo: RevenueSource;
  takenAt: string | null;
}

/** Xero's average monthly expenses from a snapshot, or null when the snapshot has no usable expenses figure. */
export function xeroMonthlyOpex(snapshot: Pick<ConnectorSnapshotRow, "metrics"> | null | undefined): number | null {
  if (!snapshot) return null;
  const expenses = num(snapshot.metrics.totalExpensesAud);
  if (expenses === null || expenses <= 0) return null;
  const months = num(snapshot.metrics.windowMonths);
  return expenses / (months && months > 0 ? months : 3);
}

/** Pure: pick the monthly burn (opex) figure by the documented precedence. */
export function pickBurnRate(input: BurnRateInput): ResolvedBurnRate {
  const xero = xeroMonthlyOpex(input.xeroSnapshot);
  if (xero !== null) {
    const at = input.xeroSnapshot?.taken_at ?? null;
    return { burnRate: r2(xero), source: "xero", sourceInfo: source("xero", at), takenAt: at };
  }
  const bank = input.bankCsv && input.bankCsv.monthsWithData > 0 && input.bankCsv.monthlyOpex > 0 ? input.bankCsv : null;
  if (bank) {
    return { burnRate: r2(bank.monthlyOpex), source: "bank_csv", sourceInfo: source("bank_csv", bank.takenAt), takenAt: bank.takenAt };
  }
  const metric = num(input.metricBurn ?? null) ?? 0;
  if (metric > 0) {
    return { burnRate: r2(metric), source: "startup_metrics", sourceInfo: source("startup_metrics"), takenAt: null };
  }
  return { burnRate: 0, source: "none", sourceInfo: source("none"), takenAt: null };
}

export function resolveRevenueFigures(input: ResolveFiguresInput): RevenueFigures {
  const { stripeSnapshot, stripePrior, xeroSnapshot, platform, manual, startupMetrics } = input;
  const stripeAt = stripeSnapshot?.taken_at ?? null;
  const xeroAt = xeroSnapshot?.taken_at ?? null;
  const bank = input.bankCsv && input.bankCsv.monthsWithData > 0 ? input.bankCsv : null;
  const bankAt = bank?.takenAt ?? null;

  // ── MRR / ARR / subscriptions ────────────────────────────────────────────
  let mrr = 0;
  let mrrSource: RevenueSource;
  // S25-review-2 P3: `mrrAud: 0` (or negative / absent) is not a figure —
  // fall through to Xero, then the platform lookup, then startup_metrics.
  const stripeMrrRaw = stripeSnapshot ? snapshotMrrAud(stripeSnapshot) : null;
  const stripeMrr = stripeMrrRaw !== null && stripeMrrRaw > 0 ? stripeMrrRaw : null;
  const xeroMrr = xeroSnapshot ? snapshotMrrAud(xeroSnapshot) : null;
  if (stripeMrr !== null) {
    mrr = stripeMrr;
    mrrSource = source("stripe_connect", stripeAt);
  } else if (xeroMrr !== null) {
    mrr = xeroMrr;
    mrrSource = source("xero", xeroAt);
  } else if (platform.hasStripe && platform.mrr > 0) {
    mrr = platform.mrr;
    mrrSource = source("stripe_platform");
  } else if (bank && typeof bank.monthlyRevenue === "number" && bank.monthlyRevenue > 0) {
    // S28-review P2: revenue-category lines only — a grant received is
    // income on the P&L but not recurring revenue, so it never becomes MRR
    // (and never × 12 into an ARR multiple).
    mrr = bank.monthlyRevenue;
    mrrSource = source("bank_csv", bankAt);
  } else if (startupMetrics.mrr > 0) {
    mrr = startupMetrics.mrr;
    mrrSource = source("startup_metrics");
  } else {
    mrrSource = source("none");
  }

  let activeSubscriptions = 0;
  let subsSource: RevenueSource;
  const snapSubs = stripeSnapshot ? num(stripeSnapshot.metrics.activeSubscriptions) : null;
  if (snapSubs !== null) {
    activeSubscriptions = snapSubs;
    subsSource = source("stripe_connect", stripeAt);
  } else if (platform.hasStripe) {
    activeSubscriptions = platform.activeSubscriptions;
    subsSource = source("stripe_platform");
  } else {
    subsSource = source("none");
  }

  // ── Revenue / COGS / opex / net income ───────────────────────────────────
  const xeroIncome = xeroSnapshot ? num(xeroSnapshot.metrics.totalIncomeAud) : null;
  const xeroExpenses = xeroSnapshot ? num(xeroSnapshot.metrics.totalExpensesAud) : null;
  const xeroNet = xeroSnapshot ? num(xeroSnapshot.metrics.netProfitAud) : null;
  const xeroMonths = (xeroSnapshot ? num(xeroSnapshot.metrics.windowMonths) : null) ?? 3;

  let revenue: number;
  let refunds: number;
  let revenueSource: RevenueSource;
  let cogs: number;
  let cogsSource: RevenueSource;
  let opex: number;
  let monthlyOpex: number;
  let opexSource: RevenueSource;
  let netIncome: number;
  let netSource: RevenueSource;
  let period: string;

  if (xeroIncome !== null && xeroExpenses !== null) {
    revenue = xeroIncome;
    refunds = 0;
    revenueSource = source("xero", xeroAt);
    // Xero's operating expenses already include cost of sales — do not add
    // the platform-side estimate on top.
    cogs = 0;
    cogsSource = { kind: "xero", label: `included in Xero expenses${formatShortDate(xeroAt) ? `, ${formatShortDate(xeroAt)}` : ""}`, takenAt: xeroAt };
    opex = xeroExpenses;
    monthlyOpex = xeroExpenses / xeroMonths;
    opexSource = source("xero", xeroAt);
    netIncome = xeroNet ?? xeroIncome - xeroExpenses;
    netSource = source("xero", xeroAt);
    period = `${xeroMonths} months to ${formatShortDate(xeroAt) || "latest sync"}`;
  } else {
    revenue = platform.netRevenue12m + manual.total12m;
    refunds = platform.refunds12m;
    revenueSource =
      platform.hasStripe && platform.netRevenue12m > 0
        ? source("stripe_platform")
        : manual.count > 0
          ? source("manual")
          : source("none");
    // S28-C: no platform charges and no manual entries → the bank CSV's
    // income is the top line (revenue + grants received, ≤ 12 months).
    if (revenueSource.kind === "none" && bank && bank.income > 0) {
      revenue = bank.income;
      revenueSource = source("bank_csv", bankAt);
    }
    cogs = input.cogsEstimate;
    cogsSource = source("estimate");
    // S29-hardening: same precedence as every burn-rate consumer (no Xero
    // here — that branch is above): bank CSV → startup_metrics → estimate.
    const burn = pickBurnRate({ xeroSnapshot: null, bankCsv: bank, metricBurn: startupMetrics.burnRate });
    if (burn.source !== "none") {
      monthlyOpex = burn.burnRate;
      opexSource = burn.sourceInfo;
    } else {
      monthlyOpex = input.cogsEstimate * 1.5;
      opexSource = source("estimate");
    }
    opex = monthlyOpex * 12;
    netIncome = revenue - refunds - cogs - opex;
    netSource = opexSource.kind === "estimate" || revenueSource.kind === "none" ? source("estimate") : source(opexSource.kind, opexSource.takenAt);
    period = "last 12 months";
  }

  const netRevenue = r2(revenue - refunds);
  const grossMargin = r2(netRevenue - cogs);
  const grossMarginPct = netRevenue > 0 ? Math.round((grossMargin / netRevenue) * 10000) / 100 : 0;

  // ── Growth ───────────────────────────────────────────────────────────────
  let growthPct = input.monthlyGrowthPct;
  let growthSource: RevenueSource = source(input.monthlyGrowthPct !== 0 ? "manual" : "none");
  if (stripeSnapshot && stripePrior) {
    const prev = snapshotMrrAud(stripePrior);
    const cur = snapshotMrrAud(stripeSnapshot);
    if (prev !== null && prev > 0 && cur !== null) {
      growthPct = Math.round(((cur - prev) / prev) * 10000) / 100;
      growthSource = { kind: "stripe_connect", label: `vs ${formatShortDate(stripePrior.taken_at) || "90 days ago"}, from Stripe`, takenAt: stripeAt };
    }
  } else if (platform.hasStripe && input.monthlyGrowthPct !== 0) {
    growthSource = source("stripe_platform");
  }

  return {
    mrr: r2(mrr),
    arr: r2(mrr * 12),
    activeSubscriptions,
    revenue: netRevenue,
    refunds: r2(refunds),
    cogs: r2(cogs),
    grossMargin,
    grossMarginPct,
    opex: r2(opex),
    monthlyOpex: r2(monthlyOpex),
    netIncome: r2(netIncome),
    growthPct,
    period,
    sources: {
      mrr: mrrSource,
      arr: mrrSource,
      activeSubscriptions: subsSource,
      revenue: revenueSource,
      cogs: cogsSource,
      opex: opexSource,
      netIncome: netSource,
      growth: growthSource,
    },
  };
}
