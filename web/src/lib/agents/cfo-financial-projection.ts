/**
 * src/lib/agents/cfo-financial-projection.ts
 *
 * Generates a 3-year P&L + cash-burn + runway schedule for the Startup
 * Package "Financial projection" deliverable. Deterministic math for the
 * number tables, `callAI()` to select approved narrative references (assumptions,
 * commentary, investor takeaways). Only deterministic sentences render. Falls back on
 * LLM failure so the PDF always renders.
 *
 * Roadmap: "Financial projection + GTM auto-fill deliverables (dedicated
 * CFO/CMO agent flow)".
 */

import { callAI } from "@/lib/ai-client";

// ── Types ────────────────────────────────────────────────────────────────

export type ProjectionStage = "pre-seed" | "seed" | "series-a" | "series-b";

export interface FinancialProjectionInput {
  startupName: string;
  stage: ProjectionStage;
  sector?: string;
  /** Monthly recurring revenue in AUD (0 for pre-revenue). */
  mrrAud?: number;
  /** Monthly cash burn in AUD (positive number). */
  monthlyBurnAud?: number;
  /** Cash-in-bank in AUD at t0. */
  cashAud?: number;
  /** Optional gross margin % override. */
  grossMarginPct?: number;
  /** Optional monthly growth % override. */
  monthlyGrowthPct?: number;
}

export interface QuarterRow {
  quarter: string; // e.g. "Y1Q1"
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  netIncome: number;
  cashBalance: number;
}

export interface FinancialProjectionOutput {
  startupName: string;
  stage: ProjectionStage;
  currency: "AUD";
  assumptions: {
    startingMrr: number;
    monthlyGrowthPct: number;
    grossMarginPct: number;
    monthlyBurn: number;
    startingCash: number;
    quarterlyOpexGrowthPct: number;
  };
  quarters: QuarterRow[];
  totals: {
    revenueY1: number;
    revenueY2: number;
    revenueY3: number;
    netY1: number;
    netY2: number;
    netY3: number;
    /** Months of runway from t0 given current burn (∞ marker = 999). */
    runwayMonths: number;
  };
  narrative: {
    assumptions: string;
    commentary: string;
    investorTakeaway: string;
  };
  sources: string[];
}

// ── Benchmarks ───────────────────────────────────────────────────────────

const STAGE_DEFAULTS: Record<
  ProjectionStage,
  {
    monthlyGrowthPct: number;
    grossMarginPct: number;
    monthlyBurnAud: number;
    startingCashAud: number;
    quarterlyOpexGrowthPct: number;
  }
> = {
  "pre-seed": {
    monthlyGrowthPct: 15,
    grossMarginPct: 55,
    monthlyBurnAud: 25_000,
    startingCashAud: 150_000,
    quarterlyOpexGrowthPct: 8,
  },
  seed: {
    monthlyGrowthPct: 12,
    grossMarginPct: 65,
    monthlyBurnAud: 80_000,
    startingCashAud: 1_200_000,
    quarterlyOpexGrowthPct: 10,
  },
  "series-a": {
    monthlyGrowthPct: 8,
    grossMarginPct: 72,
    monthlyBurnAud: 350_000,
    startingCashAud: 6_000_000,
    quarterlyOpexGrowthPct: 7,
  },
  "series-b": {
    monthlyGrowthPct: 5,
    grossMarginPct: 76,
    monthlyBurnAud: 900_000,
    startingCashAud: 15_000_000,
    quarterlyOpexGrowthPct: 5,
  },
};

const SOURCES = [
  "AVCAL / Cut Through Venture — Australian Venture Capital Report 2025",
  "OpenView — SaaS Benchmarks 2024",
  "Bessemer Venture Partners — State of the Cloud 2024",
  "SaaS Capital — Spending Benchmarks for Private B2B SaaS 2024",
];

const CFO_SYSTEM_PROMPT =
  "You are the CFO agent for BlockID.au. Select the most relevant approved " +
  "reference IDs for an Australian founder's projection narrative. Return only " +
  "the required JSON arrays. Never write prose, numbers, new IDs or changed facts.";

// ── Math ─────────────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n);
}

