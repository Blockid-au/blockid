import "server-only";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PnLReport {
  period: string; // "2026-Q3"
  revenue: {
    mrr: number;
    creditSales: number;
    planSubscriptions: number;
    total: number;
  };
  expenses: {
    aiApiCosts: number; // Anthropic/OpenAI/Gemini
    hosting: number; // Supabase, Vercel
    marketing: number;
    legal: number;
    other: number;
    total: number;
  };
  grossProfit: number;
  grossMargin: number; // percentage
  netIncome: number;
  burnRate: number; // monthly
  runway: number; // months at current burn
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Generate a Profit & Loss report from raw inputs.
 *
 * @param params.revenue   Total revenue for the period (AUD)
 * @param params.expenses  Expense breakdown by category
 * @param params.cashOnHand  Current cash position (AUD) — used for runway calc
 * @param params.mrr       Optional MRR for breakdown (defaults to revenue / 3 for quarterly)
 * @param params.period    Optional period label (defaults to current quarter)
 */
export function generatePnL(params: {
  revenue: number;
  expenses: Record<string, number>;
  cashOnHand: number;
  mrr?: number;
  period?: string;
}): PnLReport {
  const { revenue, expenses, cashOnHand } = params;

  // Break down expense categories
  const aiApiCosts = expenses.aiApiCosts ?? expenses.ai ?? 0;
  const hosting = expenses.hosting ?? expenses.infra ?? 0;
  const marketing = expenses.marketing ?? 0;
  const legal = expenses.legal ?? 0;
  const other = expenses.other ?? 0;
  const totalExpenses = round2(aiApiCosts + hosting + marketing + legal + other);

  // P&L calculations
  const grossProfit = round2(revenue - aiApiCosts - hosting);
  const grossMargin = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0;
  const netIncome = round2(revenue - totalExpenses);

  // Burn rate: monthly expenses (annualize and divide by 12 if quarterly)
  const monthlyExpenses = round2(totalExpenses / 3); // Assume quarterly
  const burnRate = netIncome < 0 ? Math.abs(round2(netIncome / 3)) : 0;

  // Runway: months until cash runs out at current monthly burn
  const runway =
    burnRate > 0 ? Math.floor(cashOnHand / burnRate) : cashOnHand > 0 ? 999 : 0;

  // MRR breakdown
  const mrr = params.mrr ?? round2(revenue / 3);

  // Period label
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  const period = params.period ?? `${now.getFullYear()}-Q${quarter}`;

  return {
    period,
    revenue: {
      mrr,
      creditSales: round2(mrr * 0.3), // Estimate: ~30% from credit sales
      planSubscriptions: round2(mrr * 0.7), // Estimate: ~70% from plan subscriptions
      total: round2(revenue),
    },
    expenses: {
      aiApiCosts: round2(aiApiCosts),
      hosting: round2(hosting),
      marketing: round2(marketing),
      legal: round2(legal),
      other: round2(other),
      total: totalExpenses,
    },
    grossProfit,
    grossMargin,
    netIncome,
    burnRate,
    runway,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
