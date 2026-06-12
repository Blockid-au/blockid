// Financial Projection Engine for startup valuation
//
// Generates monthly revenue/cost forecasts, break-even analysis,
// payback period, and market capture projections.
// Feeds into the professional valuation dashboard.

export interface CostStructure {
  fixedMonthly: number;
  variablePercentOfRevenue: number;
  headcount: number;
  avgSalary: number;
  marketingBudget: number;
  infraCost: number;
}

export interface ProjectionMonth {
  month: number;
  label: string;
  revenue: number;
  costs: number;
  profit: number;
  cumulativeRevenue: number;
  cumulativeCosts: number;
  cumulativeProfit: number;
  customers: number;
  mrr: number;
}

export interface ProjectionResult {
  months: ProjectionMonth[];
  breakEvenMonth: number | null;
  paybackMonths: number | null;
  projectedARR12: number;
  projectedARR24: number;
  totalRevenue12: number;
  totalRevenue24: number;
  totalCosts12: number;
  totalCosts24: number;
}

export interface ValuationMultiple {
  method: string;
  multiple: number;
  valuation: number;
  basis: string;
}

export interface MarketCaptureMonth {
  month: number;
  label: string;
  customers: number;
  tamPercent: number;
  samPercent: number;
  somPercent: number;
  revenue: number;
}

export interface MarketCaptureResult {
  months: MarketCaptureMonth[];
  tam: number;
  sam: number;
  som: number;
  somReachedMonth: number | null;
}

// ── Monthly Projection ─────────────────────────────────────────────────

export function generateMonthlyProjection(input: {
  currentMRR: number;
  monthlyGrowthRate: number;
  projectionMonths?: number;
  costs: CostStructure;
  currentCustomers?: number;
  arpu?: number;
  churnRate?: number;
}): ProjectionResult {
  const months = input.projectionMonths ?? 24;
  const growthRate = input.monthlyGrowthRate / 100;
  const churnRate = (input.churnRate ?? 5) / 100;
  const arpu = input.arpu ?? (input.currentCustomers && input.currentCustomers > 0
    ? input.currentMRR / input.currentCustomers
    : 50);

  const projections: ProjectionMonth[] = [];
  let mrr = input.currentMRR;
  let customers = input.currentCustomers ?? Math.max(1, Math.round(mrr / arpu));
  let cumulativeRevenue = 0;
  let cumulativeCosts = 0;

  const now = new Date();

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    // Growth + churn
    const newCustomers = Math.round(customers * growthRate);
    const churned = Math.round(customers * churnRate);
    customers = Math.max(0, customers + newCustomers - churned);
    mrr = customers * arpu;

    const revenue = mrr;
    const variableCosts = revenue * (input.costs.variablePercentOfRevenue / 100);
    const personnelCosts = input.costs.headcount * input.costs.avgSalary / 12;
    const totalCosts = input.costs.fixedMonthly + variableCosts + personnelCosts + input.costs.marketingBudget + input.costs.infraCost;

    cumulativeRevenue += revenue;
    cumulativeCosts += totalCosts;

    projections.push({
      month: i + 1,
      label,
      revenue: Math.round(revenue),
      costs: Math.round(totalCosts),
      profit: Math.round(revenue - totalCosts),
      cumulativeRevenue: Math.round(cumulativeRevenue),
      cumulativeCosts: Math.round(cumulativeCosts),
      cumulativeProfit: Math.round(cumulativeRevenue - cumulativeCosts),
      customers,
      mrr: Math.round(mrr),
    });
  }

  const breakEvenMonth = projections.find((p) => p.profit >= 0)?.month ?? null;
  const paybackMonth = projections.find((p) => p.cumulativeProfit >= 0)?.month ?? null;

  return {
    months: projections,
    breakEvenMonth,
    paybackMonths: paybackMonth,
    projectedARR12: projections.length >= 12 ? projections[11].mrr * 12 : projections[projections.length - 1].mrr * 12,
    projectedARR24: projections.length >= 24 ? projections[23].mrr * 12 : projections[projections.length - 1].mrr * 12,
    totalRevenue12: projections.slice(0, 12).reduce((s, p) => s + p.revenue, 0),
    totalRevenue24: projections.reduce((s, p) => s + p.revenue, 0),
    totalCosts12: projections.slice(0, 12).reduce((s, p) => s + p.costs, 0),
    totalCosts24: projections.reduce((s, p) => s + p.costs, 0),
  };
}

