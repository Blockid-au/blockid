// S28-C — monthly P&L by category, burn rate, top merchants and a GST
// estimate from categorised bank lines. Pure: no I/O, no Date.now() (the
// caller passes the window). Client-safe.
//
// P&L treatment follows lib/expenses/categories.ts `kind`:
//   income   revenue, government_grants                      → income
//   expense  everything else except…                        → operating spend
//   neutral  transfer, owner_drawings                        → ignored (not P&L)
//
// GST estimate (flagged "estimate" everywhere it is shown): for a GST-
// registered business, 1/11 of GST-inclusive sales is GST collected and
// 1/11 of GST-treated purchases is a credit; gst_free / input_taxed /
// unknown lines carry no GST. General information only — the BAS is
// prepared from tax invoices, not from a bank feed.

import { categoryKind, categoryLabel, isExpenseCategory, type ExpenseCategory, type GstTreatment } from "./categories";

export interface SummaryRow {
  occurredOn: string;
  amountAud: number;
  category: string;
  counterparty: string | null;
  gstTreatment: GstTreatment | string;
  needsReview: boolean;
}

export interface MonthBucket {
  /** YYYY-MM */
  month: string;
  income: number;
  expenses: number;
  net: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
}

export interface MerchantTotal {
  counterparty: string;
  category: ExpenseCategory;
  label: string;
  total: number;
  count: number;
}

export interface GstEstimate {
  estimate: true;
  gstOnSales: number;
  gstCreditsOnPurchases: number;
  /** Positive = likely payable, negative = likely refundable. */
  netPosition: number;
  gstTreatedPurchases: number;
  note: string;
}

export interface ExpenseSummary {
  from: string;
  to: string;
  rowCount: number;
  needsReviewCount: number;
  months: MonthBucket[];
  totals: { income: number; expenses: number; net: number; byCategory: Partial<Record<ExpenseCategory, number>> };
  /** Average monthly operating spend over the months that have data. */
  burnRateAud: number;
  /** Average monthly (spend − income); ≤ 0 means cash-flow positive. */
  netBurnAud: number;
  monthsWithData: number;
  topMerchants: MerchantTotal[];
  gst: GstEstimate;
}

export const GST_NOTE =
  "Estimate from bank lines using each category's usual GST treatment — not a BAS figure. Prepare your BAS from tax invoices or ask your accountant.";

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Inclusive YYYY-MM-DD window check on a YYYY-MM-DD string. */
export function inWindow(day: string, from?: string | null, to?: string | null): boolean {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function summariseTransactions(
  rows: readonly SummaryRow[],
  opts: { from?: string | null; to?: string | null; topN?: number } = {},
): ExpenseSummary {
  const topN = opts.topN ?? 8;
  const inRange = rows.filter((r) => inWindow(r.occurredOn, opts.from, opts.to));
  const months = new Map<string, MonthBucket>();
  const totalsByCategory: Partial<Record<ExpenseCategory, number>> = {};
  const merchants = new Map<string, MerchantTotal>();
  let income = 0;
  let expenses = 0;
  let gstSales = 0;
  let gstPurchases = 0;
  let gstTreatedPurchases = 0;
  let needsReview = 0;
  let minDay: string | null = null;
  let maxDay: string | null = null;

  for (const r of inRange) {
    if (r.needsReview) needsReview++;
    const cat: ExpenseCategory = isExpenseCategory(r.category) ? r.category : "other";
    const kind = categoryKind(cat);
    if (!minDay || r.occurredOn < minDay) minDay = r.occurredOn;
    if (!maxDay || r.occurredOn > maxDay) maxDay = r.occurredOn;
    if (kind === "neutral") continue;
    const monthKey = r.occurredOn.slice(0, 7);
    const bucket = months.get(monthKey) ?? { month: monthKey, income: 0, expenses: 0, net: 0, byCategory: {} };
    const amt = r.amountAud;
    if (kind === "income") {
      // A negative "revenue" line is a refund — it reduces income.
      bucket.income += amt;
      income += amt;
      if (r.gstTreatment === "gst") gstSales += amt / 11;
    } else {
      // Money out is negative; a positive expense line is a refund/credit.
      const spend = -amt;
      bucket.expenses += spend;
      expenses += spend;
      if (r.gstTreatment === "gst") {
        gstPurchases += spend / 11;
        gstTreatedPurchases += spend;
      }
      if (spend > 0) {
        const key = (r.counterparty ?? "").trim() || "unknown";
        const m = merchants.get(key) ?? { counterparty: key, category: cat, label: categoryLabel(cat), total: 0, count: 0 };
        m.total += spend;
        m.count += 1;
        merchants.set(key, m);
      }
    }
    // byCategory holds P&L magnitude: income positive, spend positive.
    const signed = kind === "income" ? amt : -amt;
    bucket.byCategory[cat] = (bucket.byCategory[cat] ?? 0) + signed;
    totalsByCategory[cat] = (totalsByCategory[cat] ?? 0) + signed;
    bucket.net = bucket.income - bucket.expenses;
    months.set(monthKey, bucket);
  }

  const monthList = [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      ...m,
      income: r2(m.income),
      expenses: r2(m.expenses),
      net: r2(m.income - m.expenses),
      byCategory: Object.fromEntries(Object.entries(m.byCategory).map(([k, v]) => [k, r2(v as number)])) as Partial<Record<ExpenseCategory, number>>,
    }));
  const monthsWithData = monthList.length;
  const burnRateAud = monthsWithData > 0 ? r2(expenses / monthsWithData) : 0;
  const netBurnAud = monthsWithData > 0 ? r2((expenses - income) / monthsWithData) : 0;

  const topMerchants = [...merchants.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, topN)
    .map((m) => ({ ...m, total: r2(m.total) }));

  return {
    from: opts.from ?? minDay ?? "",
    to: opts.to ?? maxDay ?? "",
    rowCount: inRange.length,
    needsReviewCount: needsReview,
    months: monthList,
    totals: {
      income: r2(income),
      expenses: r2(expenses),
      net: r2(income - expenses),
      byCategory: Object.fromEntries(Object.entries(totalsByCategory).map(([k, v]) => [k, r2(v as number)])) as Partial<Record<ExpenseCategory, number>>,
    },
    burnRateAud,
    netBurnAud,
    monthsWithData,
    topMerchants,
    gst: {
      estimate: true,
      gstOnSales: r2(gstSales),
      gstCreditsOnPurchases: r2(gstPurchases),
      netPosition: r2(gstSales - gstPurchases),
      gstTreatedPurchases: r2(gstTreatedPurchases),
      note: GST_NOTE,
    },
  };
}

/** Months of runway at the summary's burn: cash ÷ net burn (∞ → null when cash-flow positive). */
export function runwayMonths(cashAud: number, netBurnAud: number): number | null {
  if (!(cashAud > 0)) return 0;
  if (!(netBurnAud > 0)) return null;
  return Math.round((cashAud / netBurnAud) * 10) / 10;
}