function buildSchedule(
  input: FinancialProjectionInput,
): {
  quarters: QuarterRow[];
  totals: FinancialProjectionOutput["totals"];
  assumptions: FinancialProjectionOutput["assumptions"];
} {
  const defaults = STAGE_DEFAULTS[input.stage];
  const startingMrr = Math.max(0, input.mrrAud ?? 0);
  const monthlyGrowthPct = input.monthlyGrowthPct ?? defaults.monthlyGrowthPct;
  const grossMarginPct = input.grossMarginPct ?? defaults.grossMarginPct;
  const monthlyBurn = Math.max(0, input.monthlyBurnAud ?? defaults.monthlyBurnAud);
  const startingCash = Math.max(0, input.cashAud ?? defaults.startingCashAud);
  const quarterlyOpexGrowthPct = defaults.quarterlyOpexGrowthPct;

  const monthlyGrowth = monthlyGrowthPct / 100;
  const gm = grossMarginPct / 100;

  // 12 quarters — Y1Q1 … Y3Q4.
  const quarters: QuarterRow[] = [];
  let cash = startingCash;
  let mrr = startingMrr;
  let opex = monthlyBurn * 3; // quarterly opex baseline

  for (let year = 1; year <= 3; year++) {
    for (let q = 1; q <= 4; q++) {
      // Compound MRR for 3 months, then quarterly revenue = sum of months.
      const m1 = mrr * Math.pow(1 + monthlyGrowth, 1);
      const m2 = mrr * Math.pow(1 + monthlyGrowth, 2);
      const m3 = mrr * Math.pow(1 + monthlyGrowth, 3);
      const revenue = m1 + m2 + m3;
      const cogs = revenue * (1 - gm);
      const grossProfit = revenue - cogs;
      const netIncome = grossProfit - opex;
      cash = cash + netIncome;
      quarters.push({
        quarter: `Y${year}Q${q}`,
        revenue: round(revenue),
        cogs: round(cogs),
        grossProfit: round(grossProfit),
        opex: round(opex),
        netIncome: round(netIncome),
        cashBalance: round(cash),
      });
      // Advance MRR to end-of-quarter for the next iteration.
      mrr = m3;
      // Opex ramps quarterly.
      opex = opex * (1 + quarterlyOpexGrowthPct / 100);
    }
  }

  const yearTotal = (year: number, key: keyof QuarterRow): number => {
    return quarters
      .filter((r) => r.quarter.startsWith(`Y${year}`))
      .reduce((acc, r) => acc + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
  };

  // Runway: months until cash <= 0 at current *net* monthly burn assuming
  // zero revenue growth. Net burn = gross opex minus gross profit contributed
  // by starting MRR — this matches how VCs quote runway for revenue-positive
  // startups. Pre-revenue (startingMrr = 0) collapses back to gross burn.
  const netMonthlyBurn = Math.max(0, monthlyBurn - startingMrr * gm);
  const runwayMonths =
    netMonthlyBurn > 0
      ? Math.floor(startingCash / netMonthlyBurn)
      : 999;

  return {
    quarters,
    totals: {
      revenueY1: round(yearTotal(1, "revenue")),
      revenueY2: round(yearTotal(2, "revenue")),
      revenueY3: round(yearTotal(3, "revenue")),
      netY1: round(yearTotal(1, "netIncome")),
      netY2: round(yearTotal(2, "netIncome")),
      netY3: round(yearTotal(3, "netIncome")),
      runwayMonths: Math.min(999, Math.max(0, runwayMonths)),
    },
    assumptions: {
      startingMrr,
      monthlyGrowthPct,
      grossMarginPct,
      monthlyBurn,
      startingCash,
      quarterlyOpexGrowthPct,
    },
  };
}

// ── Narrative (LLM + fallback) ───────────────────────────────────────────

type Narrative = FinancialProjectionOutput["narrative"];
type NarrativeCatalog = Record<keyof Narrative, Record<string, string>>;

/** Complete sentences keep each value bound to its metric, unit and period.
 * AI selects references only; no generated prose reaches the report.
 */
function narrativeCatalog(
  input: FinancialProjectionInput,
  totals: FinancialProjectionOutput["totals"],
  assumptions: FinancialProjectionOutput["assumptions"],
): NarrativeCatalog {
  const aud = (value: number) => `A$${value.toLocaleString("en-AU", { maximumFractionDigits: 20 })}`;
  const netBurn = assumptions.monthlyBurn - assumptions.startingMrr * assumptions.grossMarginPct / 100;
  const runway = netBurn <= 0
    ? "Starting monthly gross profit covers monthly opex, so no finite runway is calculated at that unchanged rate. This does not guarantee future cash sufficiency."
    : `At starting net monthly burn, cash covers ${totals.runwayMonths === 999 ? "at least " : ""}${totals.runwayMonths} months; this static estimate excludes subsequent growth and opex changes.`;
  return {
    assumptions: {
      growth: `The model assumes ${assumptions.monthlyGrowthPct}% monthly revenue growth and ${assumptions.grossMarginPct}% gross margin.`,
      costs: `Monthly opex starts at ${aud(assumptions.monthlyBurn)} and grows ${assumptions.quarterlyOpexGrowthPct}% per quarter.`,
      opening: `Starting MRR is ${aud(assumptions.startingMrr)} and starting cash is ${aud(assumptions.startingCash)}.`,
    },
    commentary: {
      revenue: `${input.startupName} has projected revenue of ${aud(totals.revenueY1)} in Year 1, ${aud(totals.revenueY2)} in Year 2 and ${aud(totals.revenueY3)} in Year 3.`,
      net: `Projected net results are ${aud(totals.netY1)} in Year 1, ${aud(totals.netY2)} in Year 2 and ${aud(totals.netY3)} in Year 3.`,
      runway,
    },
    investorTakeaway: {
      assumptions: "These are conditional model outputs, not verified forecasts. Validate the growth, margin and expense assumptions against operating evidence.",
      cash: "Review the quarterly cash balances and funding needs under downside assumptions before making a financing decision.",
    },
  };
}

function renderReferences(parsed: unknown, catalog: NarrativeCatalog): Narrative | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const sections = Object.keys(catalog) as (keyof Narrative)[];
  if (Object.keys(parsed).length !== sections.length) return null;
  const result = {} as Narrative;
  for (const section of sections) {
    const ids = (parsed as Record<string, unknown>)[section];
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > Object.keys(catalog[section]).length) return null;
    if (new Set(ids).size !== ids.length) return null;
    if (!ids.every((id): id is string => typeof id === "string" && Object.hasOwn(catalog[section], id))) return null;
    result[section] = ids.map(id => catalog[section][id]).join(" ");
  }
  return result;
}