// ── Revenue Multiple Valuation ─────────────────────────────────────────

const SECTOR_MULTIPLES: Record<string, { low: number; mid: number; high: number }> = {
  saas: { low: 10, mid: 20, high: 40 },
  fintech: { low: 8, mid: 15, high: 30 },
  marketplace: { low: 3, mid: 6, high: 12 },
  healthtech: { low: 8, mid: 15, high: 25 },
  edtech: { low: 5, mid: 10, high: 20 },
  ecommerce: { low: 2, mid: 4, high: 8 },
  deeptech: { low: 15, mid: 25, high: 50 },
  default: { low: 5, mid: 12, high: 25 },
};

export function calculateValuationMultiples(input: {
  projectedARR: number;
  sector: string;
  stage: number;
  monthlyGrowthRate: number;
}): ValuationMultiple[] {
  const multiples = SECTOR_MULTIPLES[input.sector.toLowerCase()] ?? SECTOR_MULTIPLES.default;

  // Growth premium: +1x per 10% monthly growth rate
  const growthPremium = Math.max(0, input.monthlyGrowthRate / 10);

  // Stage premium: later stages get higher multiples
  const stagePremium = input.stage >= 5 ? 2 : input.stage >= 3 ? 1 : 0;

  return [
    {
      method: "Conservative",
      multiple: Math.round((multiples.low + growthPremium + stagePremium) * 10) / 10,
      valuation: Math.round(input.projectedARR * (multiples.low + growthPremium + stagePremium)),
      basis: `${multiples.low + growthPremium + stagePremium}x ARR (${input.sector} low + growth)`,
    },
    {
      method: "Base Case",
      multiple: Math.round((multiples.mid + growthPremium + stagePremium) * 10) / 10,
      valuation: Math.round(input.projectedARR * (multiples.mid + growthPremium + stagePremium)),
      basis: `${multiples.mid + growthPremium + stagePremium}x ARR (${input.sector} mid + growth)`,
    },
    {
      method: "Optimistic",
      multiple: Math.round((multiples.high + growthPremium + stagePremium) * 10) / 10,
      valuation: Math.round(input.projectedARR * (multiples.high + growthPremium + stagePremium)),
      basis: `${multiples.high + growthPremium + stagePremium}x ARR (${input.sector} high + growth)`,
    },
  ];
}

// ── Market Capture ─────────────────────────────────────────────────────

export function calculateMarketCapture(input: {
  tam: number;
  sam: number;
  som: number;
  currentCustomers: number;
  monthlyGrowthRate: number;
  arpu: number;
  months?: number;
}): MarketCaptureResult {
  const months = input.months ?? 24;
  const growthRate = input.monthlyGrowthRate / 100;
  const projections: MarketCaptureMonth[] = [];

  let customers = input.currentCustomers;
  let somReachedMonth: number | null = null;
  const somCustomers = input.som / (input.arpu * 12);

  const now = new Date();

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    customers = Math.round(customers * (1 + growthRate));
    const annualRevenue = customers * input.arpu * 12;

    projections.push({
      month: i + 1,
      label,
      customers,
      tamPercent: Math.round((annualRevenue / input.tam) * 10000) / 100,
      samPercent: Math.round((annualRevenue / input.sam) * 10000) / 100,
      somPercent: Math.round((annualRevenue / input.som) * 10000) / 100,
      revenue: Math.round(annualRevenue),
    });

    if (!somReachedMonth && customers >= somCustomers) {
      somReachedMonth = i + 1;
    }
  }

  return {
    months: projections,
    tam: input.tam,
    sam: input.sam,
    som: input.som,
    somReachedMonth,
  };
}

// ── Break-even & Payback helpers ───────────────────────────────────────

export function calculatePaybackPeriod(
  investmentAmount: number,
  projection: ProjectionResult,
): { months: number | null; roi: number } {
  let cumProfit = 0;
  for (const m of projection.months) {
    cumProfit += m.profit;
    if (cumProfit >= investmentAmount) {
      return { months: m.month, roi: Math.round((cumProfit / investmentAmount) * 100) };
    }
  }
  return {
    months: null,
    roi: Math.round((cumProfit / Math.max(1, investmentAmount)) * 100),
  };
}