async function llmNarrative(
  input: FinancialProjectionInput,
  totals: FinancialProjectionOutput["totals"],
  assumptions: FinancialProjectionOutput["assumptions"],
): Promise<Narrative> {
  const catalog = narrativeCatalog(input, totals, assumptions);
  const fallback = Object.fromEntries(
    Object.entries(catalog).map(([section, references]) => [section, Object.values(references).join(" ")]),
  ) as Narrative;
  const user =
    `Stage: ${input.stage}\n` +
    `Approved references by section:\n${JSON.stringify(catalog)}\n` +
    `Return a JSON object with exactly assumptions, commentary and investorTakeaway. ` +
    `Each value must be a non-empty array of unique reference IDs from that section. ` +
    `Select only relevant references; do not change their meaning. No prose or extra fields. ` +
    `Example: {"assumptions":["growth","opening"],"commentary":["revenue","runway"],"investorTakeaway":["assumptions"]}`;

  try {
    const result = await callAI({
      providerPolicy: "deepinfra-only",
      system: CFO_SYSTEM_PROMPT,
      user,
      maxTokens: 1500,
      temperature: 0.3,
    });
    return renderReferences(JSON.parse(result.text.trim()), catalog) ?? fallback;
  } catch {
    return fallback;
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export async function generateFinancialProjection(
  input: FinancialProjectionInput,
): Promise<FinancialProjectionOutput> {
  const { quarters, totals, assumptions } = buildSchedule(input);
  const narrative = await llmNarrative(input, totals, assumptions);
  return {
    startupName: input.startupName,
    stage: input.stage,
    currency: "AUD",
    assumptions,
    quarters,
    totals,
    narrative,
    sources: SOURCES,
  };
}
